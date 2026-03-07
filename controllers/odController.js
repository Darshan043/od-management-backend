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

    // QR payload points to production verification endpoint
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

// @desc    Public verification endpoint for Digital OD Pass QR
// @route   GET /verify/:id
const verifyOD = asyncHandler(async (req, res) => {
    const od = await ODRequest.findById(req.params.id)
        .populate('student', 'name regNo department year section')
        .populate('approvedBy.faculty', 'name staffId role');

    if (!od) {
        return res.status(404).send(`
            <html>
                <head>
                    <meta name="viewport" content="width=device-width, initial-scale=1">
                    <style>
                        body { font-family: -apple-system, system-ui, sans-serif; text-align: center; padding: 50px; background: #f8fafc; }
                        .card { background: white; padding: 30px; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); max-width: 400px; margin: auto; }
                        .error-icon { font-size: 48px; margin-bottom: 20px; }
                        h1 { color: #e11d48; margin-bottom: 10px; font-size: 20px; }
                        p { color: #64748b; font-size: 14px; }
                    </style>
                </head>
                <body>
                    <div class="card">
                        <div class="error-icon">❌</div>
                        <h1>Invalid OD Pass</h1>
                        <p>The OD record associated with this QR code could not be found in our database.</p>
                    </div>
                </body>
            </html>
        `);
    }

    const isApproved = od.status === 'HOD_APPROVED' || od.isFinalApproved;
    const hodApproval = od.approvedBy.find(a => a.role === 'HOD');

    const formatDate = (date) => new Date(date).toLocaleDateString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric'
    });

    const formatTime = (date) => new Date(date).toLocaleString('en-GB', {
        hour: '2-digit', minute: '2-digit', hour12: true
    });

    const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>OD PASS VERIFICATION</title>
        <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap');
            :root { 
                --primary: #0F172A; 
                --success-bg: #dcfce7;
                --success-text: #166534;
                --danger-bg: #fee2e2;
                --danger-text: #991b1b;
                --gray-label: #64748b;
                --gray-value: #1e293b;
            }
            body { 
                font-family: 'Inter', system-ui, sans-serif; 
                background: #f1f5f9; 
                margin: 0; 
                padding: 20px; 
                display: flex;
                justify-content: center;
                align-items: center;
                min-height: 100vh;
            }
            .container { width: 100%; max-width: 450px; }
            .card { 
                background: white; 
                border-radius: 20px; 
                overflow: hidden; 
                box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.15); 
                border: 1px solid #e2e8f0; 
            }
            .header { 
                background: var(--primary); 
                color: white; 
                padding: 24px; 
                text-align: center; 
            }
            .header h1 { 
                margin: 0; 
                font-size: 16px; 
                font-weight: 800; 
                letter-spacing: 0.1em; 
                text-transform: uppercase; 
            }
            .status-banner { 
                padding: 16px; 
                text-align: center; 
                font-weight: 800; 
                font-size: 13px; 
                text-transform: uppercase;
                letter-spacing: 0.05em;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
            }
            .status-approved { 
                background: var(--success-bg); 
                color: var(--success-text); 
                border-bottom: 2px solid #bbf7d0;
            }
            .status-invalid { 
                background: var(--danger-bg); 
                color: var(--danger-text); 
                border-bottom: 2px solid #fecaca;
            }
            .content { padding: 32px 24px; }
            .info-item { margin-bottom: 20px; }
            .info-item:last-child { margin-bottom: 0; }
            .label { 
                font-size: 10px; 
                font-weight: 800; 
                color: var(--gray-label); 
                text-transform: uppercase; 
                letter-spacing: 0.1em; 
                margin-bottom: 4px; 
                display: block;
            }
            .value { 
                font-size: 16px; 
                font-weight: 700; 
                color: var(--gray-value); 
                display: block; 
                line-height: 1.4;
            }
            .value.large { font-size: 20px; }
            .divider { 
                height: 1px; 
                background: #f1f5f9; 
                margin: 20px 0; 
            }
            .footer { 
                text-align: center; 
                margin-top: 24px; 
                color: #94a3b8; 
                font-size: 10px; 
                font-weight: 600; 
                text-transform: uppercase;
                letter-spacing: 0.05em;
            }
            .watermark {
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%) rotate(-45deg);
                font-size: 80px;
                font-weight: 900;
                opacity: 0.03;
                pointer-events: none;
                white-space: nowrap;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="card" style="position: relative;">
                ${isApproved ? '<div class="watermark">APPROVED</div>' : '<div class="watermark" style="color: red;">INVALID</div>'}
                
                <div class="header">
                    <h1>OD Pass Verification</h1>
                </div>
                
                <div class="status-banner ${isApproved ? 'status-approved' : 'status-invalid'}">
                    ${isApproved ? '✅ VALID OD PASS – APPROVED' : '⚠️ INVALID OR UNAPPROVED OD REQUEST'}
                </div>

                <div class="content">
                    <div class="info-item">
                        <span class="label">Student Name</span>
                        <span class="value large">${od.student.name}</span>
                    </div>

                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                        <div class="info-item">
                            <span class="label">Register Number</span>
                            <span class="value">${od.student.regNo}</span>
                        </div>
                        <div class="info-item">
                            <span class="label">Department</span>
                            <span class="value">${od.student.department}</span>
                        </div>
                    </div>

                    <div class="divider"></div>

                    <div class="info-item">
                        <span class="label">Purpose of OD</span>
                        <span class="value">${od.reason}</span>
                    </div>

                    <div class="info-item">
                        <span class="label">OD Duration</span>
                        <span class="value">${formatDate(od.fromDate)} to ${formatDate(od.toDate)}</span>
                    </div>

                    <div class="divider"></div>

                    <div class="info-item">
                        <span class="label">Approved By</span>
                        <span class="value">${hodApproval ? hodApproval.faculty.name : 'System Administrator'}</span>
                    </div>

                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                        <div class="info-item">
                            <span class="label">Staff ID</span>
                            <span class="value">${hodApproval ? (hodApproval.faculty.staffId || 'N/A') : 'N/A'}</span>
                        </div>
                        <div class="info-item">
                            <span class="label">Approval Time</span>
                            <span class="value">${hodApproval ? formatTime(hodApproval.date) : formatDate(od.updatedAt)}</span>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="footer">
                RIT OD Management System &bull; Digital Verification
            </div>
        </div>
    </body>
    </html>
    `;

    res.send(html);
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
