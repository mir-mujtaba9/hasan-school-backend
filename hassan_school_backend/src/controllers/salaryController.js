const pool = require('../config/db');

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

const isValidDateString = (value) => {
  if (!value) return false;
  const d = new Date(value);
  return !Number.isNaN(d.getTime());
};

const generateSalaryReceiptNumber = async (client, year) => {
  const likeValue = `SAL-${year}-%`;
  const result = await client.query(
    `SELECT COALESCE(MAX(CAST(split_part(receipt_number, '-', 3) AS INT)), 0) AS max_seq
     FROM salary_records
     WHERE receipt_number LIKE $1`,
    [likeValue]
  );

  const maxSeq = parseInt(result.rows?.[0]?.max_seq, 10) || 0;
  const nextSeq = maxSeq + 1;
  return `SAL-${year}-${String(nextSeq).padStart(3, '0')}`;
};

const listSalaries = async (req, res) => {
  const { staffId, month, year } = req.query;

  const monthNumber = parseMonth(month);
  if (month !== undefined && monthNumber === null) {
    return res.status(400).json({ error: 'Invalid month. Use 1-12 or month name.' });
  }

  const yearNumber = year ? Number(year) : null;
  if (year && !Number.isFinite(yearNumber)) {
    return res.status(400).json({ error: 'Invalid year' });
  }

  try {
    const whereConditions = [];
    const params = [];
    let paramIndex = 1;

    if (staffId) {
      whereConditions.push(`staff_id = $${paramIndex}`);
      params.push(staffId);
      paramIndex++;
    }

    if (monthNumber !== null) {
      whereConditions.push(`month = $${paramIndex}`);
      params.push(monthNumber);
      paramIndex++;
    }

    if (yearNumber !== null) {
      whereConditions.push(`year = $${paramIndex}`);
      params.push(yearNumber);
      paramIndex++;
    }

    const whereClause = whereConditions.length ? `WHERE ${whereConditions.join(' AND ')}` : '';

    const result = await pool.query(
      `SELECT *
       FROM salary_records
       ${whereClause}
       ORDER BY year DESC, month DESC, created_at DESC`,
      params
    );

    const data = (result.rows || []).map((row) => ({
      ...row,
      // A salary record is a payment record, so treat it as paid.
      status: row.status ?? 'Paid',
    }));

    return res.json({ data });
  } catch (err) {
    console.error('List salaries error:', err);
    return res.status(500).json({ error: 'Failed to fetch salary records' });
  }
};

const createSalary = async (req, res) => {
  const {
    staffId,
    month,
    year,
    amount,
    paymentDate,
    paymentMethod,
    notes,
  } = req.body || {};

  const missing = [];
  if (!staffId) missing.push('staffId');
  if (!month) missing.push('month');
  if (!year) missing.push('year');
  if (amount === undefined || amount === null || amount === '') missing.push('amount');
  if (!paymentDate) missing.push('paymentDate');
  if (!paymentMethod) missing.push('paymentMethod');

  if (missing.length) {
    return res.status(400).json({ error: `Missing required fields: ${missing.join(', ')}` });
  }

  const monthNumber = parseMonth(month);
  if (monthNumber === null) {
    return res.status(400).json({ error: 'Invalid month. Use 1-12 or month name.' });
  }

  const yearNumber = Number(year);
  if (!Number.isFinite(yearNumber)) {
    return res.status(400).json({ error: 'Invalid year' });
  }

  const amountNumber = Number(amount);
  if (!Number.isFinite(amountNumber) || amountNumber < 0) {
    return res.status(400).json({ error: 'amount must be a non-negative number' });
  }

  if (!isValidDateString(paymentDate)) {
    return res.status(400).json({ error: 'paymentDate must be a valid date' });
  }

  const validPaymentMethods = ['Cash', 'Bank Transfer', 'Online', 'Cheque'];
  if (!validPaymentMethods.includes(paymentMethod)) {
    return res.status(400).json({
      error: `Invalid paymentMethod. Must be one of: ${validPaymentMethods.join(', ')}`,
    });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const staffExists = await client.query('SELECT id FROM staff_members WHERE id = $1', [staffId]);
    if (staffExists.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Staff member not found' });
    }

    // If an auto-generated payable record already exists for this period,
    // mark it as paid instead of failing with unique constraint.
    const existingResult = await client.query(
      `SELECT id, status
       FROM salary_records
       WHERE staff_id = $1 AND month = $2 AND year = $3
       LIMIT 1`,
      [staffId, monthNumber, yearNumber]
    );

    if (existingResult.rowCount > 0) {
      const existing = existingResult.rows[0];
      const existingStatus = existing.status || 'Paid';

      if (existingStatus === 'Paid') {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'Salary record already exists for this period' });
      }

      let receiptNumber = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        receiptNumber = await generateSalaryReceiptNumber(client, yearNumber);
        try {
          const updateResult = await client.query(
            `UPDATE salary_records
             SET amount = $1,
                 payment_date = $2,
                 payment_method = $3,
                 receipt_number = $4,
                 notes = $5,
                 status = 'Paid'
             WHERE id = $6
             RETURNING *`,
            [
              amountNumber,
              paymentDate,
              paymentMethod,
              receiptNumber,
              notes || null,
              existing.id,
            ]
          );

          await client.query('COMMIT');
          return res.status(201).json({
            message: 'Salary record created successfully',
            salary: updateResult.rows[0],
          });
        } catch (err) {
          if (err.code !== '23505') throw err;
          // receipt collision; retry
        }
      }

      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Failed to generate unique receipt number' });
    }

    // Otherwise insert a new paid record
    let receiptNumber = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      receiptNumber = await generateSalaryReceiptNumber(client, yearNumber);
      try {
        const insertResult = await client.query(
          `INSERT INTO salary_records (
            staff_id, month, year, amount, payment_date, payment_method,
            receipt_number, notes, status
          ) VALUES (
            $1, $2, $3, $4, $5, $6,
            $7, $8, 'Paid'
          ) RETURNING *`,
          [
            staffId,
            monthNumber,
            yearNumber,
            amountNumber,
            paymentDate,
            paymentMethod,
            receiptNumber,
            notes || null,
          ]
        );

        await client.query('COMMIT');
        return res.status(201).json({
          message: 'Salary record created successfully',
          salary: insertResult.rows[0],
        });
      } catch (err) {
        if (err.code !== '23505') {
          throw err;
        }

        // If duplicate period for the staff member, return conflict.
        if (String(err.constraint || '').includes('unique_salary_per_period')) {
          await client.query('ROLLBACK');
          return res.status(409).json({ error: 'Salary record already exists for this period' });
        }
        // Otherwise receipt_number collision; retry.
      }
    }

    await client.query('ROLLBACK');
    return res.status(409).json({ error: 'Failed to generate unique receipt number' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Create salary error:', err);

    if (err.code === '23503') {
      return res.status(400).json({ error: 'Invalid staffId' });
    }

    return res.status(500).json({ error: 'Failed to create salary record' });
  } finally {
    client.release();
  }
};

const deleteSalary = async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query('DELETE FROM salary_records WHERE id = $1 RETURNING id', [id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Salary record not found' });

    return res.json({ message: 'Salary record deleted successfully' });
  } catch (err) {
    console.error('Delete salary error:', err);
    return res.status(500).json({ error: 'Failed to delete salary record' });
  }
};

module.exports = {
  listSalaries,
  createSalary,
  deleteSalary,
};
