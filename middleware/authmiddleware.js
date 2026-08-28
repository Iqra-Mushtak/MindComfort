const jwt = require('jsonwebtoken');
const User = require('../models/User');

const protect = async (req, res, next) => {
    let token;

    // 1. Check Authorization header
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        token = req.headers.authorization.split(' ')[1];
    } 
    // 2. Check query parameter (for file download/view links)
    else if (req.query && req.query.token) {
        token = req.query.token;
    }

    if (!token) {
        return res.status(401).json({ message: 'Not authorized, no token.' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id).select('-password');

        if (!user) {
            return res.status(401).json({ message: 'User no longer exists.' });
        }

        if (decoded.tokenVersion !== undefined && user.tokenVersion !== decoded.tokenVersion) {
            return res.status(401).json({ message: 'Session expired. Please log in again.' });
        }

        if (user.isSuspended || user.isBlacklisted || (user.role === 'mentor' && user.status === 'rejected')) {
            return res.status(403).json({ message: 'Your account is currently inactive or suspended.' });
        }

        const timeLimit = 15 * 60 * 1000; 
        const isDataOld = !user.lastActive || (Date.now() - user.lastActive) > timeLimit;

        if (isDataOld) {
            User.updateOne(
                { _id: user._id }, 
                { $set: { lastActive: Date.now() } }
            ).catch(err => console.error("LastActive update failed:", err));
        }
        
        req.user = user;
        next();
    } catch (error) {
        console.error("JWT Auth Error:", error.message);
        res.status(401).json({ message: 'Not authorized, token failed.' });
    }
};

const adminOnly = (req, res, next) => {

    // console.log("AdminOnly hit");
    if (req.user && req.user.role === 'admin') {
        next(); 
    } else {
        res.status(403).json({ message: "Access denied. Admins only." });
    }
};

const adminOrModerator = (req, res, next) => {

    if (req.user && (req.user.role === 'admin' || req.user.role === 'moderator')) {
        next(); 
    } else {
        res.status(403).json({ message: "Access denied. Admins or moderators only." });
    }
};

const mentorOnly = (req, res, next) => {
    if (req.user && req.user.role === 'mentor') {
        next();
    } else {
        res.status(403).json({ message: "Access Denied. Mentors only." });
    }
};

module.exports = { protect, adminOnly, adminOrModerator, mentorOnly };