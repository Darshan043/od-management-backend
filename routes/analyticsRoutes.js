const express = require('express');
const router = express.Router();
const { getDashboardAnalytics } = require('../controllers/analyticsController');
const { protect, allowAdmin } = require('../middleware/authMiddleware');

router.get('/dashboard', protect, allowAdmin, getDashboardAnalytics);

module.exports = router;
