const express = require('express');
const router = express.Router();
const { 
    submitReport, 
    verifyReport, 
    getPendingReports, 
    getComplianceAnalytics 
} = require('../controllers/reportController');
const { protect, allowAdmin, authorize } = require('../middleware/authMiddleware');
const multer = require('multer');
const path = require('path');

// Multer storage configuration
const storage = multer.diskStorage({
    destination(req, file, cb) {
        const dir = 'uploads/reports';
        if (!require('fs').existsSync(dir)) {
            require('fs').mkdirSync(dir, { recursive: true });
        }
        cb(null, dir);
    },
    filename(req, file, cb) {
        cb(null, `${file.fieldname}-${Date.now()}${path.extname(file.originalname)}`);
    }
});

const upload = multer({ storage });

router.post('/submit', protect, upload.array('photos', 5), submitReport);
router.get('/pending', protect, authorize('FACULTY', 'COORDINATOR', 'HOD'), getPendingReports);
router.put('/:id/verify', protect, authorize('FACULTY', 'COORDINATOR'), verifyReport);
router.get('/analytics', protect, authorize('ADMIN', 'HOD'), getComplianceAnalytics);

module.exports = router;
