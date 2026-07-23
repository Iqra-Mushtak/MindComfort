const Subscription = require('../models/Subscription');
const User = require('../models/User');

const verifySubscription = (moduleType) => async (req, res, next) => {
    try {
        if (['admin', 'moderator'].includes(req.user.role)) return next();

        const user = await User.findById(req.user._id);
        if (user.isSuspended) {
            return res.status(403).json({ message: 'Your account is suspended. Cannot access this resource.' });
        }

        if (req.user.role === 'mentor' && user.status === 'approved' && !user.isSuspended) {
            if (moduleType === 'chat') return next();
        }

        if (moduleType === 'podcast' && req.user.role === 'mentor' && user.status === 'approved') {
            req.isMentor = true;
            return next();
        }

        if (req.user.role === 'client') {
            const activeSub = await Subscription.findOne({
                userId: req.user._id,
                type: moduleType,
                status: 'active',
                $or: [
                    { endDate: { $gt: new Date() } },
                    { endDate: null }
                ]
            });

            if (!activeSub) {
                return res.status(403).json({ 
                    message: `Active ${moduleType} subscription required to access this resource.`,
                    code: 'SUBSCRIPTION_REQUIRED'
                });
            }

            req.subscription = activeSub;
            return next();
        }

        return res.status(403).json({ message: `Access denied. ${moduleType} subscription required.` });
    } catch (error) {
        res.status(500).json({ message: 'Error verifying subscription', error: error.message });
    }
};

const verifyPodcastRecordingAccess = async (req, res, next) => {
    try {
        // Admin and Moderator bypass
        if (['admin', 'moderator'].includes(req.user.role)) return next();

        const user = await User.findById(req.user._id);
        
        if (user.isSuspended) {
            return res.status(403).json({ message: 'Your account is suspended.' });
        }

        if (req.user.role === 'mentor' && user.status === 'approved') {
            return next();
        }

        if (req.user.role === 'client') {
            const activeSub = await Subscription.findOne({
                userId: req.user._id,
                type: 'podcast',
                status: 'active',
                $or: [
                    { endDate: { $gt: new Date() } },
                    { endDate: null }
                ]
            });

            if (!activeSub) {
                return res.status(403).json({ 
                    message: 'Active podcast subscription required to access recordings.' 
                });
            }
            return next();
        }

        return res.status(403).json({ message: 'Access denied.' });
    } catch (error) {
        res.status(500).json({ message: 'Error verifying access', error: error.message });
    }
};

const verifyChatOperation = async (req, res, next) => {
    try {
        if (['admin', 'moderator'].includes(req.user.role)) return next();

        const user = await User.findById(req.user._id);

        // Suspended users cannot perform operations
        if (user.isSuspended) {
            return res.status(403).json({ message: 'Your account is suspended. Cannot perform this action.' });
        }

        if (req.user.role === 'mentor' && user.status === 'approved') return next();

        if (req.user.role === 'client') {
            const activeSub = await Subscription.findOne({
                userId: req.user._id,
                type: 'chat',
                status: 'active',
                $or: [
                    { endDate: { $gt: new Date() } },
                    { endDate: null }
                ]
            });

            if (!activeSub) {
                return res.status(403).json({ 
                    message: 'Active chat subscription required to perform this action.',
                    code: 'SUBSCRIPTION_REQUIRED'
                });
            }
            return next();
        }

        return res.status(403).json({ message: 'Insufficient permissions.' });
    } catch (error) {
        res.status(500).json({ message: 'Error verifying chat operation', error: error.message });
    }
};

module.exports = { verifySubscription, verifyPodcastRecordingAccess, verifyChatOperation };