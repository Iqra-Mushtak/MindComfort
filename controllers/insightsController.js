const User = require('../models/User');
const MentorProfile = require('../models/MentorProfile');
const Chatroom = require('../models/Chatroom');
const ChatReports = require('../models/ChatReports');
const MentorApplication = require('../models/MentorApplication');
const Podcast = require('../models/Podcast');

exports.getAdminDashboardInsights = async (req, res) => {
    try {
        const [
            users,
            chatrooms,
            pendingReports,
            pendingPodcasts,
            mentorProfiles
        ] = await Promise.all([
            User.find({}),
            Chatroom.find({}),
            Report.countDocuments({ status: 'pending' }),
            Podcast.countDocuments({ status: 'pending' }),
            MentorProfile.find({}),
        ]);

        // Helper: Categorize Users
        const clients = users.filter(u => u.role === 'client');
        const mentors = users.filter(u => u.role === 'mentor');

        const insights = {
            users: {
                totalClients: clients.length,
                activeClients: clients.filter(c => !c.isSuspended).length,
                suspendedClients: clients.filter(c => c.isSuspended).length,
                totalMentors: mentors.length,
                activeMentors: mentors.filter(m => !m.isSuspended).length,
                suspendedMentors: mentors.filter(m => m.isSuspended).length,
                pendingMentorApplications: mentors.filter(m => m.status === 'pending').length,
            },
            chat: {
                totalChatrooms: chatrooms.length,
                activeChatrooms: chatrooms.filter(c => c.isActive).length,
                subscribedClients: clients.filter(c => c.isSubscribed).length,
            },
            moderation: {
                pendingReports,
                pendingMentorApplications: users.filter(u => u.role === 'mentor' && u.status === 'pending').length,
            },
            podcasts: {
                pendingPodcastLists: pendingPodcasts,
                totalListenCount: (await Podcast.aggregate([
                    { $group: { _id: null, total: { $sum: "$listenCount" } } }
                ]))[0]?.total || 0
            }
        };

        res.status(200).json({ insights });
    } catch (error) {
        res.status(500).json({ message: 'Error generating system insights', error: error.message });
    }
};