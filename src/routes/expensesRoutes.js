const express = require('express');
const router = express.Router();

const expensesController = require('../controllers/expensesController');
const { requireAuth, requireRole } = require('../middleware/auth');

// Admin only per spec
router.get('/expenses', requireAuth, requireRole('admin'), expensesController.listExpenses);
router.post('/expenses', requireAuth, requireRole('admin'), expensesController.createExpense);
router.put('/expenses/:id', requireAuth, requireRole('admin'), expensesController.updateExpense);
router.delete('/expenses/:id', requireAuth, requireRole('admin'), expensesController.deleteExpense);

module.exports = router;
