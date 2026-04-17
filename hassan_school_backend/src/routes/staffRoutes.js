const express = require('express');
const router = express.Router();

const staffController = require('../controllers/staffController');
const { requireAuth, requireRole } = require('../middleware/auth');

// Admin only per spec
router.get('/staff', requireAuth, requireRole('admin'), staffController.listStaff);
router.get('/staff/:id', requireAuth, requireRole('admin'), staffController.getStaffById);
router.post('/staff', requireAuth, requireRole('admin'), staffController.createStaff);
router.put('/staff/:id', requireAuth, requireRole('admin'), staffController.updateStaff);
router.put('/staff/:id/deactivate', requireAuth, requireRole('admin'), staffController.deactivateStaff);
router.delete('/staff/:id', requireAuth, requireRole('admin'), staffController.deleteStaff);

module.exports = router;
