const User = require('../models/User');
const NotificationService = require('../services/notificationService');

exports.suspendMentor = async (req, res) => {
    try {
        const { mentorId } = req.params;
        const { reason } = req.body;
        
        const mentor = await User.findById(mentorId);
        if (!mentor || mentor.role !== 'mentor') {
            return res.status(404).json({ message: "Mentor not found." });
        }

        if (mentor.isSuspended) {
            return res.status(400).json({ message: "Mentor is already suspended." });
        }

        mentor.isSuspended = true;
        
        mentor.tokenVersion += 1; 
        await mentor.save();

        await NotificationService.sendNotification({
            recipientId: mentor._id,
            type: 'mentor_suspended',
            message: `Your mentor account has been suspended.${reason ? ` Reason: ${reason.trim()}` : ''}`,
            link: '/support',
            channels: ['in-app']
        });

        res.status(200).json({ message: "Mentor suspended successfully." });
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

exports.unsuspendMentor = async (req, res) => {
    try {
        const { mentorId } = req.params;

        const mentor = await User.findById(mentorId);
        if (!mentor || mentor.role !== 'mentor') {
            return res.status(404).json({ message: "Mentor not found." });
        }

        if (!mentor.isSuspended) {
            return res.status(400).json({ message: "Mentor is not currently suspended." });
        }

        mentor.isSuspended = false;
        await mentor.save();

        await NotificationService.sendNotification({
            recipientId: mentor._id,
            type: 'mentor_unsuspended',
            message: 'Your mentor account has been restored. You can now access your account.',
            link: '/mentor/dashboard',
            channels: ['in-app']
        });

        res.status(200).json({ message: "Mentor unsuspended successfully." });
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};