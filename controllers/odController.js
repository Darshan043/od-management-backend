const ODRequest = require('../models/ODRequest');
const Student = require('../models/Student');
const Faculty = require('../models/Faculty');
const mongoose = require('mongoose');
const asyncHandler = require('../middleware/asyncHandler');

// @desc    Create new OD request
// @route   POST /api/od/apply
const createOD = asyncHandler(async (req, res) => {
    const { reason, proofFile, fromDate, toDate, location } = req.body;

    const student = await Student.findById(req.user._id);
    const totalAllowed = (student.odLimit || 5) + (student.extraODApproved || 0);

    if (student.odUsed >= totalAllowed) {
        res.status(403);
        throw new Error('You have reached your On Duty limit for this semester. Application denied.');
    }

    const odRequest = await ODRequest.create({
        student: req.user._id,
        reason,
        proofFile,
        fromDate,
        toDate,
        location,
        status: 'PENDING'
    });

    res.status(201).json(odRequest);
});

// @desc    Get student OD requests
// @route   GET /api/od/student/:regNo
const getStudentODs = asyncHandler(async (req, res) => {
    let regNo = req.params.regNo;
    if (regNo === 'CURRENT' && req.user) {
        regNo = req.user.regNo || req.user.staffId; // Handle staff if needed, but primarily student
    }

    const student = await Student.findOne({ regNo });
    if (!student) {
        res.status(404);
        throw new Error('Student not found');
    }


    const ods = await ODRequest.find({ student: student._id })
        .populate('student', 'name regNo department year email')
        .populate('approvedBy.faculty', 'name role');

    res.json(ods);
});

// @desc    Get ODs for faculty approval
// @route   GET /api/od/faculty
const getFacultyODs = asyncHandler(async (req, res) => {
    const role = req.user.role;
    let query = {};

    if (role === 'FACULTY') {
        query = { status: 'PENDING' };
    } else if (role === 'COORDINATOR') {
        query = { status: 'FACULTY_APPROVED' };
    } else if (role === 'HOD') {
        query = { status: 'COORDINATOR_APPROVED' };
    }

    const ods = await ODRequest.find(query)
        .populate('student', 'name regNo department year section email')
        .sort('-createdAt');

    res.json(ods);
});

// @desc    Faculty Approve OD
// @route   PUT /api/od/faculty/:id/approve
const facultyApprove = asyncHandler(async (req, res) => {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        res.status(400);
        throw new Error('Invalid OD request ID format');
    }

    const od = await ODRequest.findById(req.params.id);
    if (!od) {
        res.status(404);
        throw new Error('OD not found');
    }

    // Auto-increment odUsed if this is the first approval (from PENDING)
    if (od.status === 'PENDING') {
        const student = await Student.findById(od.student);
        if (student) {
            student.odUsed = (student.odUsed || 0) + 1;
            await student.save();
        }
    }

    od.status = 'FACULTY_APPROVED';
    od.approvedBy.push({
        faculty: req.user._id,
        role: 'FACULTY'
    });

    await od.save();
    res.json(od);
});

// @desc    Coordinator Approve OD
// @route   PUT /api/od/coordinator/:id/approve
const coordinatorApprove = asyncHandler(async (req, res) => {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        res.status(400);
        throw new Error('Invalid OD request ID format');
    }

    const od = await ODRequest.findById(req.params.id);
    if (!od) {
        res.status(404);
        throw new Error('OD not found');
    }

    od.status = 'COORDINATOR_APPROVED';
    od.approvedBy.push({
        faculty: req.user._id,
        role: 'COORDINATOR'
    });

    await od.save();
    res.json(od);
});

// @desc    Final HOD approval and QR assignment
//          Generates verification link used inside the digital pass QR code.
// @route   PUT /api/od/hod/:id/approve
const finalApproveOD = asyncHandler(async (req, res) => {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        res.status(400);
        throw new Error('Invalid OD request ID format');
    }

    const od = await ODRequest.findById(req.params.id).populate('student');
    if (!od) {
        res.status(404);
        throw new Error('OD not found');
    }

    od.status = 'HOD_APPROVED';
    od.isFinalApproved = true;

    od.approvedBy.push({
        faculty: req.user._id,
        role: 'HOD'
    });

    // QR payload points to public verification endpoint
    const BASE_URL = process.env.BASE_URL || "http://localhost:5000";
    const qrData = `${BASE_URL}/verify/${od._id}`;
    od.qrCodeData = qrData;

    await od.save();

    res.json({ od, qrData });
});

// Backwards-compatible alias for existing route handler
const hodApprove = finalApproveOD;

// @desc    Reject OD
// @route   PUT /api/od/:id/reject
const rejectOD = asyncHandler(async (req, res) => {
    const { remarks } = req.body;
    const od = await ODRequest.findById(req.params.id);
    if (!od) {
        res.status(404);
        throw new Error('OD not found');
    }

    od.status = 'REJECTED';
    od.remarks = remarks || 'Rejected by administration';

    await od.save();
    res.json(od);
});

// @desc    Get Admin Analytics
// @route   GET /api/od/analytics
const getAnalytics = asyncHandler(async (req, res) => {
    const totalODs = await ODRequest.countDocuments();
    const approved = await ODRequest.countDocuments({ status: 'HOD_APPROVED' });
    const rejected = await ODRequest.countDocuments({ status: 'REJECTED' });
    const pending = await ODRequest.countDocuments({ status: { $nin: ['HOD_APPROVED', 'REJECTED'] } });

    res.json({
        totalODs,
        approved,
        rejected,
        pending,
        approvalRate: totalODs > 0 ? (approved / totalODs) * 100 : 0
    });
});

// @desc    Get Student List with Latest OD Status (For Faculty Dashboard)
// @route   GET /api/od/faculty/students-status
const getStudentListWithODStatus = asyncHandler(async (req, res) => {
    // Logic: Fetch all students and join with their latest OD request
    // In a real application, you might filter by faculty's department/section

    const students = await Student.find({ department: req.user.department })
        .select('name regNo year section department');

    const studentsWithStatus = await Promise.all(students.map(async (student) => {
        const latestOD = await ODRequest.findOne({ student: student._id })
            .sort('-createdAt')
            .select('status reason fromDate toDate');

        return {
            ...student._doc,
            latestOD: latestOD || { status: 'NO_OD_APPLIED' }
        };
    }));

    res.json(studentsWithStatus);
});

// @desc    Verify Student Location Check-in
// @route   PUT /api/od/:id/checkin
const verifyCheckin = asyncHandler(async (req, res) => {
    const { location } = req.body; // { latitude, longitude }
    const od = await ODRequest.findById(req.params.id);
    if (!od) {
        res.status(404);
        throw new Error('OD not found');
    }

    od.checkInLocation = location;
    od.checkInTime = new Date();

    // Simple verification: if coordinates exist, mark as captured.
    // In a real scenario, you'd compare with event coordinates.
    od.isLocationVerified = !!(location.latitude && location.longitude);

    await od.save();
    res.json({
        verified: od.isLocationVerified,
        message: od.isLocationVerified ? 'Location captured successfully' : 'Invalid location data'
    });
});

// @desc    Public verification endpoint for Digital OD Pass QR
// @route   GET /verify/:id
const verifyOD = asyncHandler(async (req, res) => {
    const od = await ODRequest.findById(req.params.id)
        .populate('student', 'name regNo');

    if (!od || !od.isFinalApproved) {
        return res.status(404).json({
            valid: false,
            message: 'OD record not found or not finally approved'
        });
    }

    return res.json({
        valid: true,
        studentName: od.student.name,
        regNo: od.student.regNo,
        purpose: od.reason,
        fromDate: od.fromDate,
        toDate: od.toDate,
        status: od.status
    });
});

module.exports = {
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
    finalApproveOD,
    verifyOD
};
