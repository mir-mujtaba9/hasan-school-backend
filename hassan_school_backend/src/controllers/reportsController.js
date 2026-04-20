const pool = require('../config/db');

const BALANCE_SHEET_CACHE_TTL_SECONDS = Number(process.env.BALANCE_SHEET_CACHE_TTL_SECONDS || 30);
const balanceSheetCache = new Map();

const monthMap = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
};

const monthNameFromNumber = (n) => {
  const names = [
    'January','February','March','April','May','June',
    'July','August','September','October','November','December'
  ];
  return names[n-1] || null;
};

const parseMonth = (value) => {
  if (value === undefined || value === null || value === '') return null;

  if (typeof value === 'number') {
    if (value >= 1 && value <= 12) return value;
    return null;
  }

  const trimmed = String(value).trim();
  if (!trimmed) return null;

  const asNumber = Number(trimmed);
  if (Number.isFinite(asNumber)) {
    if (asNumber >= 1 && asNumber <= 12) return asNumber;
    return null;
  }

  const normalized = trimmed.toLowerCase();
  return monthMap[normalized] || null;
};

const getMonthDateRange = (year, month) => {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
};

const balanceSheet = async (req, res) => {
  const { month, year } = req.query;

  const monthNumber = parseMonth(month);
  if (month === undefined || monthNumber === null) {
    return res.status(400).json({ error: 'Invalid or missing month. Use 1-12 or month name.' });
  }

  const yearNumber = year ? Number(year) : null;
  if (!year || !Number.isInteger(yearNumber) || yearNumber < 2000 || yearNumber > 2100) {
    return res.status(400).json({ error: 'Invalid or missing year' });
  }

  const cacheKey = `${yearNumber}-${monthNumber}`;
  const now = Date.now();
  const cached = balanceSheetCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    res.set('X-Cache', 'HIT');
    return res.json(cached.data);
  }

  const { startDate, endDate } = getMonthDateRange(yearNumber, monthNumber);

  const client = await pool.connect();

  try {
    await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');

    // Income aggregates from fee_records for the period
    const incomeResult = await client.query(
      `SELECT
         COALESCE(SUM(total_due)::numeric,0) AS total_expected,
         COALESCE(SUM(paid_amount)::numeric,0) AS total_collected,
         COALESCE(SUM(balance_remaining)::numeric,0) AS total_due
       FROM fee_records
       WHERE month = $1 AND year = $2`,
      [monthNumber, yearNumber]
    );

    const incomeRow = incomeResult.rows[0] || { total_expected: 0, total_collected: 0, total_due: 0 };

    // Income by class group (class name)
    const byClassResult = await client.query(
      `SELECT c.name AS label,
              COUNT(fr.student_id) AS count,
              COALESCE(SUM(fr.monthly_fee)::numeric,0) AS expected,
              COALESCE(SUM(fr.paid_amount)::numeric,0) AS collected,
              COALESCE(SUM(fr.balance_remaining)::numeric,0) AS due
       FROM fee_records fr
       JOIN students s ON fr.student_id = s.id
       LEFT JOIN classes c ON s.class_id = c.id
       WHERE fr.month = $1 AND fr.year = $2
       GROUP BY c.id, c.name
       ORDER BY c.name`,
      [monthNumber, yearNumber]
    );

    // Expenses: salaries and other expenses
    const salaryTotalResult = await client.query(
      `SELECT COALESCE(SUM(amount)::numeric,0) AS salaries_total FROM salary_records WHERE month = $1 AND year = $2`,
      [monthNumber, yearNumber]
    );
    const salariesTotal = Number(salaryTotalResult.rows[0].salaries_total || 0);

    const salariesPaidResult = await client.query(
      `SELECT COALESCE(SUM(amount)::numeric,0) AS salaries_paid FROM salary_records WHERE month = $1 AND year = $2 AND status = 'Paid'`,
      [monthNumber, yearNumber]
    );
    const salariesPaid = Number(salariesPaidResult.rows[0].salaries_paid || 0);
    const salariesPending = Math.max(0, salariesTotal - salariesPaid);

    const otherExpensesResult = await client.query(
      `SELECT COALESCE(SUM(amount)::numeric,0) AS other_expenses
       FROM expenses
       WHERE date >= $1 AND date < $2
         AND (category IS NULL OR category <> 'Salary')`,
      [startDate, endDate]
    );
    const otherExpenses = Number(otherExpensesResult.rows[0].other_expenses || 0);

    const byCategoryResult = await client.query(
      `SELECT category, COUNT(*) AS entries, COALESCE(SUM(amount)::numeric,0) AS total
       FROM expenses
       WHERE date >= $1 AND date < $2
       GROUP BY category
       ORDER BY total DESC`,
      [startDate, endDate]
    );

    const totalCollected = Number(incomeRow.total_collected || 0);

    const netBalance = Number(totalCollected - (salariesPaid + otherExpenses));

    const response = {
      month: monthNameFromNumber(monthNumber),
      year: yearNumber,
      income: {
        totalExpected: Number(incomeRow.total_expected || 0),
        totalCollected: Number(incomeRow.total_collected || 0),
        totalDue: Number(incomeRow.total_due || 0),
        byClassGroup: byClassResult.rows.map((r) => ({
          label: r.label || 'Unassigned',
          count: Number(r.count || 0),
          expected: Number(r.expected || 0),
          collected: Number(r.collected || 0),
          due: Number(r.due || 0),
        })),
      },
      expenses: {
        salariesTotal: salariesTotal,
        salariesPaid: salariesPaid,
        salariesPending: salariesPending,
        otherExpenses: otherExpenses,
        byCategory: byCategoryResult.rows.map((r) => ({
          category: r.category || 'Uncategorized',
          entries: Number(r.entries || 0),
          total: Number(r.total || 0),
        })),
      },
      netBalance: netBalance,
    };

    await client.query('COMMIT');

    if (BALANCE_SHEET_CACHE_TTL_SECONDS > 0) {
      balanceSheetCache.set(cacheKey, {
        data: response,
        expiresAt: now + (BALANCE_SHEET_CACHE_TTL_SECONDS * 1000),
      });
    }

    res.set('X-Cache', 'MISS');

    return res.json(response);
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      console.error('Balance sheet rollback error:', rollbackErr);
    }
    console.error('Balance sheet error:', err);
    return res.status(500).json({ error: 'Failed to compute balance sheet' });
  } finally {
    client.release();
  }
};

module.exports = {
  balanceSheet,
};
