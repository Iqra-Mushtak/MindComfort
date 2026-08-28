const express = require('express');
const router = express.Router();
const { protect, adminOnly } = require('../middleware/authmiddleware');

// Controllers
const { getAdminDashboardInsights } = require('../controllers/insightsController');
const {
    getAllClients,
    getClientDetails,
    getSubscriptionBreakdown,
    suspendClient,
    unsuspendClient,
    getSubscriptionStats
} = require('../controllers/adminClientController');
const {
    getAllMentors,
    getMentorDetails,
    getPendingApplications,
    approveMentorApplication,
    rejectMentorApplication,
    suspendMentor,
    unsuspendMentor,
    getMentorStats,
    getMentorDocumentProxy
} = require('../controllers/adminMentorController');
const {
    getAllChatrooms,
    getChatroomDetails,
    createChatroom,
    updateChatroom,
    deleteChatroom,
    getChatroomMessages,
    deleteMessage,
    toggleChatroomStatus,
    warnChatUser,
    suspendChatUser
} = require('../controllers/adminChatroomController');
const {
    getAllPodcasts,
    getPodcastDetails,
    approvePodcast,
    rejectPodcast,
    deletePodcast,
    getPendingPodcasts,
    suspendPodcastUser,
    getPodcastStats,
    getPodcastComments,
    deletePodcastComment,
    warnPodcastUser,
    suspendPodcastCommentUser
} = require('../controllers/adminPodcastController');
const {
    getPendingReports,
    getReportDetails,
    approveReport,
    deleteReportedMessage,
    warnUser,
    suspendReportedUser,
    rejectReport,
    getReportStats
} = require('../controllers/adminReportController');
const {
    getAllModerators,
    createModerator,
    getModeratorDetails,
    suspendModerator,
    unsuspendModerator,
    getModeratorStats
} = require('../controllers/adminModeratorController');



router.get('/insights', protect, adminOnly, getAdminDashboardInsights);

// Clients
router.get('/clients', protect, adminOnly, getAllClients);
router.get('/clients/:clientId', protect, adminOnly, getClientDetails);
router.get('/clients/subscriptions/breakdown', protect, adminOnly, getSubscriptionBreakdown);
router.patch('/clients/:clientId/suspend', protect, adminOnly, suspendClient);
router.patch('/clients/:clientId/unsuspend', protect, adminOnly, unsuspendClient);
router.get('/clients/stats/overview', protect, adminOnly, getSubscriptionStats);

// Mentors
router.get('/mentors', protect, adminOnly, getAllMentors);
router.get('/mentors/:mentorId', protect, adminOnly, getMentorDetails);
router.get('/applications/pending', protect, adminOnly, getPendingApplications);
router.patch('/applications/:applicationId/approve', protect, adminOnly, approveMentorApplication);
router.patch('/applications/:applicationId/reject', protect, adminOnly, rejectMentorApplication);
router.patch('/mentors/:mentorId/suspend', protect, adminOnly, suspendMentor);
router.patch('/mentors/:mentorId/unsuspend', protect, adminOnly, unsuspendMentor);
router.get('/mentors/stats/overview', protect, adminOnly, getMentorStats);
router.get('/mentors/document-proxy', protect, adminOnly, getMentorDocumentProxy);

// Chatrooms
router.get('/chatrooms', protect, adminOnly, getAllChatrooms);
router.get('/chatrooms/:chatroomId', protect, adminOnly, getChatroomDetails);
router.post('/chatrooms', protect, adminOnly, createChatroom);
router.patch('/chatrooms/:chatroomId', protect, adminOnly, updateChatroom);
router.patch('/chatrooms/:chatroomId/toggle-status', protect, adminOnly, toggleChatroomStatus);
router.delete('/chatrooms/:chatroomId', protect, adminOnly, deleteChatroom);
router.get('/chatrooms/:chatroomId/messages', protect, adminOnly, getChatroomMessages);
router.delete('/messages/:messageId', protect, adminOnly, deleteMessage);
router.patch('/chat-users/:userId/warn', protect, adminOnly, warnChatUser);
router.patch('/chat-users/:userId/suspend', protect, adminOnly, suspendChatUser);

// Podcasts
router.get('/podcasts', protect, adminOnly, getAllPodcasts);
router.get('/podcasts/:podcastId', protect, adminOnly, getPodcastDetails);
router.get('/podcasts/pending/list', protect, adminOnly, getPendingPodcasts);
router.patch('/podcasts/:podcastId/approve', protect, adminOnly, approvePodcast);
router.patch('/podcasts/:podcastId/reject', protect, adminOnly, rejectPodcast);
router.delete('/podcasts/:podcastId', protect, adminOnly, deletePodcast);
router.patch('/podcasts/:podcastId/suspend-user/:userId', protect, adminOnly, suspendPodcastUser);
router.get('/podcasts/stats/overview', protect, adminOnly, getPodcastStats);

// Podcast comment moderation
router.get('/podcasts/:podcastId/comments', protect, adminOnly, getPodcastComments);
router.delete('/podcast-comments/:commentId', protect, adminOnly, deletePodcastComment);
router.patch('/podcast-users/:userId/warn', protect, adminOnly, warnPodcastUser);
router.patch('/podcast-users/:userId/suspend', protect, adminOnly, suspendPodcastCommentUser);

// Reports
router.get('/reports/pending', protect, adminOnly, getPendingReports);
router.get('/reports/:reportId', protect, adminOnly, getReportDetails);
router.patch('/reports/:reportId/approve', protect, adminOnly, approveReport);
router.patch('/reports/:reportId/delete-message', protect, adminOnly, deleteReportedMessage);
router.patch('/reports/:reportId/warn-user', protect, adminOnly, warnUser);
router.patch('/reports/:reportId/suspend-user', protect, adminOnly, suspendReportedUser);
router.patch('/reports/:reportId/reject', protect, adminOnly, rejectReport);
router.get('/reports/stats/overview', protect, adminOnly, getReportStats);

// Moderators
router.get('/moderators', protect, adminOnly, getAllModerators);
router.post('/moderators', protect, adminOnly, createModerator);
router.get('/moderators/:moderatorId', protect, adminOnly, getModeratorDetails);
router.patch('/moderators/:moderatorId/suspend', protect, adminOnly, suspendModerator);
router.patch('/moderators/:moderatorId/unsuspend', protect, adminOnly, unsuspendModerator);
router.get('/moderators/stats/overview', protect, adminOnly, getModeratorStats);

module.exports = router;