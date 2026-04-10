const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const pool = require('../config/db');

// Generic login helper function
const loginUser = async (req, res, requiredRole) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    return res.status(500).json({ error: 'JWT secret is not configured' });
  }

  try {
    const result = await pool.query(
      'SELECT id, full_name, email, role, password_hash, status FROM users WHERE email = $1 LIMIT 1',
      [email]
    );

    if (result.rowCount === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = result.rows[0];
    
    // Check if user role matches required role
    if (user.role !== requiredRole) {
      return res.status(403).json({ error: `Only ${requiredRole}s can log in through this portal` });
    }

    if (user.status !== 'Active') {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const passwordOk = await bcrypt.compare(password, user.password_hash);
    if (!passwordOk) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = jwt.sign(
      { sub: user.id, role: user.role, email: user.email },
      jwtSecret,
      { expiresIn: '8h' }
    );

    return res.json({
      token,
      user: {
        id: user.id,
        fullName: user.full_name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error('Login failed', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// Admin login - only admins can log in
const adminLogin = async (req, res) => {
  return loginUser(req, res, 'admin');
};

// Teacher login - only teachers can log in
const teacherLogin = async (req, res) => {
  return loginUser(req, res, 'teacher');
};

// Generic login (deprecated - kept for backward compatibility)
const login = async (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    return res.status(500).json({ error: 'JWT secret is not configured' });
  }

  try {
    const result = await pool.query(
      'SELECT id, full_name, email, role, password_hash, status FROM users WHERE email = $1 LIMIT 1',
      [email]
    );

    if (result.rowCount === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = result.rows[0];
    if (user.status !== 'Active') {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const passwordOk = await bcrypt.compare(password, user.password_hash);
    if (!passwordOk) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = jwt.sign(
      { sub: user.id, role: user.role, email: user.email },
      jwtSecret,
      { expiresIn: '8h' }
    );

    return res.json({
      token,
      user: {
        id: user.id,
        fullName: user.full_name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error('Login failed', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = {
  login,
  adminLogin,
  teacherLogin,
};
