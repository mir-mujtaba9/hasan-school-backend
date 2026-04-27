const pool = require('../config/db');

// List all classes
const listClasses = async (req, res) => {
  try {
    const result = await pool.query('SELECT id, name, monthly_fee, is_active FROM classes ORDER BY id');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch classes' });
  }
};

// Add a new class
const addClass = async (req, res) => {
  const { name, monthly_fee } = req.body;
  if (!name || !monthly_fee) return res.status(400).json({ error: 'Name and monthly_fee required' });
  try {
    const result = await pool.query(
      'INSERT INTO classes (name, monthly_fee) VALUES ($1, $2) RETURNING id, name, monthly_fee, is_active',
      [name, monthly_fee]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Class name already exists' });
    res.status(500).json({ error: 'Failed to add class' });
  }
};

// Update a class
const updateClass = async (req, res) => {
  const { id } = req.params;
  const { name, monthly_fee, is_active } = req.body;
  if (!name && !monthly_fee && is_active === undefined) return res.status(400).json({ error: 'Nothing to update' });
  try {
    const result = await pool.query(
      'UPDATE classes SET name = COALESCE($1, name), monthly_fee = COALESCE($2, monthly_fee), is_active = COALESCE($3, is_active) WHERE id = $4 RETURNING id, name, monthly_fee, is_active',
      [name, monthly_fee, is_active, id]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Class not found' });
    res.json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Class name already exists' });
    res.status(500).json({ error: 'Failed to update class' });
  }
};

// Delete a class
const deleteClass = async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query('DELETE FROM classes WHERE id = $1 RETURNING id', [id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Class not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete class' });
  }
};

module.exports = { listClasses, addClass, updateClass, deleteClass };
