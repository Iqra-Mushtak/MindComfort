const User = require('../models/User');
const mongoose = require('mongoose');

exports.getAllModerators = async (req, res) => {
    try {
        const { search, status, page = 1, limit = 20 } = req.query;
        let filter = { role: 'moderator' };

        if (search) {
            if (mongoose.Types.ObjectId.isValid(search) && search.length === 24) {
                filter.$or = [
                    { username: { $regex: search, $options: 'i' } },
                    { email: { $regex: search, $options: 'i' } },
                    { _id: search }
                ];
            } else {
                filter.$or = [
                    { username: { $regex: search, $options: 'i' } },
                    { email: { $regex: search, $options: 'i' } }
                ];
            }
        }

        if (status === 'active') {
            filter.isSuspended = false;
        } else if (status === 'suspended') {
            filter.isSuspended = true;
        }

        const skip = (page - 1) * limit;
        const moderators = await User.find(filter)
            .select('-password -otp')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit));

        const total = await User.countDocuments(filter);

        res.status(200).json({
            total,
            page: parseInt(page),
            limit: parseInt(limit),
            pages: Math.ceil(total / limit),
            moderators
        });
    } catch (error) {
        res.status(500).json({ message: 'Error fetching moderators', error: error.message });
    }
};

exports.createModerator = async (req, res) => {
    try {
        const { username, email, password } = req.body;

        // Check if user exists
        const existingUser = await User.findOne({ 
            $or: [{ email }, { username }] 
        });

        if (existingUser) {
            return res.status(400).json({ message: 'User already exists' });
        }

        const moderator = new User({
            username,
            email,
            password, 
            role: 'moderator',
            isVerified: true
        });

        await moderator.save();

        const modResponse = moderator.toObject();
        delete modResponse.password;

        res.status(201).json({ message: 'Moderator created successfully', moderator: modResponse });
    } catch (error) {
        res.status(500).json({ message: 'Error creating moderator', error: error.message });
    }
};

exports.getModeratorDetails = async (req, res) => {
    try {
        const { moderatorId } = req.params;

        const moderator = await User.findById(moderatorId).select('-password -otp');
        if (!moderator || moderator.role !== 'moderator') {
            return res.status(404).json({ message: 'Moderator not found' });
        }

        res.status(200).json({ moderator });
    } catch (error) {
        res.status(500).json({ message: 'Error fetching moderator details', error: error.message });
    }
};

exports.suspendModerator = async (req, res) => {
    try {
        const { moderatorId } = req.params;
        const { reason } = req.body;

        const moderator = await User.findByIdAndUpdate(
            moderatorId,
            { isSuspended: true },
            { returnDocument: 'after' }
        ).select('-password -otp');

        if (!moderator) {
            return res.status(404).json({ message: 'Moderator not found' });
        }

        res.status(200).json({ message: 'Moderator suspended successfully', moderator });
    } catch (error) {
        res.status(500).json({ message: 'Error suspending moderator', error: error.message });
    }
};

exports.unsuspendModerator = async (req, res) => {
    try {
        const { moderatorId } = req.params;

        const moderator = await User.findByIdAndUpdate(
            moderatorId,
            { isSuspended: false },
            { returnDocument: 'after' }
        ).select('-password -otp');

        if (!moderator) {
            return res.status(404).json({ message: 'Moderator not found' });
        }

        res.status(200).json({ message: 'Moderator unsuspended successfully', moderator });
    } catch (error) {
        res.status(500).json({ message: 'Error unsuspending moderator', error: error.message });
    }
};

exports.getModeratorStats = async (req, res) => {
    try {
        const stats = {
            totalModerators: await User.countDocuments({ role: 'moderator' }),
            activeModerators: await User.countDocuments({ role: 'moderator', isSuspended: false }),
            suspendedModerators: await User.countDocuments({ role: 'moderator', isSuspended: true })
        };

        res.status(200).json({ stats });
    } catch (error) {
        res.status(500).json({ message: 'Error fetching moderator stats', error: error.message });
    }
};
