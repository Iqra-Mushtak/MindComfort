const User = require('../models/User');
const MentorProfile = require('../models/MentorProfile');
const Chatroom = require('../models/Chatroom');
const ChatReports = require('../models/ChatReports');
const MentorApplication = require('../models/MentorApplication');
const Podcast = require('../models/Podcast');
const Subscription = require('../models/Subscription');
const Payment = require('../models/Payment');
const Plan = require('../models/Plan');
const redisClient = require('../config/redis');

exports.getAdminDashboardInsights = async (req, res) => {
    try {
        const date = new Date().toISOString().split('T')[0];
        const now = new Date();

        const [
            users,
            chatrooms,
            pendingReports,
            pendingPodcasts,
            mentorProfiles,
            activeSubscriptions,
            expiredSubscriptions,
            suspendedSubscriptions,
            activeChatSubs,
            activePodcastSubs,
            completedPayments,
            totalRevenueAgg
        ] = await Promise.all([
            User.find({}),
            Chatroom.find({}),
            ChatReports.countDocuments({ status: 'pending' }),
            Podcast.countDocuments({ status: 'pending' }),
            MentorApplication.countDocuments({status: 'pending'}),
            MentorProfile.find({}),
            Subscription.countDocuments({ status: 'active', endDate: { $gt: now } }),
            Subscription.countDocuments({ status: 'expired' }),
            Subscription.countDocuments({ status: 'suspended' }),
            Subscription.countDocuments({ type: 'chat', status: 'active', endDate: { $gt: now } }),
            Subscription.countDocuments({ type: 'podcast', status: 'active', endDate: { $gt: now } }),
            Payment.countDocuments({ status: 'completed' }),
            Payment.aggregate([
                { $match: { status: 'completed' } },
                { $group: { _id: null, total: { $sum: '$amount' } } }
            ])
        ]);

        const activityKeys = await redisClient.keys(`activity:chatroom:*:total:${date}`);
        let messagesToday = 0;
        for(const key of activityKeys) {
            messagesToday += parseInt(await redisClient.get(key) || 0);
        }

        const clients = users.filter(u => u.role === 'client');
        const mentors = users.filter(u => u.role === 'mentor');

        const planStats = await Plan.aggregate([
            {
                $lookup: {
                    from: 'subscriptions',
                    localField: '_id',
                    foreignField: 'planId',
                    as: 'subscriptions'
                }
            },
            {
                $project: {
                    name: 1,
                    type: 1,
                    price: 1,
                    isActive: 1,
                    totalSubscriptions: { $size: '$subscriptions' },
                    activeSubscriptions: {
                        $size: {
                            $filter: {
                                input: '$subscriptions',
                                as: 'sub',
                                cond: { $eq: ['$$sub.status', 'active'] }
                            }
                        }
                    }
                }
            },
            { $sort: { totalSubscriptions: -1 } }
        ]);

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
                messagesToday: messagesToday,
            },
            subscriptions: {
                activeSubscriptions: activeSubscriptions,
                expiredSubscriptions: expiredSubscriptions,
                suspendedSubscriptions: suspendedSubscriptions,
                activeChatSubscriptions: activeChatSubs,
                activePodcastSubscriptions: activePodcastSubs,
                totalRevenue: totalRevenueAgg[0]?.total || 0,
                completedPayments: completedPayments
            },
            plans: {
                totalPlans: planStats.length,
                activePlans: planStats.filter(p => p.isActive).length,
                plans: planStats
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