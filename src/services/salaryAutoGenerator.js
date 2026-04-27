const cron = require('node-cron');
const pool = require('../config/db');

const parsePositiveInt = (value, fallback) => {
  const asNumber = Number(value);
  if (!Number.isFinite(asNumber)) return fallback;
  const asInt = Math.floor(asNumber);
  if (asInt <= 0) return fallback;
  return asInt;
};

const isLastDayOfMonth = (date) => {
  const tomorrow = new Date(date);
  tomorrow.setDate(date.getDate() + 1);
  return tomorrow.getMonth() !== date.getMonth();
};

const getPeriodForDate = (date) => {
  return {
    month: date.getMonth() + 1,
    year: date.getFullYear(),
  };
};

const getPreviousMonthPeriod = (date) => {
  const d = new Date(date);
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return getPeriodForDate(d);
};

const hasMissingSalaryRecordsForPeriod = async ({ month, year }) => {
  const result = await pool.query(
    `SELECT COUNT(*)::int AS missing_count
     FROM staff_members sm
     LEFT JOIN salary_records sr
       ON sr.staff_id = sm.id
      AND sr.month = $1
      AND sr.year = $2
     WHERE sm.status = 'Active'
       AND sr.id IS NULL`,
    [month, year]
  );

  return (result.rows?.[0]?.missing_count || 0) > 0;
};

const generatePayableSalariesForPeriod = async ({ month, year }) => {
  // Create one Payable salary record per active staff member for the period.
  // Idempotent due to unique (staff_id, month, year).
  const result = await pool.query(
    `INSERT INTO salary_records (
      staff_id, month, year, amount,
      payment_date, payment_method,
      receipt_number, notes, status
    )
    SELECT
      sm.id,
      $1,
      $2,
      sm.monthly_salary,
      NULL,
      NULL,
      NULL,
      'Auto-generated salary payable',
      'Payable'
    FROM staff_members sm
    WHERE sm.status = 'Active'
    ON CONFLICT (staff_id, month, year) DO NOTHING`,
    [month, year]
  );

  return { created: result.rowCount || 0 };
};

const maybeGeneratePayableSalaries = async ({ today = new Date() } = {}) => {
  const enabled = String(process.env.SALARY_AUTOGEN_ENABLED || 'true').toLowerCase() !== 'false';
  if (!enabled) return { ran: false, reason: 'disabled' };

  const catchupDays = parsePositiveInt(process.env.SALARY_AUTOGEN_CATCHUP_DAYS, 3);

  let period = null;

  if (isLastDayOfMonth(today)) {
    period = getPeriodForDate(today);
  } else {
    // catch-up: within first N days of month, generate for previous month if missing
    const day = today.getDate();
    if (day > catchupDays) return { ran: false, reason: 'not_last_day_or_catchup' };

    const prev = getPreviousMonthPeriod(today);
    const missing = await hasMissingSalaryRecordsForPeriod(prev);
    if (!missing) return { ran: false, reason: 'no_missing_records', ...prev };

    period = prev;
  }

  const { created } = await generatePayableSalariesForPeriod(period);
  return { ran: true, ...period, created };
};

let scheduledTask = null;

const initSalaryAutoGenerator = () => {
  const enabled = String(process.env.SALARY_AUTOGEN_ENABLED || 'true').toLowerCase() !== 'false';
  if (!enabled) {
    console.log('[salary-autogen] Disabled (SALARY_AUTOGEN_ENABLED=false)');
    return;
  }

  // Run once on startup (safe + idempotent)
  maybeGeneratePayableSalaries().then(
    (result) => {
      if (result.ran) {
        console.log(
          `[salary-autogen] Generated payable salaries for ${result.month}/${result.year}: created=${result.created}`
        );
      } else {
        console.log(`[salary-autogen] Skipped: ${result.reason}`);
      }
    },
    (err) => console.error('[salary-autogen] Startup run failed:', err)
  );

  const cronExpr = process.env.SALARY_AUTOGEN_CRON || '15 0 * * *'; // daily 00:15
  scheduledTask = cron.schedule(cronExpr, () => {
    maybeGeneratePayableSalaries().then(
      (result) => {
        if (result.ran) {
          console.log(
            `[salary-autogen] Generated payable salaries for ${result.month}/${result.year}: created=${result.created}`
          );
        } else {
          console.log(`[salary-autogen] Skipped: ${result.reason}`);
        }
      },
      (err) => console.error('[salary-autogen] Scheduled run failed:', err)
    );
  });

  console.log(`[salary-autogen] Scheduled with cron: ${cronExpr}`);

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
  initSalaryAutoGenerator,
  maybeGeneratePayableSalaries,
  generatePayableSalariesForPeriod,
};
