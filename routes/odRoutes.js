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
    verifyCheckin,
    verifyODJson
} = require('../controllers/odController');
const { protect, allowStudent, allowFaculty, allowHOD, allowAdmin } = require('../middleware/authMiddleware');
const multer = require('multer');
const path = require('path');

// Multer storage for OD proofs
const storage = multer.diskStorage({
    destination(req, file, cb) {
        const dir = 'uploads';
        if (!require('fs').existsSync(dir)) {
            require('fs').mkdirSync(dir, { recursive: true });
        }
        cb(null, dir);
    },
    filename(req, file, cb) {
        cb(null, `proof-${Date.now()}${path.extname(file.originalname)}`);
    }
});

const upload = multer({ storage });

// Student routes
router.post('/apply', protect, allowStudent, upload.single('proofFile'), createOD);
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

// JSON Verification for Scanner (Public or Protected? User said "scanner page", usually protected if staff usage)
// For now, let's keep it under /api/od/verify/:id 
router.get('/verify/:id', verifyODJson);

// Admin analytics
router.get('/analytics', protect, allowAdmin, getAnalytics);

module.exports = router;
