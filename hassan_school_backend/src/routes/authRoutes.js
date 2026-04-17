const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { requireAuth } = require('../middleware/auth');

// Generic login (backward compatibility)
router.post('/auth/login', authController.login);

// Role-specific login endpoints
router.post('/auth/admin-login', authController.adminLogin);
router.post('/auth/teacher-login', authController.teacherLogin);

// Logout (requires a valid token; client should delete token locally)
router.post('/auth/logout', requireAuth, authController.logout);

module.exports = router;
