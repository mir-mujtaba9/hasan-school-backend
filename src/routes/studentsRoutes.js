const express = require('express');
const router = express.Router();
const studentsController = require('../controllers/studentsController');
const { requireAuth, requireRole } = require('../middleware/auth');

// Public endpoints (no auth required for now - adjust based on your security needs)
router.post('/students', studentsController.createStudent);
router.get('/students', studentsController.listStudents);
router.get('/students/:id', studentsController.getStudentById);

// Protected endpoints (require auth and admin role)
router.put('/students/:id', requireAuth, requireRole('admin'), studentsController.updateStudent);
router.delete('/students/:id', requireAuth, requireRole('admin'), studentsController.deleteStudent);

module.exports = router;
