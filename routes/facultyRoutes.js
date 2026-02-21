const express = require('express');
const router = express.Router();
const {
    loginFaculty,
    registerFaculty,
    getStudentByRegNo,
    updateExtraOD
} = require('../controllers/facultyController');

const { protect, allowFaculty } = require('../middleware/authMiddleware');

router.post('/login', loginFaculty);
router.post('/register', registerFaculty); // Added for convenience

router.get('/student/:regNo', protect, allowFaculty, getStudentByRegNo);
router.put('/student/:id/extra-od', protect, allowFaculty, updateExtraOD);

module.exports = router;
