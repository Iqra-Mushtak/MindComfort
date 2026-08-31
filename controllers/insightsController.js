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
            mentorApplicationsCount,  
            mentorProfiles,
            activeSubscriptions,
            expiredSubscriptions,
            suspendedSubscriptions,
            activeChatSubs,
            activePodcastSubs,
            completedPayments,
            revenueAgg,
            latestApplications,
            latestPodcasts,
            latestReports
        ] = await Promise.all([
            User.find({}),
            Chatroom.find({}),
            ChatReports.countDocuments({ status: 'pending' }),
            Podcast.countDocuments({ approvalStatus: 'pending' }),
            MentorApplication.countDocuments({ status: 'pending' }),
            MentorProfile.find({}),
            Subscription.countDocuments({ 
                status: 'active', 
                $or: [{ endDate: { $gt: now } }, { endDate: null }] 
            }),
            Subscription.countDocuments({ status: 'expired' }),
            Subscription.countDocuments({ status: 'suspended' }),
            Subscription.countDocuments({ 
                type: 'chat', 
                status: 'active', 
                $or: [{ endDate: { $gt: now } }, { endDate: null }] 
            }),
            Subscription.countDocuments({ 
                type: 'podcast', 
                status: 'active', 
                $or: [{ endDate: { $gt: now } }, { endDate: null }] 
            }),
            Subscription.countDocuments({ 
                status: 'active',
                paymentStatus: 'completed'
            }),
            Subscription.aggregate([
                { $match: { 
                    status: 'active',
                    paymentStatus: 'completed'
                }},
                { $group: { _id: null, total: { $sum: '$planPrice' } } }
            ]),
            MentorApplication.find({ status: 'pending' })
                .populate('mentorId', 'username email')
                .sort({ createdAt: -1 })
                .limit(3),
            Podcast.find({ approvalStatus: 'pending' })
                .populate('speaker', 'username email')
                .sort({ createdAt: -1 })
                .limit(3),
            ChatReports.find({ status: 'pending' })
                .populate('messageId', 'content')
                .populate('reportedBy', 'username')
                .sort({ createdAt: -1 })
                .limit(3)
        ]);

        const activityKeys = await redisClient.keys(`activity:chatroom:*:total:${date}`);
        let messagesToday = 0;
        for(const key of activityKeys) {
            messagesToday += parseInt(await redisClient.get(key) || 0);
        }

        const clients = users.filter(u => u.role === 'client');
        const mentors = users.filter(u => u.role === 'mentor');
        const approvedMentorUserIds = new Set(
            (await MentorApplication.distinct('mentorId', { status: 'approved' })).map(id => id.toString())
        );

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
                activeMentors: mentors.filter(m => {
                    const mentorId = m._id.toString();
                    return !m.isSuspended && (m.status === 'approved' || approvedMentorUserIds.has(mentorId));
                }).length,
                suspendedMentors: mentors.filter(m => m.isSuspended).length,
                pendingMentorApplications: mentorApplicationsCount,
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
                totalRevenue: revenueAgg[0]?.total || 0, 
                completedPayments: completedPayments
            },
            plans: {
                totalPlans: planStats.length,
                activePlans: planStats.filter(p => p.isActive).length,
                plans: planStats
            },
            moderation: {
                pendingReports,
                pendingMentorApplications: mentorApplicationsCount,
            },
            podcasts: {
                pendingPodcastLists: pendingPodcasts,
                totalListenCount: (await Podcast.aggregate([
                    { $group: { _id: null, total: { $sum: "$listenCount" } } }
                ]))[0]?.total || 0
            },
            quickView: {
                applications: latestApplications.map(app => ({
                    name: app.fullName || app.mentorId?.username || 'Unknown Applicant',
                    time: app.createdAt ? new Date(app.createdAt).toLocaleString() : 'Recently'
                })),
                podcasts: latestPodcasts.map(pod => ({
                    title: pod.title || 'Untitled Podcast',
                    speaker: pod.speaker?.username || 'Unknown Speaker',
                    time: pod.createdAt ? new Date(pod.createdAt).toLocaleString() : 'Recently'
                })),
                reports: latestReports.map(rep => ({
                    title: rep.reason || 'Reported Message',
                    speaker: rep.reportedBy?.username || 'Unknown User',
                    time: rep.createdAt ? new Date(rep.createdAt).toLocaleString() : 'Recently'
                }))
            }
        };

        res.status(200).json({ insights });
    } catch (error) {
        console.error("Error in getAdminDashboardInsights:", error);
        res.status(500).json({ message: 'Error generating system insights', error: error.message });
    }
};