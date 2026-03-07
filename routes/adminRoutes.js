const express = require('express');
const router = express.Router();
const { getODReportPDF } = require('../controllers/adminController');
const { protect, allowAdmin } = require('../middleware/authMiddleware');

router.get('/od-report-pdf', protect, allowAdmin, getODReportPDF);

module.exports = router;
