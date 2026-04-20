const pool = require('../config/db');

const EXPENSE_CATEGORIES = [
  'Utilities',
  'Maintenance',
  'Supplies',
  'Transport',
  'Salary',
  'Other',
];

const PAYMENT_METHODS = ['Cash', 'Bank Transfer', 'Cheque', 'Online'];

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

const listExpenses = async (req, res) => {
  const { month, year, category } = req.query;

  const monthNumber = parseMonth(month);
  if (month !== undefined && monthNumber === null) {
    return res.status(400).json({ error: 'Invalid month. Use 1-12 or month name.' });
  }

  const yearNumber = year ? Number(year) : null;
  if (year !== undefined && (!Number.isInteger(yearNumber) || yearNumber < 2000 || yearNumber > 2100)) {
    return res.status(400).json({ error: 'Invalid year' });
  }

  let normalizedCategory = null;
  if (category !== undefined) {
    const trimmedCategory = String(category).trim();
    normalizedCategory = EXPENSE_CATEGORIES.find(
      (c) => c.toLowerCase() === trimmedCategory.toLowerCase()
    );

    if (!normalizedCategory) {
      return res.status(400).json({
        error: `Invalid category. Must be one of: ${EXPENSE_CATEGORIES.join(', ')}`,
      });
    }
  }

  try {
    const whereConditions = [];
    const params = [];
    let paramIndex = 1;

    if (monthNumber !== null) {
      whereConditions.push(`EXTRACT(MONTH FROM e.date) = $${paramIndex}`);
      params.push(monthNumber);
      paramIndex++;
    }

    if (yearNumber !== null) {
      whereConditions.push(`EXTRACT(YEAR FROM e.date) = $${paramIndex}`);
      params.push(yearNumber);
      paramIndex++;
    }

    if (normalizedCategory) {
      whereConditions.push(`e.category = $${paramIndex}`);
      params.push(normalizedCategory);
      paramIndex++;
    }

    const whereClause = whereConditions.length ? `WHERE ${whereConditions.join(' AND ')}` : '';

    const result = await pool.query(
      `SELECT e.*,
              u.full_name AS recorded_by_name
       FROM expenses e
       LEFT JOIN users u ON e.recorded_by = u.id
       ${whereClause}
       ORDER BY e.date DESC, e.created_at DESC`,
      params
    );

    return res.json({
      data: result.rows,
      expenseCategories: EXPENSE_CATEGORIES,
      paymentMethods: PAYMENT_METHODS,
    });
  } catch (err) {
    console.error('List expenses error:', err);
    return res.status(500).json({ error: 'Failed to fetch expenses' });
  }
};

const createExpense = async (req, res) => {
  const {
    date,
    category,
    description,
    amount,
    paymentMethod,
    paidTo,
    receiptRef,
    notes,
  } = req.body || {};

  const missing = [];
  if (!date) missing.push('date');
  if (!category) missing.push('category');
  if (!description) missing.push('description');
  if (amount === undefined || amount === null || amount === '') missing.push('amount');

  if (missing.length) {
    return res.status(400).json({ error: `Missing required fields: ${missing.join(', ')}` });
  }

  if (!isValidDateString(date)) {
    return res.status(400).json({ error: 'date must be a valid date' });
  }

  const normalizedCategory = EXPENSE_CATEGORIES.find(
    (c) => c.toLowerCase() === String(category).trim().toLowerCase()
  );
  if (!normalizedCategory) {
    return res.status(400).json({
      error: `Invalid category. Must be one of: ${EXPENSE_CATEGORIES.join(', ')}`,
    });
  }

  const amountNumber = Number(amount);
  if (!Number.isFinite(amountNumber) || amountNumber < 0) {
    return res.status(400).json({ error: 'amount must be a non-negative number' });
  }

  if (paymentMethod && !PAYMENT_METHODS.includes(paymentMethod)) {
    return res.status(400).json({
      error: `Invalid paymentMethod. Must be one of: ${PAYMENT_METHODS.join(', ')}`,
    });
  }

  try {
    const result = await pool.query(
      `INSERT INTO expenses (
        date, category, description, amount, payment_method,
        paid_to, receipt_ref, recorded_by, notes
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9
      )
      RETURNING *`,
      [
        date,
        normalizedCategory,
        String(description).trim(),
        amountNumber,
        paymentMethod || null,
        paidTo || null,
        receiptRef || null,
        req.user?.id || null,
        notes || null,
      ]
    );

    return res.status(201).json({
      message: 'Expense created successfully',
      expense: result.rows[0],
    });
  } catch (err) {
    console.error('Create expense error:', err);
    if (err.code === '23503') {
      return res.status(400).json({ error: 'Invalid recorded_by user' });
    }
    return res.status(500).json({ error: 'Failed to create expense' });
  }
};

const updateExpense = async (req, res) => {
  const { id } = req.params;
  const {
    date,
    category,
    description,
    amount,
    paymentMethod,
    paidTo,
    receiptRef,
    notes,
  } = req.body || {};

  const fields = {
    date,
    category,
    description,
    amount,
    paymentMethod,
    paidTo,
    receiptRef,
    notes,
  };

  const keys = Object.keys(fields).filter((key) => fields[key] !== undefined);
  if (keys.length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }

  const updates = [];
  const params = [];
  let index = 1;

  const setField = (field, value) => {
    updates.push(`${field} = $${index}`);
    params.push(value);
    index++;
  };

  if (date !== undefined) {
    if (date && !isValidDateString(date)) {
      return res.status(400).json({ error: 'date must be a valid date' });
    }
    setField('date', date || null);
  }

  if (category !== undefined) {
    const normalizedCategory = EXPENSE_CATEGORIES.find(
      (c) => c.toLowerCase() === String(category).trim().toLowerCase()
    );
    if (!normalizedCategory) {
      return res.status(400).json({
        error: `Invalid category. Must be one of: ${EXPENSE_CATEGORIES.join(', ')}`,
      });
    }
    setField('category', normalizedCategory);
  }

  if (description !== undefined) {
    if (!String(description).trim()) {
      return res.status(400).json({ error: 'description cannot be empty' });
    }
    setField('description', String(description).trim());
  }

  if (amount !== undefined) {
    const amountNumber = Number(amount);
    if (!Number.isFinite(amountNumber) || amountNumber < 0) {
      return res.status(400).json({ error: 'amount must be a non-negative number' });
    }
    setField('amount', amountNumber);
  }

  if (paymentMethod !== undefined) {
    if (paymentMethod && !PAYMENT_METHODS.includes(paymentMethod)) {
      return res.status(400).json({
        error: `Invalid paymentMethod. Must be one of: ${PAYMENT_METHODS.join(', ')}`,
      });
    }
    setField('payment_method', paymentMethod || null);
  }

  if (paidTo !== undefined) setField('paid_to', paidTo || null);
  if (receiptRef !== undefined) setField('receipt_ref', receiptRef || null);
  if (notes !== undefined) setField('notes', notes || null);

  params.push(id);

  try {
    const result = await pool.query(
      `UPDATE expenses
       SET ${updates.join(', ')}
       WHERE id = $${index}
       RETURNING *`,
      params
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Expense not found' });
    }

    return res.json({
      message: 'Expense updated successfully',
      expense: result.rows[0],
    });
  } catch (err) {
    console.error('Update expense error:', err);
    return res.status(500).json({ error: 'Failed to update expense' });
  }
};

const deleteExpense = async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query('DELETE FROM expenses WHERE id = $1 RETURNING id', [id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Expense not found' });
    }

    return res.json({
      message: 'Expense deleted successfully',
      id: result.rows[0].id,
    });
  } catch (err) {
    console.error('Delete expense error:', err);
    return res.status(500).json({ error: 'Failed to delete expense' });
  }
};

module.exports = {
  EXPENSE_CATEGORIES,
  PAYMENT_METHODS,
  listExpenses,
  createExpense,
  updateExpense,
  deleteExpense,
};
