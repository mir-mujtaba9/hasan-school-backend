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

const computeStatus = (totalDue, paidAmount) => {
  if (paidAmount <= 0) return 'Unpaid';
  if (paidAmount >= totalDue) return 'Paid';
  return 'Partial';
};

const getPrevBalance = async (client, studentId) => {
  const prevResult = await client.query(
    `SELECT balance_remaining
     FROM fee_records
     WHERE student_id = $1
     ORDER BY year DESC, month DESC, created_at DESC
     LIMIT 1`,
    [studentId]
  );

  if (prevResult.rowCount === 0) return 0;
  return parseFloat(prevResult.rows[0].balance_remaining) || 0;
};

const getStudentMonthlyFee = async (client, studentId) => {
  const studentResult = await client.query(
    'SELECT discounted_fee FROM students WHERE id = $1',
    [studentId]
  );

  if (studentResult.rowCount === 0) return null;
  return parseFloat(studentResult.rows[0].discounted_fee);
};

const generateReceiptNumber = async (client, year) => {
  const likeValue = `RCP-${year}-%`;
  const result = await client.query(
    `SELECT COALESCE(MAX(CAST(split_part(receipt_number, '-', 3) AS INT)), 0) AS max_seq
     FROM fee_records
     WHERE receipt_number LIKE $1`,
    [likeValue]
  );

  const maxSeq = parseInt(result.rows[0].max_seq, 10) || 0;
  const nextSeq = maxSeq + 1;
  return `RCP-${year}-${String(nextSeq).padStart(3, '0')}`;
};

const listFees = async (req, res) => {
  const { month, year, studentId } = req.query;

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

    if (studentId) {
      whereConditions.push(`student_id = $${paramIndex}`);
      params.push(studentId);
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
       FROM fee_records
       ${whereClause}
       ORDER BY year DESC, month DESC, created_at DESC`,
      params
    );

    res.json({ data: result.rows });
  } catch (err) {
    console.error('List fees error:', err);
    res.status(500).json({ error: 'Failed to fetch fee records' });
  }
};

const createFee = async (req, res) => {
  const {
    studentId,
    month,
    year,
    paidAmount,
    paymentDate,
    paymentMethod,
    notes,
  } = req.body || {};

  if (!studentId || !month || !year || paidAmount === undefined) {
    return res.status(400).json({
      error: 'Missing required fields: studentId, month, year, paidAmount',
    });
  }

  const monthNumber = parseMonth(month);
  if (monthNumber === null) {
    return res.status(400).json({ error: 'Invalid month. Use 1-12 or month name.' });
  }

  const yearNumber = Number(year);
  if (!Number.isFinite(yearNumber)) {
    return res.status(400).json({ error: 'Invalid year' });
  }

  const paidAmountNumber = Number(paidAmount);
  if (!Number.isFinite(paidAmountNumber) || paidAmountNumber < 0) {
    return res.status(400).json({ error: 'paidAmount must be a non-negative number' });
  }

  const validPaymentMethods = ['Cash', 'Bank Transfer', 'Online', 'Cheque'];
  if (paymentMethod && !validPaymentMethods.includes(paymentMethod)) {
    return res.status(400).json({
      error: `Invalid paymentMethod. Must be one of: ${validPaymentMethods.join(', ')}`,
    });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const monthlyFee = await getStudentMonthlyFee(client, studentId);
    if (monthlyFee === null) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Student not found' });
    }

    const prevBalance = await getPrevBalance(client, studentId);
    const totalDue = monthlyFee + prevBalance;
    const balanceRemaining = Math.max(0, totalDue - paidAmountNumber);
    const status = computeStatus(totalDue, paidAmountNumber);

    let receiptNumber = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      receiptNumber = await generateReceiptNumber(client, yearNumber);
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
          ) RETURNING *`,
          [
            studentId,
            monthNumber,
            yearNumber,
            monthlyFee,
            prevBalance,
            totalDue,
            paidAmountNumber,
            balanceRemaining,
            status,
            paymentDate || null,
            paymentMethod || null,
            receiptNumber,
            notes || null,
          ]
        );

        await client.query('COMMIT');
        return res.status(201).json({
          message: 'Fee record created successfully',
          fee: insertResult.rows[0],
        });
      } catch (err) {
        if (err.code !== '23505') {
          throw err;
        }
      }
    }

    await client.query('ROLLBACK');
    return res.status(409).json({ error: 'Failed to generate unique receipt number' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Create fee error:', err);

    if (err.code === '23503') {
      return res.status(400).json({ error: 'Invalid studentId' });
    }

    if (err.code === '23505') {
      return res.status(409).json({ error: 'Fee record already exists for this period' });
    }

    return res.status(500).json({ error: 'Failed to create fee record' });
  } finally {
    client.release();
  }
};

const updateFee = async (req, res) => {
  const { id } = req.params;
  const { paidAmount, paymentDate, paymentMethod, notes } = req.body || {};

  if (!paidAmount && !paymentDate && !paymentMethod && notes === undefined) {
    return res.status(400).json({ error: 'Nothing to update' });
  }

  const paidAmountNumber = paidAmount !== undefined ? Number(paidAmount) : null;
  if (paidAmount !== undefined && (!Number.isFinite(paidAmountNumber) || paidAmountNumber < 0)) {
    return res.status(400).json({ error: 'paidAmount must be a non-negative number' });
  }

  const validPaymentMethods = ['Cash', 'Bank Transfer', 'Online', 'Cheque'];
  if (paymentMethod && !validPaymentMethods.includes(paymentMethod)) {
    return res.status(400).json({
      error: `Invalid paymentMethod. Must be one of: ${validPaymentMethods.join(', ')}`,
    });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const existingResult = await client.query(
      'SELECT * FROM fee_records WHERE id = $1',
      [id]
    );

    if (existingResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Fee record not found' });
    }

    const existing = existingResult.rows[0];
    const newPaidAmount = paidAmountNumber !== null
      ? parseFloat(existing.paid_amount) + paidAmountNumber
      : parseFloat(existing.paid_amount);

    const totalDue = parseFloat(existing.total_due);
    const balanceRemaining = Math.max(0, totalDue - newPaidAmount);
    const status = computeStatus(totalDue, newPaidAmount);

    const updateResult = await client.query(
      `UPDATE fee_records
       SET paid_amount = $1,
           balance_remaining = $2,
           status = $3,
           payment_date = COALESCE($4, payment_date),
           payment_method = COALESCE($5, payment_method),
           notes = COALESCE($6, notes)
       WHERE id = $7
       RETURNING *`,
      [
        newPaidAmount,
        balanceRemaining,
        status,
        paymentDate || null,
        paymentMethod || null,
        notes || null,
        id,
      ]
    );

    await client.query('COMMIT');
    return res.json({
      message: 'Fee record updated successfully',
      fee: updateResult.rows[0],
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Update fee error:', err);
    return res.status(500).json({ error: 'Failed to update fee record' });
  } finally {
    client.release();
  }
};

const deleteFee = async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query('DELETE FROM fee_records WHERE id = $1 RETURNING id', [id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Fee record not found' });
    }
    res.json({ message: 'Fee record deleted successfully', id: result.rows[0].id });
  } catch (err) {
    console.error('Delete fee error:', err);
    res.status(500).json({ error: 'Failed to delete fee record' });
  }
};

module.exports = {
  listFees,
  createFee,
  updateFee,
  deleteFee,
};
