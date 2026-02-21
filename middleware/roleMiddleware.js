const authorize = (...roles) => {
    return (req, res, next) => {
        // If student, they don't have a 'role' field in schema, but we can treat them as 'STUDENT'
        const userRole = req.user.role || 'STUDENT';

        if (!roles.includes(userRole)) {
            return res.status(403).json({
                message: `User role ${userRole} is not authorized to access this route`
            });
        }
        next();
    };
};

module.exports = { authorize };
