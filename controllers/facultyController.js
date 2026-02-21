const jwt = require('jsonwebtoken');
const Faculty = require('../models/Faculty');
const Student = require('../models/Student');
const asyncHandler = require('../middleware/asyncHandler');

// Generate JWT
const generateToken = (id, role) => {
    return jwt.sign({ id, role }, process.env.JWT_SECRET, { expiresIn: '30d' });
};

const loginFaculty = asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    console.log(`Login attempt for Faculty/Admin: ${email}`);

    const faculty = await Faculty.findOne({
        $or: [{ email: email }, { staffId: email }]
    });

    if (faculty) {
        // Enforce role-based access
        if (faculty.role === 'STUDENT') {
            res.status(403);
            throw new Error('Unauthorized Role Access');
        }

        const isPasswordMatch = await faculty.matchPassword(password);
        // Assuming faculty model also has phone, or just use password
        const isPhoneMatch = faculty.phone === password;

        if (isPasswordMatch || isPhoneMatch) {
            res.json({
                _id: faculty._id,
                staffId: faculty.staffId,
                name: faculty.name,
                email: faculty.email,
                role: faculty.role,
                department: faculty.department,
                token: generateToken(faculty._id, faculty.role),
            });
            return;
        }
    }

    res.status(401);
    throw new Error('Invalid credentials (Email/StaffId and Password/Phone)');
});

// @desc    Register a new faculty (Useful for testing)
// @route   POST /api/auth/faculty/register
const registerFaculty = asyncHandler(async (req, res) => {
    const { staffId, name, email, password, department, role } = req.body;
    const facultyExists = await Faculty.findOne({ $or: [{ email }, { staffId }] });

    if (facultyExists) {
        res.status(400);
        throw new Error('Faculty already exists');
    }

    const faculty = await Faculty.create({ staffId, name, email, password, department, role });
    res.status(201).json({
        _id: faculty._id,
        name: faculty.name,
        role: faculty.role,
        token: generateToken(faculty._id, faculty.role),
    });
});

// @desc    Get student details by registration number
// @route   GET /api/auth/faculty/student/:regNo
// @access  Private/Faculty
const getStudentByRegNo = asyncHandler(async (req, res) => {
    const student = await Student.findOne({ regNo: req.params.regNo }).select('-password');

    if (student) {
        res.json(student);
    } else {
        res.status(404);
        throw new Error('Student not found');
    }
});

// @desc    Update extra OD approval for student
// @route   PUT /api/auth/faculty/student/:id/extra-od
// @access  Private/Faculty
const updateExtraOD = asyncHandler(async (req, res) => {
    const { extraODApproved } = req.body;
    const student = await Student.findById(req.params.id);

    if (student) {
        student.extraODApproved = extraODApproved;
        const updatedStudent = await student.save();
        res.json(updatedStudent);
    } else {
        res.status(404);
        throw new Error('Student not found');
    }
});

module.exports = { loginFaculty, registerFaculty, getStudentByRegNo, updateExtraOD };
