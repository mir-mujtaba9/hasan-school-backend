const pool = require('../config/db');

const ensureSalarySchema = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Ensure we are operating in the expected schema.
    await client.query('SET search_path TO public');

    // 1) Ensure enum type exists
    await client.query(
      `DO $$
       BEGIN
         CREATE TYPE public.salary_status AS ENUM ('Paid', 'Payable');
       EXCEPTION
         WHEN duplicate_object THEN NULL;
       END $$;`
    );

    // 2) Ensure status column exists
    const statusColumn = await client.query(
      `SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'salary_records'
         AND column_name = 'status'
       LIMIT 1`
    );

    if (statusColumn.rowCount === 0) {
      await client.query(
        `ALTER TABLE public.salary_records
         ADD COLUMN status public.salary_status NOT NULL DEFAULT 'Paid'`
      );
    }

    // 3) Allow payable records without payment details
    // (Only applies if still NOT NULL)
    const nullability = await client.query(
      `SELECT column_name, is_nullable
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'salary_records'
         AND column_name IN ('payment_date', 'payment_method')`
    );

    for (const row of nullability.rows || []) {
      if (row.is_nullable === 'NO') {
        await client.query(
          `ALTER TABLE public.salary_records
           ALTER COLUMN ${row.column_name} DROP NOT NULL`
        );
      }
    }

    await client.query('COMMIT');
    return { ok: true };
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[db-migrate] ensureSalarySchema failed:', err);
    return { ok: false, error: err.message };
  } finally {
    client.release();
  }
};

module.exports = {
  ensureSalarySchema,
};
