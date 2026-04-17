const express = require('express');
const router = express.Router();
const feesController = require('../controllers/feesController');
const { requireAuth, requireRole } = require('../middleware/auth');

router.get('/fees', requireAuth, requireRole(['admin', 'teacher']), feesController.listFees);
router.post('/fees', requireAuth, requireRole('admin'), feesController.createFee);
router.put('/fees/:id', requireAuth, requireRole('admin'), feesController.updateFee);
router.delete('/fees/:id', requireAuth, requireRole('admin'), feesController.deleteFee);

module.exports = router;
