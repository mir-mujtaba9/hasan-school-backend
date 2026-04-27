const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();
//test

const healthRoutes = require('./routes/healthRoutes');
const classesRoutes = require('./routes/classesRoutes');
const authRoutes = require('./routes/authRoutes');
const studentsRoutes = require('./routes/studentsRoutes');
const feesRoutes = require('./routes/feesRoutes');
const staffRoutes = require('./routes/staffRoutes');
const salaryRoutes = require('./routes/salaryRoutes');
const expensesRoutes = require('./routes/expensesRoutes');
const usersRoutes = require('./routes/usersRoutes');
const reportsRoutes = require('./routes/reportsRoutes');

const app = express();

const corsAllowlist = (process.env.FRONTEND_URL || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const allowAllOrigins =
  corsAllowlist.includes('*') ||
  (corsAllowlist.length === 0 && process.env.NODE_ENV !== 'production');

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true); // non-browser clients (curl/Postman)

      if (allowAllOrigins) return cb(null, origin);
      if (corsAllowlist.includes(origin)) return cb(null, origin);

      return cb(null, false);
    },
    credentials: true,
  })
);
app.use(express.json());

app.use('/api/v1', healthRoutes);
app.use('/api/v1', classesRoutes);
app.use('/api/v1', authRoutes);
app.use('/api/v1', studentsRoutes);
app.use('/api/v1', feesRoutes);
app.use('/api/v1', staffRoutes);
app.use('/api/v1', salaryRoutes);
app.use('/api/v1', expensesRoutes);
app.use('/api/v1', usersRoutes);
app.use('/api/v1', reportsRoutes);

app.get('/', (req, res) => {
  res.json({ message: 'Hassan School Backend API' });
});

// Handle invalid JSON payloads (body-parser JSON parse errors)
app.use((err, req, res, next) => {
  if (!err) return next();

  // body-parser sets `type: 'entity.parse.failed'` for JSON parse errors
  if (err.type === 'entity.parse.failed' || err instanceof SyntaxError) {
    return res.status(400).json({ error: 'Invalid JSON payload' });
  }

  return next(err);
});

// Generic error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error', err);
  res.status(500).json({ error: 'Internal server error' });
});

module.exports = app;
