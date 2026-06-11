const User = require('../models/User');

exports.suspendMentor = async (req, res) => {
    try {
        const { mentorId } = req.params;
        
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

        res.status(200).json({ message: "Mentor unsuspended successfully." });
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};