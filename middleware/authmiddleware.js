const adminOnly = (req, res, next) => {

    const userRole = req.headers['role']; 

    if (userRole === 'admin') {
        next(); 
    } else {
        res.status(403).json({ message: "Access denied. Admins only." });
    }
};

const mentorOnly = (req, res, next) => {
    if (req.headers.role !== 'mentor') {
        return res.status(403).json({ message: "Access Denied. Mentors only." });
    }
    next();
};

module.exports = { adminOnly, mentorOnly };