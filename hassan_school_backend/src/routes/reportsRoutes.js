const express = require('express');
const router = express.Router();

const reportsController = require('../controllers/reportsController');
const { requireAuth, requireRole } = require('../middleware/auth');

// Balance sheet - admin only
router.get('/reports/balance-sheet', requireAuth, requireRole('admin'), reportsController.balanceSheet);

module.exports = router;
