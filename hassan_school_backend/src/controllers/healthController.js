const pool = require('../config/db');

const getHealth = (req, res) => {
  res.json({ status: 'ok', message: 'API is running' });
};

const getDbHealth = async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW() as now');
    res.json({ status: 'ok', dbTime: result.rows[0].now });
  } catch (error) {
    console.error('Database health check failed', error);
    res.status(500).json({ status: 'error', message: 'Database connection failed' });
  }
};

module.exports = {
  getHealth,
  getDbHealth,
};
