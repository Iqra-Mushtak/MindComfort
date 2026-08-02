const Podcast = require('../models/Podcast');
const PodcastComment = require('../models/PodcastComment');
const User = require('../models/User');

exports.getAllPodcasts = async (req, res) => {
    try {
        const { search, status, type, page = 1, limit = 20 } = req.query;
        let filter = {};

        if (search) {
            const matchingUsers = await User.find({ 
                $or: [
                    { username: { $regex: search, $options: 'i' } },
                    { fullName: { $regex: search, $options: 'i' } }
                ]
            }).select('_id');
            
            const userIds = matchingUsers.map(u => u._id);
            
            filter.$or = [
                { title: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } },
                { speaker: { $in: userIds } }
            ];
        }

        if (status) {
            if (status === 'pending') filter.approvalStatus = 'pending';
            else if (status === 'approved') filter.approvalStatus = 'approved';
            else if (status === 'rejected') filter.approvalStatus = 'rejected';
        }

        if (type) {
            if (type === 'upcoming') filter.streamStatus = 'scheduled';
            else if (type === 'live') filter.streamStatus = 'live';
            else if (type === 'past') filter.streamStatus = 'ended';
        }

        const skip = (page - 1) * limit;
        const podcasts = await Podcast.find(filter)
            .populate('speaker', 'username fullName email')
            .sort({ startTime: -1 })
            .skip(skip)
            .limit(parseInt(limit));

        const total = await Podcast.countDocuments(filter);

        res.status(200).json({
            total,
            page: parseInt(page),
            limit: parseInt(limit),
            pages: Math.ceil(total / limit),
            podcasts
        });
    } catch (error) {
        res.status(500).json({ message: 'Error fetching podcasts', error: error.message });
    }
};

exports.getPodcastDetails = async (req, res) => {
    try {
        const { podcastId } = req.params;

        const podcast = await Podcast.findById(podcastId).populate('speaker', 'username fullName email');
        if (!podcast) {
            return res.status(404).json({ message: 'Podcast not found' });
        }

        const comments = await PodcastComment.find({ podcastId })
            .populate('user', 'username email role')
            .sort({ createdAt: -1 });

        res.status(200).json({ podcast, comments });
    } catch (error) {
        res.status(500).json({ message: 'Error fetching podcast details', error: error.message });
    }
};

exports.approvePodcast = async (req, res) => {
    try {
        const { podcastId } = req.params;

        const podcast = await Podcast.findByIdAndUpdate(
            podcastId,
            { approvalStatus: 'approved' },
            { returnDocument: 'after' }
        ).populate('speaker', 'username fullName email');

        if (!podcast) {
            return res.status(404).json({ message: 'Podcast not found' });
        }

        res.status(200).json({ message: 'Podcast approved successfully', podcast });
    } catch (error) {
        res.status(500).json({ message: 'Error approving podcast', error: error.message });
    }
};

exports.rejectPodcast = async (req, res) => {
    try {
        const { podcastId } = req.params;
        const { reason } = req.body;

        const podcast = await Podcast.findByIdAndUpdate(
            podcastId,
            { approvalStatus: 'rejected' },
            { returnDocument: 'after' }
        ).populate('speaker', 'username fullName email');

        if (!podcast) {
            return res.status(404).json({ message: 'Podcast not found' });
        }

        res.status(200).json({ message: 'Podcast rejected successfully', podcast });
    } catch (error) {
        res.status(500).json({ message: 'Error rejecting podcast', error: error.message });
    }
};

exports.deletePodcast = async (req, res) => {
    try {
        const { podcastId } = req.params;

        const podcast = await Podcast.findByIdAndDelete(podcastId);
        if (!podcast) {
            return res.status(404).json({ message: 'Podcast not found' });
        }

        res.status(200).json({ message: 'Podcast deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Error deleting podcast', error: error.message });
    }
};

exports.getPendingPodcasts = async (req, res) => {
    try {
        const { page = 1, limit = 20 } = req.query;

        const skip = (page - 1) * limit;
        const podcasts = await Podcast.find({ approvalStatus: 'pending' })
            .populate('speaker', 'username fullName email')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit));

        const total = await Podcast.countDocuments({ approvalStatus: 'pending' });

        res.status(200).json({
            total,
            page: parseInt(page),
            limit: parseInt(limit),
            pages: Math.ceil(total / limit),
            podcasts
        });
    } catch (error) {
        res.status(500).json({ message: 'Error fetching pending podcasts', error: error.message });
    }
};

exports.suspendPodcastUser = async (req, res) => {
    try {
        const { userId } = req.params;
        const { reason } = req.body;

        const user = await User.findByIdAndUpdate(
            userId,
            { isSuspended: true },
            { returnDocument: 'after' }
        ).select('-password -otp');

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        res.status(200).json({ message: 'User suspended successfully', user });
    } catch (error) {
        res.status(500).json({ message: 'Error suspending user', error: error.message });
    }
};

exports.getPodcastStats = async (req, res) => {
    try {
        const now = new Date();
        const stats = {
            totalPodcasts: await Podcast.countDocuments({}),
            upcomingPodcasts: await Podcast.countDocuments({ streamStatus: 'scheduled' }),
            livePodcasts: await Podcast.countDocuments({ streamStatus: 'live' }),
            pastPodcasts: await Podcast.countDocuments({ streamStatus: 'ended' }),
            pendingApproval: await Podcast.countDocuments({ approvalStatus: 'pending' })
        };

        res.status(200).json({ stats });
    } catch (error) {
        res.status(500).json({ message: 'Error fetching podcast stats', error: error.message });
    }
};

exports.getPodcastComments = async (req, res) => {
    try {
        const { podcastId } = req.params;
        const { page = 1, limit = 50 } = req.query;

        const skip = (page - 1) * limit;
        const comments = await PodcastComment.find({ podcastId })
            .populate('user', 'username email role')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit));

        const total = await PodcastComment.countDocuments({ podcastId });

        res.status(200).json({
            total,
            page: parseInt(page),
            limit: parseInt(limit),
            comments
        });
    } catch (error) {
        res.status(500).json({ message: 'Error fetching comments', error: error.message });
    }
};

exports.deletePodcastComment = async (req, res) => {
    try {
        const { commentId } = req.params;

        const comment = await PodcastComment.findByIdAndDelete(commentId);
        if (!comment) {
            return res.status(404).json({ message: 'Comment not found' });
        }

        res.status(200).json({ message: 'Comment deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Error deleting comment', error: error.message });
    }
};

exports.warnPodcastUser = async (req, res) => {
    try {
        const { userId } = req.params;
        const { reason } = req.body;

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        if (!user.warnings) {
            user.warnings = 0;
        }
        user.warnings += 1;
        await user.save();

        const Notification = require('../models/Notifications');
        await Notification.create({
            recipientId: userId,
            type: 'podcast_warning',
            message: `You have received a warning for podcast comment conduct. Reason: ${reason || 'Violation of community guidelines'}`,
            link: '/dashboard'
        });

        res.status(200).json({ 
            message: `User warned successfully. Total warnings: ${user.warnings}`,
            user 
        });
    } catch (error) {
        res.status(500).json({ message: 'Error warning user', error: error.message });
    }
};

exports.suspendPodcastCommentUser = async (req, res) => {
    try {
        const { userId } = req.params;
        const { reason } = req.body;

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        user.isSuspended = true;
        if (!user.suspensionReasons) {
            user.suspensionReasons = [];
        }
        user.suspensionReasons.push({
            reason: reason || 'Violation of podcast guidelines',
            suspendedBy: req.user._id,
            date: new Date()
        });
        await user.save();

        const Notification = require('../models/Notifications');
        await Notification.create({
            recipientId: userId,
            type: 'account_suspended',
            message: `Your account has been suspended for: ${reason || 'Violation of community guidelines'}. Please contact support.`,
            link: '/support'
        });

        res.status(200).json({ 
            message: 'User suspended successfully',
            user 
        });
    } catch (error) {
        res.status(500).json({ message: 'Error suspending user', error: error.message });
    }
};
