const cron = require('node-cron');
const pool = require('../config/db');

const parsePositiveInt = (value, fallback) => {
  const asNumber = Number(value);
  if (!Number.isFinite(asNumber)) return fallback;
  const asInt = Math.floor(asNumber);
  if (asInt <= 0) return fallback;
  return asInt;
};

const getPeriodForToday = (today) => {
  const month = today.getMonth() + 1; // 1-12
  const year = today.getFullYear();
  return { month, year };
};

const getMaxReceiptSeqForYear = async (client, year) => {
  const likeValue = `RCP-${year}-%`;
  const result = await client.query(
    `SELECT COALESCE(MAX(CAST(split_part(receipt_number, '-', 3) AS INT)), 0) AS max_seq
     FROM fee_records
     WHERE receipt_number LIKE $1`,
    [likeValue]
  );

  return parseInt(result.rows?.[0]?.max_seq, 10) || 0;
};

const hasMissingFeeRecordsForPeriod = async ({ month, year }) => {
  const result = await pool.query(
    `SELECT COUNT(*)::int AS missing_count
     FROM students s
     LEFT JOIN fee_records fr
       ON fr.student_id = s.id
      AND fr.month = $1
      AND fr.year = $2
     WHERE s.status = 'Active'
       AND fr.id IS NULL`,
    [month, year]
  );

  return (result.rows?.[0]?.missing_count || 0) > 0;
};

const generateMonthlyFeeRecordsForPeriod = async ({ month, year }) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const missingStudentsResult = await client.query(
      `SELECT
         s.id AS student_id,
         s.discounted_fee::numeric AS monthly_fee,
         COALESCE((
           SELECT fr2.balance_remaining
           FROM fee_records fr2
           WHERE fr2.student_id = s.id
           ORDER BY fr2.year DESC, fr2.month DESC, fr2.created_at DESC
           LIMIT 1
         ), 0) AS prev_balance
       FROM students s
       LEFT JOIN fee_records fr
         ON fr.student_id = s.id
        AND fr.month = $1
        AND fr.year = $2
       WHERE s.status = 'Active'
         AND fr.id IS NULL
       ORDER BY s.created_at ASC`,
      [month, year]
    );

    const missingRows = missingStudentsResult.rows || [];
    if (missingRows.length === 0) {
      await client.query('COMMIT');
      return { created: 0, skipped: 0 };
    }

    let receiptSeq = (await getMaxReceiptSeqForYear(client, year)) + 1;

    let created = 0;
    let skipped = 0;

    for (const row of missingRows) {
      const studentId = row.student_id;
      const monthlyFee = Number(row.monthly_fee);
      const prevBalance = Number(row.prev_balance) || 0;

      if (!Number.isFinite(monthlyFee) || monthlyFee < 0) {
        skipped++;
        continue;
      }

      const totalDue = monthlyFee + prevBalance;
      const paidAmount = 0;
      const balanceRemaining = totalDue;
      const status = 'Unpaid';

      let inserted = false;
      for (let attempt = 0; attempt < 2; attempt++) {
        const receiptNumber = `RCP-${year}-${String(receiptSeq).padStart(3, '0')}`;

        try {
          const insertResult = await client.query(
            `INSERT INTO fee_records (
              student_id, month, year, monthly_fee, prev_balance, total_due,
              paid_amount, balance_remaining, status, payment_date, payment_method,
              receipt_number, notes
            ) VALUES (
              $1, $2, $3, $4, $5, $6,
              $7, $8, $9, $10, $11,
              $12, $13
            )`,
            [
              studentId,
              month,
              year,
              monthlyFee,
              prevBalance,
              totalDue,
              paidAmount,
              balanceRemaining,
              status,
              null,
              null,
              receiptNumber,
              'Auto-generated monthly fee record',
            ]
          );

          receiptSeq++;
          created++;
          inserted = true;
          break;
        } catch (err) {
          // Unique violation: either the fee record already exists for this period
          // or the receipt_number collided. In both cases, retry once by refreshing
          // the max receipt seq (only helps receipt collisions).
          if (err.code === '23505') {
            // If it's a period-unique collision, just skip.
            if (String(err.constraint || '').includes('unique_fee_record_per_period')) {
              skipped++;
              inserted = true;
              break;
            }

            const maxSeq = await getMaxReceiptSeqForYear(client, year);
            receiptSeq = Math.max(receiptSeq, maxSeq + 1);
            continue;
          }

          throw err;
        }
      }

      if (!inserted) skipped++;
    }

    await client.query('COMMIT');
    return { created, skipped };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

const maybeGenerateMonthlyFeeRecords = async ({ today = new Date() } = {}) => {
  const enabled = String(process.env.FEE_AUTOGEN_ENABLED || 'true').toLowerCase() !== 'false';
  if (!enabled) return { ran: false, reason: 'disabled' };

  const catchupDays = parsePositiveInt(process.env.FEE_AUTOGEN_CATCHUP_DAYS, 3);

  const { month, year } = getPeriodForToday(today);
  const day = today.getDate();

  // Intended: run on the 1st of the month.
  // Safe catch-up: if server was down on the 1st, still generate within first N days
  // but only if there are missing records.
  if (day !== 1) {
    if (day > catchupDays) return { ran: false, reason: 'outside_catchup_window', month, year };

    const missing = await hasMissingFeeRecordsForPeriod({ month, year });
    if (!missing) return { ran: false, reason: 'no_missing_records', month, year };
  }

  const { created, skipped } = await generateMonthlyFeeRecordsForPeriod({ month, year });
  return { ran: true, month, year, created, skipped };
};

let scheduledTask = null;

const initFeeAutoGenerator = () => {
  const enabled = String(process.env.FEE_AUTOGEN_ENABLED || 'true').toLowerCase() !== 'false';
  if (!enabled) {
    console.log('[fee-autogen] Disabled (FEE_AUTOGEN_ENABLED=false)');
    return;
  }

  // Run once on startup (safe + idempotent)
  maybeGenerateMonthlyFeeRecords().then(
    (result) => {
      if (result.ran) {
        console.log(
          `[fee-autogen] Generated fee records for ${result.month}/${result.year}: created=${result.created}, skipped=${result.skipped}`
        );
      } else {
        console.log(`[fee-autogen] Skipped: ${result.reason}`);
      }
    },
    (err) => {
      console.error('[fee-autogen] Startup run failed:', err);
    }
  );

  const cronExpr = process.env.FEE_AUTOGEN_CRON || '10 0 * * *'; // daily 00:10

  scheduledTask = cron.schedule(cronExpr, () => {
    maybeGenerateMonthlyFeeRecords().then(
      (result) => {
        if (result.ran) {
          console.log(
            `[fee-autogen] Generated fee records for ${result.month}/${result.year}: created=${result.created}, skipped=${result.skipped}`
          );
        } else {
          console.log(`[fee-autogen] Skipped: ${result.reason}`);
        }
      },
      (err) => {
        console.error('[fee-autogen] Scheduled run failed:', err);
      }
    );
  });

  console.log(`[fee-autogen] Scheduled with cron: ${cronExpr}`);

  const stop = () => {
    if (scheduledTask) {
      scheduledTask.stop();
      scheduledTask = null;
    }
  };

  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
};

module.exports = {
  initFeeAutoGenerator,
  maybeGenerateMonthlyFeeRecords,
  generateMonthlyFeeRecordsForPeriod,
};
