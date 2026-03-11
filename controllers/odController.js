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

    // NEW: Check for compliance block
    const pendingReportOD = await ODRequest.findOne({
        student: req.user._id,
        $or: [
            { report_status: 'pending', toDate: { $lt: new Date() } },
            { report_status: 'submitted' }, // Wait for verification
            { report_status: 'rejected' }
        ],
        status: 'HOD_APPROVED' // Only check for approved ODs
    });

    if (pendingReportOD) {
        res.status(403);
        throw new Error('You cannot apply for a new OD because your previous OD detailed report has not been verified. Please submit or complete the pending report.');
    }

    const odRequest = await ODRequest.create({
        student: req.user._id,
        reason,
        event_name: reason, // Added for QR verification
        proofFile: req.file ? req.file.path.replace(/\\/g, '/') : null,
        fromDate,
        start_date: new Date(fromDate).toLocaleDateString(), // Added for QR verification
        toDate,
        end_date: new Date(toDate).toLocaleDateString(), // Added for QR verification
        location,
        status: 'PENDING',
        approvalLevel: 'faculty',
        lastActionTime: Date.now()
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
        query = { approvalLevel: 'faculty', status: 'PENDING' };
    } else if (role === 'COORDINATOR') {
        query = { approvalLevel: 'coordinator', status: { $in: ['PENDING', 'FACULTY_APPROVED'] } };
    } else if (role === 'HOD') {
        query = { approvalLevel: 'hod', status: { $in: ['PENDING', 'FACULTY_APPROVED', 'COORDINATOR_APPROVED'] } };
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
    od.faculty_status = 'APPROVED'; // Added for QR verification
    od.approvalLevel = 'coordinator';
    od.lastActionTime = Date.now();
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
    od.coordinator_status = 'APPROVED'; // Added for QR verification
    od.approvalLevel = 'hod';
    od.lastActionTime = Date.now();
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
    od.hod_status = 'APPROVED'; // Added for QR verification
    od.isFinalApproved = true;

    // Force update student fields just in case
    const student = await Student.findById(od.student);
    if (student) {
        student.full_name = student.name;
        student.roll_number = student.regNo;
        await student.save();
    }

    od.approvedBy.push({
        faculty: req.user._id,
        role: 'HOD'
    });

    // QR payload points to local verification endpoint as requested
    const BASE_URL = process.env.BASE_URL || "http://10.29.205.232:5000";
    const qrData = `${BASE_URL}/verify-od/${od._id}`;
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

// @desc    JSON verification endpoint for QR Scanner App
// @route   GET /api/od/verify/:id
const verifyODJson = asyncHandler(async (req, res) => {
    const id = req.params.id;

    let od;
    if (mongoose.Types.ObjectId.isValid(id)) {
        od = await ODRequest.findById(id)
            .populate('student', 'name regNo department year section')
            .populate('approvedBy.faculty', 'name staffId role');
    }

    if (!od) {
        // Fallback to searching by regNo if ID wasn't a valid ObjectId or not found
        // Note: regNo lookup might return multiple if the student has multiple ODs. 
        // We'll return the latest one if searching by regNo.
        const student = await mongoose.model('Student').findOne({ regNo: id });
        if (student) {
            od = await ODRequest.findOne({ student: student._id })
                .sort('-createdAt')
                .populate('student', 'name regNo department year section')
                .populate('approvedBy.faculty', 'name staffId role');
        }
    }

    if (!od) {
        return res.status(404).json({
            success: false,
            message: "Invalid QR Code or OD record not found."
        });
    }

    res.json({
        success: true,
        data: od
    });
});

// @desc    Public verification endpoint for Digital OD Pass QR
// @route   GET /verify-od/:id
const verifyOD = asyncHandler(async (req, res) => {
    try {
        const id = req.params.id;
        const application = await ODRequest.findById(id).populate("student");

        if (!application) {
            return res.send("<h2>Invalid OD Pass</h2>");
        }

        // Ensure full_name and roll_number are available (fallback to name/regNo)
        const studentName = application.student.full_name || application.student.name;
        const rollNumber = application.student.roll_number || application.student.regNo;

        res.send(`
  <html>
  <head>
    <title>OD Verification</title>
    <style>
      body{font-family:Arial;padding:40px;background:#f5f5f5}
      .card{background:white;padding:30px;border-radius:10px;max-width:600px;margin:auto;box-shadow:0 2px 10px rgba(0,0,0,0.1)}
      h1{color:#2c3e50}
    </style>
  </head>

  <body>

  <div class="card">

  <h1>OD Pass Verification</h1>

  <p><b>Student Name:</b> ${studentName}</p>
  <p><b>Register Number:</b> ${rollNumber}</p>
  <p><b>Department:</b> ${application.student.department}</p>
  <p><b>Event Name:</b> ${application.event_name || application.reason}</p>
  <p><b>OD Start Date:</b> ${application.start_date || application.fromDate.toLocaleDateString()}</p>
  <p><b>OD End Date:</b> ${application.end_date || application.toDate.toLocaleDateString()}</p>

  <h3>Approval Status</h3>

  <p><b>Faculty:</b> ${application.faculty_status}</p>
  <p><b>Coordinator:</b> ${application.coordinator_status}</p>
  <p><b>HOD:</b> ${application.hod_status}</p>

  <h2 style="color:green">VALID OD PASS</h2>

  </div>

  </body>
  </html>
`);
    } catch (error) {
        res.send("<h2>Verification Error</h2>");
    }
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
    verifyOD,
    verifyODJson
};
