const express = require('express');
const router = express.Router();

const usersController = require('../controllers/usersController');
const { requireAuth, requireRole } = require('../middleware/auth');

// Admin only per spec
router.get('/users', requireAuth, requireRole('admin'), usersController.listUsers);
router.post('/users', requireAuth, requireRole('admin'), usersController.createUser);
router.put('/users/:id', requireAuth, requireRole('admin'), usersController.updateUser);
router.put('/users/:id/toggle-status', requireAuth, requireRole('admin'), usersController.toggleUserStatus);
router.delete('/users/:id', requireAuth, requireRole('admin'), usersController.deleteUser);

module.exports = router;
