const pool = require('../config/db');

const STAFF_ROLES = [
  'Head Teacher',
  'Teacher',
  'Admin Staff',
  'Guard',
  'Peon',
  'Cook',
  'Other',
];

const isValidDateString = (value) => {
  if (!value) return false;
  const d = new Date(value);
  return !Number.isNaN(d.getTime());
};

const normalizeRole = (role) => {
  if (role === undefined || role === null) return null;
  const trimmed = String(role).trim();
  if (!trimmed) return null;
  // Preserve canonical casing from STAFF_ROLES
  const match = STAFF_ROLES.find((r) => r.toLowerCase() === trimmed.toLowerCase());
  return match || null;
};

const listStaff = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT *
       FROM staff_members
       ORDER BY created_at DESC`
    );

    return res.json({ data: result.rows, staffRoles: STAFF_ROLES });
  } catch (err) {
    console.error('List staff error:', err);
    return res.status(500).json({ error: 'Failed to fetch staff' });
  }
};

const getStaffById = async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query('SELECT * FROM staff_members WHERE id = $1', [id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Staff member not found' });

    return res.json({ staff: result.rows[0] });
  } catch (err) {
    console.error('Get staff error:', err);
    return res.status(500).json({ error: 'Failed to fetch staff member' });
  }
};

const createStaff = async (req, res) => {
  const {
    full_name,
    father_name,
    role,
    gender,
    monthly_salary,
    join_date,
    phone,
    cnic,
    date_of_birth,
    qualification,
    address,
    notes,
  } = req.body || {};

  const missing = [];
  if (!full_name) missing.push('full_name');
  if (!father_name) missing.push('father_name');
  if (!role) missing.push('role');
  if (monthly_salary === undefined || monthly_salary === null || monthly_salary === '') missing.push('monthly_salary');
  if (!join_date) missing.push('join_date');

  if (missing.length) {
    return res.status(400).json({ error: `Missing required fields: ${missing.join(', ')}` });
  }

  const normalizedRole = normalizeRole(role);
  if (!normalizedRole) {
    return res.status(400).json({
      error: `Invalid role. Must be one of: ${STAFF_ROLES.join(', ')}`,
    });
  }

  const salaryNumber = Number(monthly_salary);
  if (!Number.isFinite(salaryNumber) || salaryNumber < 0) {
    return res.status(400).json({ error: 'monthly_salary must be a non-negative number' });
  }

  if (!isValidDateString(join_date)) {
    return res.status(400).json({ error: 'join_date must be a valid date' });
  }

  if (date_of_birth && !isValidDateString(date_of_birth)) {
    return res.status(400).json({ error: 'date_of_birth must be a valid date' });
  }

  const validGenders = ['Male', 'Female'];
  if (gender && !validGenders.includes(gender)) {
    return res.status(400).json({ error: 'gender must be Male or Female' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO staff_members (
        full_name, father_name, role, gender, monthly_salary, join_date,
        phone, cnic, date_of_birth, qualification, address, notes,
        status, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10, $11, $12,
        'Active', NOW(), NOW()
      )
      RETURNING *`,
      [
        String(full_name).trim(),
        String(father_name).trim(),
        normalizedRole,
        gender || null,
        salaryNumber,
        join_date,
        phone || null,
        cnic || null,
        date_of_birth || null,
        qualification || null,
        address || null,
        notes || null,
      ]
    );

    return res.status(201).json({ message: 'Staff member created successfully', staff: result.rows[0] });
  } catch (err) {
    console.error('Create staff error:', err);
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Duplicate staff record' });
    }
    return res.status(500).json({ error: 'Failed to create staff member' });
  }
};

const updateStaff = async (req, res) => {
  const { id } = req.params;
  const {
    full_name,
    father_name,
    role,
    gender,
    monthly_salary,
    join_date,
    phone,
    cnic,
    date_of_birth,
    qualification,
    address,
    notes,
    status,
  } = req.body || {};

  const allowed = {
    full_name,
    father_name,
    role,
    gender,
    monthly_salary,
    join_date,
    phone,
    cnic,
    date_of_birth,
    qualification,
    address,
    notes,
    status,
  };

  const keys = Object.keys(allowed).filter((k) => allowed[k] !== undefined);
  if (keys.length === 0) return res.status(400).json({ error: 'No fields to update' });

  const updates = [];
  const params = [];
  let idx = 1;

  const setField = (field, value) => {
    updates.push(`${field} = $${idx}`);
    params.push(value);
    idx++;
  };

  if (full_name !== undefined) setField('full_name', full_name ? String(full_name).trim() : null);
  if (father_name !== undefined) setField('father_name', father_name ? String(father_name).trim() : null);

  if (role !== undefined) {
    const normalizedRole = normalizeRole(role);
    if (!normalizedRole) {
      return res.status(400).json({
        error: `Invalid role. Must be one of: ${STAFF_ROLES.join(', ')}`,
      });
    }
    setField('role', normalizedRole);
  }

  if (gender !== undefined) {
    const validGenders = ['Male', 'Female'];
    if (gender && !validGenders.includes(gender)) {
      return res.status(400).json({ error: 'gender must be Male or Female' });
    }
    setField('gender', gender || null);
  }

  if (monthly_salary !== undefined) {
    const salaryNumber = Number(monthly_salary);
    if (!Number.isFinite(salaryNumber) || salaryNumber < 0) {
      return res.status(400).json({ error: 'monthly_salary must be a non-negative number' });
    }
    setField('monthly_salary', salaryNumber);
  }

  if (join_date !== undefined) {
    if (join_date && !isValidDateString(join_date)) {
      return res.status(400).json({ error: 'join_date must be a valid date' });
    }
    setField('join_date', join_date || null);
  }

  if (date_of_birth !== undefined) {
    if (date_of_birth && !isValidDateString(date_of_birth)) {
      return res.status(400).json({ error: 'date_of_birth must be a valid date' });
    }
    setField('date_of_birth', date_of_birth || null);
  }

  if (status !== undefined) {
    const validStatuses = ['Active', 'Inactive'];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({ error: 'status must be Active or Inactive' });
    }
    setField('status', status);
  }

  if (phone !== undefined) setField('phone', phone || null);
  if (cnic !== undefined) setField('cnic', cnic || null);
  if (qualification !== undefined) setField('qualification', qualification || null);
  if (address !== undefined) setField('address', address || null);
  if (notes !== undefined) setField('notes', notes || null);

  // always bump updated_at
  updates.push(`updated_at = NOW()`);

  params.push(id);

  try {
    const result = await pool.query(
      `UPDATE staff_members
       SET ${updates.join(', ')}
       WHERE id = $${idx}
       RETURNING *`,
      params
    );

    if (result.rowCount === 0) return res.status(404).json({ error: 'Staff member not found' });
    return res.json({ message: 'Staff member updated successfully', staff: result.rows[0] });
  } catch (err) {
    console.error('Update staff error:', err);
    return res.status(500).json({ error: 'Failed to update staff member' });
  }
};

const deactivateStaff = async (req, res) => {
  const { id } = req.params;
  const { date, reason } = req.body || {};

  if (!date || !reason) {
    return res.status(400).json({ error: 'Missing required fields: date, reason' });
  }

  if (!isValidDateString(date)) {
    return res.status(400).json({ error: 'date must be a valid date' });
  }

  try {
    const result = await pool.query(
      `UPDATE staff_members
       SET status = 'Inactive',
           inactive_date = $1,
           inactive_reason = $2,
           updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [date, String(reason).trim(), id]
    );

    if (result.rowCount === 0) return res.status(404).json({ error: 'Staff member not found' });

    return res.json({ message: 'Staff member deactivated successfully', staff: result.rows[0] });
  } catch (err) {
    console.error('Deactivate staff error:', err);
    return res.status(500).json({ error: 'Failed to deactivate staff member' });
  }
};

const deleteStaff = async (req, res) => {
  const { id } = req.params;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Salary records are configured with ON DELETE CASCADE, but we use a transaction
    // to ensure consistent behavior.
    const result = await client.query('DELETE FROM staff_members WHERE id = $1 RETURNING id', [id]);
    if (result.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Staff member not found' });
    }

    await client.query('COMMIT');
    return res.json({ message: 'Staff member deleted successfully' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Delete staff error:', err);
    return res.status(500).json({ error: 'Failed to delete staff member' });
  } finally {
    client.release();
  }
};

module.exports = {
  STAFF_ROLES,
  listStaff,
  getStaffById,
  createStaff,
  updateStaff,
  deactivateStaff,
  deleteStaff,
};
