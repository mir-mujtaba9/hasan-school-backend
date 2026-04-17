const express = require('express');
const router = express.Router();

const salaryController = require('../controllers/salaryController');
const { requireAuth, requireRole } = require('../middleware/auth');

// Admin only per spec
router.get('/salaries', requireAuth, requireRole('admin'), salaryController.listSalaries);
router.post('/salaries', requireAuth, requireRole('admin'), salaryController.createSalary);
router.delete('/salaries/:id', requireAuth, requireRole('admin'), salaryController.deleteSalary);

module.exports = router;
