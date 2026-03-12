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

    // QR payload points to production verification endpoint as requested
    const BASE_URL = process.env.BASE_URL || "https://od-management-backend-1.onrender.com";
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
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Official OD Verification | RIT</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
    <style>
        :root {
            --primary: #1e3a8a;
            --primary-light: #3b82f6;
            --success: #10b981;
            --pending: #f59e0b;
            --danger: #ef4444;
            --background: #f8fafc;
            --text-main: #0f172a;
            --text-muted: #64748b;
            --white: #ffffff;
            --card-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.05);
        }

        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
            -webkit-tap-highlight-color: transparent;
        }

        body {
            font-family: 'Inter', system-ui, -apple-system, sans-serif;
            background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
            color: var(--text-main);
            min-height: 100vh;
            display: flex;
            flex-direction: column;
            align-items: center;
            padding: 24px 16px;
            opacity: 0;
            animation: fadeIn 0.8s ease-out forwards;
        }

        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }

        .header {
            text-align: center;
            margin-bottom: 24px;
            width: 100%;
            max-width: 450px;
        }

        .logo {
            width: 80px;
            height: auto;
            margin-bottom: 12px;
        }

        .college-name {
            font-size: 14px;
            font-weight: 600;
            color: var(--primary);
            text-transform: uppercase;
            letter-spacing: 0.05em;
            margin-bottom: 4px;
        }

        .portal-title {
            font-size: 22px;
            font-weight: 800;
            color: var(--text-main);
            margin-bottom: 16px;
        }

        .divider {
            height: 2px;
            width: 40px;
            background: var(--primary);
            margin: 0 auto;
            border-radius: 2px;
            opacity: 0.3;
        }

        .verification-card {
            background: var(--white);
            border-radius: 24px;
            width: 100%;
            max-width: 450px;
            padding: 32px 24px;
            box-shadow: var(--card-shadow);
            border: 1px solid rgba(255, 255, 255, 0.7);
            position: relative;
            overflow: hidden;
        }

        .verification-card::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 6px;
            background: var(--primary);
            opacity: 0.8;
        }

        .info-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
            margin-bottom: 24px;
        }

        .info-item.full-width {
            grid-column: span 2;
        }

        .label {
            font-size: 11px;
            font-weight: 600;
            color: var(--text-muted);
            text-transform: uppercase;
            letter-spacing: 0.05em;
            margin-bottom: 4px;
            display: block;
        }

        .value {
            font-size: 15px;
            font-weight: 700;
            color: var(--text-main);
            line-height: 1.4;
        }

        .status-badge {
            display: inline-flex;
            align-items: center;
            padding: 6px 16px;
            border-radius: 100px;
            font-size: 13px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.03em;
            animation: pop 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) 0.3s both;
            box-shadow: 0 4px 10px rgba(0, 0, 0, 0.05);
        }

        @keyframes pop {
            0% { transform: scale(0.8); opacity: 0; }
            100% { transform: scale(1); opacity: 1; }
        }

        .status-approved {
            background: #ecfdf5;
            color: var(--success);
            border: 1px solid #d1fae5;
        }

        .status-pending {
            background: #fffbeb;
            color: var(--pending);
            border: 1px solid #fef3c7;
        }

        .status-rejected {
            background: #fef2f2;
            color: var(--danger);
            border: 1px solid #fee2e2;
        }

        .verification-indicator {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            margin-top: 32px;
            padding-top: 24px;
            border-top: 1px solid #f1f5f9;
        }

        .check-icon {
            width: 20px;
            height: 20px;
            color: var(--success);
        }

        .verification-text {
            font-size: 12px;
            font-weight: 600;
            color: var(--success);
        }

        .footer {
            margin-top: auto;
            padding: 32px 16px 16px;
            text-align: center;
            font-size: 11px;
            font-weight: 500;
            color: var(--text-muted);
            line-height: 1.6;
        }

        @media (max-width: 380px) {
            .info-grid {
                grid-template-columns: 1fr;
                gap: 16px;
            }
            .info-item.mobile-half {
                grid-column: span 1;
            }
        }
    </style>
</head>
<body>
    <header class="header">
        <img src="https://ritchennai.org/admissions/image/rit-logo-new.png" alt="College Logo" class="logo">
        <div class="college-name">Rajalakshmi Institute of Technology</div>
        <h1 class="portal-title">OD Verification Portal</h1>
        <div class="divider"></div>
    </header>

    <main class="verification-card">
        <div class="info-grid">
            <div class="info-item full-width">
                <span class="label">Student Name</span>
                <span class="value" style="font-size: 18px;">${studentName}</span>
            </div>

            <div class="info-item">
                <span class="label">Register Number</span>
                <span class="value">${rollNumber}</span>
            </div>

            <div class="info-item">
                <span class="label">Department</span>
                <span class="value">${application.student.department || 'N/A'}</span>
            </div>

            <div class="info-item full-width">
                <span class="label">Event Name</span>
                <span class="value">${application.event_name || application.reason}</span>
            </div>

            <div class="info-item">
                <span class="label">Event Date</span>
                <span class="value">${application.start_date || new Date(application.fromDate).toLocaleDateString()}</span>
            </div>

            <div class="info-item">
                <span class="label">Faculty Approval</span>
                <span class="value">${application.faculty_status || 'PENDING'}</span>
            </div>

            <div class="info-item full-width">
                <span class="label">OD Status</span>
                <div class="status-badge ${application.status === 'HOD_APPROVED' ? 'status-approved' : application.status === 'REJECTED' ? 'status-rejected' : 'status-pending'}">
                    ${application.status === 'HOD_APPROVED' ? '● Verified & Approved' : application.status === 'REJECTED' ? '● Application Rejected' : '● Processing / Pending'}
                </div>
            </div>
        </div>

        <div class="verification-indicator">
            <svg class="check-icon" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"></path>
            </svg>
            <span class="verification-text">Verified by College OD Management System</span>
        </div>
    </main>

    <footer class="footer">
        Official Verification Page – College OD Management System<br>
        &copy; ${new Date().getFullYear()} Rajalakshmi Institute of Technology
    </footer>
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
