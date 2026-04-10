const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// Generic login (backward compatibility)
router.post('/auth/login', authController.login);

// Role-specific login endpoints
router.post('/auth/admin-login', authController.adminLogin);
router.post('/auth/teacher-login', authController.teacherLogin);

module.exports = router;
