const jwt = require('jsonwebtoken');
const Student = require('../models/Student');
const asyncHandler = require('../middleware/asyncHandler');

// Generate JWT
const generateToken = (id, role) => {
    return jwt.sign({ id, role }, process.env.JWT_SECRET, { expiresIn: '30d' });
};

// @desc    Register a new student
// @route   POST /api/auth/student/register
// @access  Public
const registerStudent = asyncHandler(async (req, res) => {
    const {
        regNo, name, email, password, department,
        year, section, CGPA, arrears, phone
    } = req.body;

    const studentExists = await Student.findOne({ $or: [{ email }, { regNo }] });

    if (studentExists) {
        res.status(400);
        throw new Error('Student already exists');
    }

    const student = await Student.create({
        regNo, name, email, password, department,
        year, section, CGPA, arrears, phone
    });

    if (student) {
        res.status(201).json({
            _id: student._id,
            regNo: student.regNo,
            name: student.name,
            email: student.email,
            role: student.role,
            token: generateToken(student._id, student.role),
        });
    } else {
        res.status(400);
        throw new Error('Invalid student data');
    }
});

const loginStudent = asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    console.log(`Login attempt for Student: ${email}`);

    const student = await Student.findOne({
        $or: [{ email: email }, { regNo: email }]
    });

    if (student) {
        // Enforce role-based access
        if (student.role !== 'STUDENT') {
            res.status(403);
            throw new Error('Unauthorized Role Access');
        }

        // Enforce OD limit check (Previous implementation)
        const totalAllowed = (student.odLimit || 5) + (student.extraODApproved || 0);
        if (student.odUsed >= totalAllowed) {
            res.status(403);
            throw new Error('OD_LIMIT_EXCEEDED');
        }

        // New OD Quota check as per latest request
        if (student.odQuota <= 0) {
            return res.status(403).json({
                success: false,
                message: "Your OD quota is finished. Contact class incharge."
            });
        }

        const isPasswordMatch = await student.matchPassword(password);
        const isPhoneMatch = student.phone === password;

        if (isPasswordMatch || isPhoneMatch) {
            res.json({
                _id: student._id,
                regNo: student.regNo,
                name: student.name,
                email: student.email,
                role: student.role,
                token: generateToken(student._id, student.role),
            });
            return;
        }
    }

    res.status(401);
    throw new Error('Invalid credentials (Email/RegNo and Password/Phone)');
});

// @desc    Add extra OD quota to a student
// @route   PUT /api/students/:id/add-od
// @access  Private/Faculty
const addOD = asyncHandler(async (req, res) => {
    const { addQuota } = req.body;
    const student = await Student.findById(req.params.id);

    if (student) {
        student.odQuota = (student.odQuota || 0) + Number(addQuota);
        const updatedStudent = await student.save();
        res.json({
            success: true,
            message: `Successfully added ${addQuota} to OD quota.`,
            odQuota: updatedStudent.odQuota
        });
    } else {
        res.status(404);
        throw new Error('Student not found');
    }
});

// @desc    Get student OD status
// @route   GET /api/auth/student/od-status
// @access  Private/Student
const getODStatus = asyncHandler(async (req, res) => {
    const student = await Student.findById(req.user._id);

    if (student) {
        const odLimit = student.odLimit || 5;
        const odUsed = student.odUsed || 0;
        const extraODApproved = student.extraODApproved || 0;
        const totalAllowedOD = odLimit + extraODApproved;
        const remainingOD = totalAllowedOD - odUsed;

        res.json({
            odLimit,
            odUsed,
            extraODApproved,
            totalAllowedOD,
            remainingOD
        });
    } else {
        res.status(404);
        throw new Error('Student not found');
    }
});

module.exports = { registerStudent, loginStudent, addOD, getODStatus };
