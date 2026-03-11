const ODRequest = require('../models/ODRequest');
const asyncHandler = require('../middleware/asyncHandler');

// @desc    Get Real-time Analytics for Dashboard
// @route   GET /api/analytics/dashboard
// @access  Private/Admin
const getDashboardAnalytics = asyncHandler(async (req, res) => {
    // 1. Department-wise OD Requests
    const departmentStats = await ODRequest.aggregate([
        {
            $lookup: {
                from: 'students',
                localField: 'student',
                foreignField: '_id',
                as: 'studentInfo'
            }
        },
        { $unwind: '$studentInfo' },
        {
            $group: {
                _id: '$studentInfo.department',
                totalRequests: { $sum: 1 }
            }
        },
        {
            $project: {
                _id: 0,
                department: '$_id',
                totalRequests: 1
            }
        },
        { $sort: { totalRequests: -1 } }
    ]);

    // 2. Monthly OD Request Trend
    const monthlyStats = await ODRequest.aggregate([
        {
            $group: {
                _id: { $month: '$createdAt' },
                totalRequests: { $sum: 1 }
            }
        },
        {
            $project: {
                _id: 0,
                month: '$_id',
                totalRequests: 1
            }
        },
        { $sort: { month: 1 } }
    ]);

    // 3. Approval Status Statistics
    const approvalStats = await ODRequest.aggregate([
        {
            $group: {
                _id: '$status',
                count: { $sum: 1 }
            }
        },
        {
            $project: {
                _id: 0,
                status: '$_id',
                count: 1
            }
        }
    ]);

    // 4. Top OD Requesting Students
    const topStudents = await ODRequest.aggregate([
        {
            $group: {
                _id: '$student',
                requests: { $sum: 1 }
            }
        },
        { $sort: { requests: -1 } },
        { $limit: 5 },
        {
            $lookup: {
                from: 'students',
                localField: '_id',
                foreignField: '_id',
                as: 'studentInfo'
            }
        },
        { $unwind: '$studentInfo' },
        {
            $project: {
                _id: 0,
                studentName: '$studentInfo.name',
                requests: 1
            }
        }
    ]);

    const totalRequests = await ODRequest.countDocuments();

    res.json({
        totalRequests,
        departmentStats,
        monthlyStats,
        approvalStats,
        topStudents
    });
});

module.exports = {
    getDashboardAnalytics
};
