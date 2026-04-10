const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();
//test

const healthRoutes = require('./routes/healthRoutes');
const classesRoutes = require('./routes/classesRoutes');
const authRoutes = require('./routes/authRoutes');
const studentsRoutes = require('./routes/studentsRoutes');

const app = express();

app.use(cors({ origin: process.env.FRONTEND_URL || '*'}));
app.use(express.json());

app.use('/api/v1', healthRoutes);
app.use('/api/v1', classesRoutes);
app.use('/api/v1', authRoutes);
app.use('/api/v1', studentsRoutes);

app.get('/', (req, res) => {
  res.json({ message: 'Hassan School Backend API' });
});

module.exports = app;
