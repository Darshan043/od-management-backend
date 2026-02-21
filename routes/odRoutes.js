const express = require('express');
const router = express.Router();
const {
    createOD,
    getStudentODs,
    getFacultyODs,
    facultyApprove,
    coordinatorApprove,
    hodApprove,
    rejectOD,
    getAnalytics,
    getStudentListWithODStatus,
    verifyCheckin
} = require('../controllers/odController');
const { protect, allowStudent, allowFaculty, allowHOD, allowAdmin } = require('../middleware/authMiddleware');

// Student routes
router.post('/apply', protect, allowStudent, createOD);
router.get('/student/:regNo', protect, allowStudent, getStudentODs);

// Faculty/Admin routes
router.get('/faculty', protect, allowFaculty, getFacultyODs);
router.get('/faculty/students-status', protect, allowFaculty, getStudentListWithODStatus);

router.put('/faculty/:id/approve', protect, allowFaculty, facultyApprove);
router.put('/coordinator/:id/approve', protect, allowFaculty, coordinatorApprove); // COORDINATOR is included in allowFaculty
router.put('/hod/:id/approve', protect, allowHOD, hodApprove);
router.put('/:id/reject', protect, allowFaculty, rejectOD);

// Student location check-in
router.put('/:id/checkin', protect, allowStudent, verifyCheckin);

// Admin analytics
router.get('/analytics', protect, allowAdmin, getAnalytics);

module.exports = router;
