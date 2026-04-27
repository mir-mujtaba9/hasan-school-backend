const express = require('express');
const router = express.Router();
const classesController = require('../controllers/classesController');
const { requireAuth, requireRole } = require('../middleware/auth');

router.get('/classes', requireAuth, requireRole('admin'), classesController.listClasses);
router.post('/classes', requireAuth, requireRole('admin'), classesController.addClass);
router.put('/classes/:id', requireAuth, requireRole('admin'), classesController.updateClass);
router.delete('/classes/:id', requireAuth, requireRole('admin'), classesController.deleteClass);

module.exports = router;
