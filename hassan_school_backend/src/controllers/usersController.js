const bcrypt = require('bcryptjs');
const pool = require('../config/db');

const ROLES = ['admin', 'teacher'];
const STATUSES = ['Active', 'Inactive'];

const normalizeRole = (value) => {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'admin') return 'admin';
  if (normalized === 'teacher') return 'teacher';
  return null;
};

const normalizeStatus = (value) => {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'active') return 'Active';
  if (normalized === 'inactive') return 'Inactive';
  return null;
};

const isValidPassword = (value) => {
  const password = String(value || '');
  return password.length >= 8 && /\d/.test(password);
};

const normalizeAssignedClasses = (value) => {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) return null;

  const cleaned = value
    .map((item) => String(item || '').trim())
    .filter(Boolean);

  return [...new Set(cleaned)];
};

const userSelectQuery = `
  SELECT
    u.id,
    u.full_name,
    u.email,
    u.role,
    u.status,
    u.phone,
    u.created_on,
    u.last_login,
    u.notes,
    COALESCE(array_remove(array_agg(DISTINCT c.name), NULL), '{}') AS assigned_classes
  FROM users u
  LEFT JOIN teacher_assigned_classes tac ON tac.user_id = u.id
  LEFT JOIN classes c ON c.id = tac.class_id
`;

const serializeUser = (row) => ({
  id: row.id,
  fullName: row.full_name,
  email: row.email,
  role: row.role,
  status: row.status,
  phone: row.phone,
  createdOn: row.created_on,
  lastLogin: row.last_login,
  notes: row.notes,
  assignedClasses: row.assigned_classes || [],
});

const getUserById = async (client, userId) => {
  const result = await client.query(
    `${userSelectQuery}
     WHERE u.id = $1
     GROUP BY u.id`,
    [userId]
  );

  if (result.rowCount === 0) return null;
  return serializeUser(result.rows[0]);
};

const resolveClassIds = async (client, classNames) => {
  if (!classNames || classNames.length === 0) return [];

  const namesLower = classNames.map((name) => name.toLowerCase());
  const result = await client.query(
    `SELECT id, name
     FROM classes
     WHERE LOWER(name) = ANY($1::text[])`,
    [namesLower]
  );

  const foundByLower = new Map(result.rows.map((row) => [String(row.name).toLowerCase(), row.id]));
  const missing = classNames.filter((name) => !foundByLower.has(name.toLowerCase()));

  if (missing.length > 0) {
    return { error: `Invalid assignedClasses. Not found: ${missing.join(', ')}` };
  }

  return classNames.map((name) => foundByLower.get(name.toLowerCase()));
};

const replaceAssignedClasses = async (client, userId, classIds) => {
  await client.query('DELETE FROM teacher_assigned_classes WHERE user_id = $1', [userId]);

  if (!classIds || classIds.length === 0) return;

  await client.query(
    `INSERT INTO teacher_assigned_classes (user_id, class_id)
     SELECT $1, UNNEST($2::int[])`,
    [userId, classIds]
  );
};

const listUsers = async (req, res) => {
  try {
    const result = await pool.query(
      `${userSelectQuery}
       GROUP BY u.id
       ORDER BY u.created_on DESC`
    );

    return res.json({ data: result.rows.map(serializeUser) });
  } catch (err) {
    console.error('List users error:', err);
    return res.status(500).json({ error: 'Failed to fetch users' });
  }
};

const createUser = async (req, res) => {
  const {
    fullName,
    email,
    role,
    password,
    phone,
    assignedClasses,
    status,
    notes,
  } = req.body || {};

  const missing = [];
  if (!fullName) missing.push('fullName');
  if (!email) missing.push('email');
  if (!role) missing.push('role');
  if (!password) missing.push('password');

  if (missing.length) {
    return res.status(400).json({ error: `Missing required fields: ${missing.join(', ')}` });
  }

  const fullNameTrimmed = String(fullName).trim();
  const emailTrimmed = String(email).trim().toLowerCase();
  if (!fullNameTrimmed || !emailTrimmed) {
    return res.status(400).json({ error: 'fullName and email cannot be empty' });
  }

  const normalizedRole = normalizeRole(role);
  if (!normalizedRole) {
    return res.status(400).json({ error: `Invalid role. Must be one of: ${ROLES.join(', ')}` });
  }

  if (!isValidPassword(password)) {
    return res.status(400).json({ error: 'Password must be at least 8 characters and contain at least one number' });
  }

  const normalizedStatus = status === undefined ? 'Active' : normalizeStatus(status);
  if (!normalizedStatus) {
    return res.status(400).json({ error: `Invalid status. Must be one of: ${STATUSES.join(', ')}` });
  }

  const normalizedAssignedClasses = normalizeAssignedClasses(assignedClasses);
  if (normalizedAssignedClasses === null) {
    return res.status(400).json({ error: 'assignedClasses must be an array of class names' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const passwordHash = await bcrypt.hash(String(password), 10);
    const insertResult = await client.query(
      `INSERT INTO users (full_name, email, password_hash, role, status, phone, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [
        fullNameTrimmed,
        emailTrimmed,
        passwordHash,
        normalizedRole,
        normalizedStatus,
        phone || null,
        notes || null,
      ]
    );

    const userId = insertResult.rows[0].id;

    if (normalizedRole === 'teacher') {
      const classIds = await resolveClassIds(client, normalizedAssignedClasses || []);
      if (classIds && classIds.error) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: classIds.error });
      }
      await replaceAssignedClasses(client, userId, classIds);
    }

    const user = await getUserById(client, userId);
    await client.query('COMMIT');

    return res.status(201).json({ message: 'User created successfully', user });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Create user error:', err);

    if (err.code === '23505') {
      return res.status(409).json({ error: 'Email already exists' });
    }

    return res.status(500).json({ error: 'Failed to create user' });
  } finally {
    client.release();
  }
};

const updateUser = async (req, res) => {
  const { id } = req.params;

  if (req.user && req.user.id === id) {
    return res.status(403).json({ error: 'You cannot modify your own account' });
  }

  const {
    fullName,
    email,
    role,
    password,
    phone,
    assignedClasses,
    status,
    notes,
  } = req.body || {};

  const hasAnyField = [
    fullName,
    email,
    role,
    password,
    phone,
    assignedClasses,
    status,
    notes,
  ].some((value) => value !== undefined);

  if (!hasAnyField) {
    return res.status(400).json({ error: 'No fields to update' });
  }

  const normalizedAssignedClasses = normalizeAssignedClasses(assignedClasses);
  if (normalizedAssignedClasses === null) {
    return res.status(400).json({ error: 'assignedClasses must be an array of class names' });
  }

  const normalizedRole = role !== undefined ? normalizeRole(role) : null;
  if (role !== undefined && !normalizedRole) {
    return res.status(400).json({ error: `Invalid role. Must be one of: ${ROLES.join(', ')}` });
  }

  const normalizedStatus = status !== undefined ? normalizeStatus(status) : null;
  if (status !== undefined && !normalizedStatus) {
    return res.status(400).json({ error: `Invalid status. Must be one of: ${STATUSES.join(', ')}` });
  }

  if (password !== undefined && !isValidPassword(password)) {
    return res.status(400).json({ error: 'Password must be at least 8 characters and contain at least one number' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const existingResult = await client.query('SELECT id, role FROM users WHERE id = $1 LIMIT 1', [id]);
    if (existingResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'User not found' });
    }

    const existingRole = existingResult.rows[0].role;
    const finalRole = normalizedRole || existingRole;

    const updates = [];
    const params = [];
    let idx = 1;

    const setField = (field, value) => {
      updates.push(`${field} = $${idx}`);
      params.push(value);
      idx++;
    };

    if (fullName !== undefined) {
      const fullNameTrimmed = String(fullName).trim();
      if (!fullNameTrimmed) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'fullName cannot be empty' });
      }
      setField('full_name', fullNameTrimmed);
    }

    if (email !== undefined) {
      const emailTrimmed = String(email).trim().toLowerCase();
      if (!emailTrimmed) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'email cannot be empty' });
      }
      setField('email', emailTrimmed);
    }
    if (phone !== undefined) setField('phone', phone || null);
    if (notes !== undefined) setField('notes', notes || null);
    if (normalizedRole) setField('role', normalizedRole);
    if (normalizedStatus) setField('status', normalizedStatus);

    if (password !== undefined) {
      const passwordHash = await bcrypt.hash(String(password), 10);
      setField('password_hash', passwordHash);
    }

    if (updates.length > 0) {
      params.push(id);
      await client.query(
        `UPDATE users
         SET ${updates.join(', ')}
         WHERE id = $${idx}`,
        params
      );
    }

    if (finalRole !== 'teacher') {
      await replaceAssignedClasses(client, id, []);
    } else if (normalizedAssignedClasses !== undefined) {
      const classIds = await resolveClassIds(client, normalizedAssignedClasses);
      if (classIds && classIds.error) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: classIds.error });
      }
      await replaceAssignedClasses(client, id, classIds);
    }

    const user = await getUserById(client, id);
    await client.query('COMMIT');

    return res.json({ message: 'User updated successfully', user });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Update user error:', err);

    if (err.code === '23505') {
      return res.status(409).json({ error: 'Email already exists' });
    }

    return res.status(500).json({ error: 'Failed to update user' });
  } finally {
    client.release();
  }
};

const toggleUserStatus = async (req, res) => {
  const { id } = req.params;

  if (req.user && req.user.id === id) {
    return res.status(403).json({ error: 'You cannot modify your own account' });
  }

  const requestedStatus = req.body && req.body.status !== undefined
    ? normalizeStatus(req.body.status)
    : null;

  if (req.body && req.body.status !== undefined && !requestedStatus) {
    return res.status(400).json({ error: `Invalid status. Must be one of: ${STATUSES.join(', ')}` });
  }

  try {
    const result = await pool.query(
      `UPDATE users
       SET status = CASE
         WHEN $1::text IS NOT NULL THEN $1::user_status
         WHEN status = 'Active' THEN 'Inactive'::user_status
         ELSE 'Active'::user_status
       END
       WHERE id = $2
       RETURNING id, full_name, email, role, status, phone, created_on, last_login, notes`,
      [requestedStatus, id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.json({
      message: 'User status updated successfully',
      user: serializeUser({ ...result.rows[0], assigned_classes: [] }),
    });
  } catch (err) {
    console.error('Toggle user status error:', err);
    return res.status(500).json({ error: 'Failed to toggle user status' });
  }
};

const deleteUser = async (req, res) => {
  const { id } = req.params;

  if (req.user && req.user.id === id) {
    return res.status(403).json({ error: 'You cannot modify your own account' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Keep historical expense rows by nulling recorded_by before user deletion.
    await client.query('UPDATE expenses SET recorded_by = NULL WHERE recorded_by = $1', [id]);

    const result = await client.query('DELETE FROM users WHERE id = $1 RETURNING id', [id]);
    if (result.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'User not found' });
    }

    await client.query('COMMIT');
    return res.json({ message: 'User deleted successfully', id: result.rows[0].id });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Delete user error:', err);
    return res.status(500).json({ error: 'Failed to delete user' });
  } finally {
    client.release();
  }
};

module.exports = {
  listUsers,
  createUser,
  updateUser,
  toggleUserStatus,
  deleteUser,
};
