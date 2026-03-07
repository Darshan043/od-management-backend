const jwt = require('jsonwebtoken');
const Student = require('../models/Student');
const Faculty = require('../models/Faculty');

const protect = async (req, res, next) => {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        try {
            token = req.headers.authorization.split(' ')[1];
            const decoded = jwt.verify(token, process.env.JWT_SECRET);

            // Check if it's a student or faculty
            let user = await Student.findById(decoded.id).select('-password');
            if (!user) {
                user = await Faculty.findById(decoded.id).select('-password');
            }

            if (!user) {
                return res.status(401).json({ message: 'Not authorized, user not found' });
            }

            req.user = user;
            next();
        } catch (error) {
            console.error(error);
            res.status(401).json({ message: 'Not authorized, token failed' });
        }
    }

    if (!token) {
        res.status(401).json({ message: 'Not authorized, no token' });
    }
};

const allowStudent = (req, res, next) => {
    if (req.user && req.user.role === 'STUDENT') {
        next();
    } else {
        res.status(403).json({ message: 'Unauthorized Role Access' });
    }
};

const allowFaculty = (req, res, next) => {
    const allowedRoles = ['FACULTY', 'COORDINATOR', 'HOD', 'ADMIN'];
    if (req.user && allowedRoles.includes(req.user.role)) {
        next();
    } else {
        res.status(403).json({ message: 'Unauthorized Role Access' });
    }
};

const allowHOD = (req, res, next) => {
    const allowedRoles = ['HOD', 'ADMIN'];
    if (req.user && allowedRoles.includes(req.user.role)) {
        next();
    } else {
        res.status(403).json({ message: 'Unauthorized Role Access' });
    }
};

const allowAdmin = (req, res, next) => {
    if (req.user && req.user.role === 'ADMIN') {
        next();
    } else {
        res.status(403).json({ message: 'Unauthorized Role Access' });
    }
};

const authorize = (...roles) => {
    return (req, res, next) => {
        if (!req.user || !roles.includes(req.user.role)) {
            return res.status(403).json({ message: `Role ${req.user ? req.user.role : 'none'} is not authorized to access this route` });
        }
        next();
    };
};

module.exports = { protect, allowStudent, allowFaculty, allowHOD, allowAdmin, authorize };
