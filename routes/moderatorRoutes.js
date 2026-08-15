const express = require('express');
const router = express.Router();
const { protect, adminOrModerator } = require('../middleware/authmiddleware');

// Controllers
const {
    getAllChatrooms,
    getChatroomDetails,
    getChatroomMessages,
    deleteMessage,
    warnChatUser,
    suspendChatUser
} = require('../controllers/adminChatroomController');
const {
    getAllPodcasts,
    getPodcastDetails,
    getPendingPodcasts,
    approvePodcast,
    rejectPodcast,
    deletePodcast,
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

// Insights/Dashboard
router.get('/insights', protect, adminOrModerator, (req, res) => {
    const insightsController = require('../controllers/insightsController');
    insightsController.getAdminDashboardInsights(req, res);
});

// Chatrooms - View and moderation
router.get('/chatrooms', protect, adminOrModerator, getAllChatrooms);
router.get('/chatrooms/:chatroomId', protect, adminOrModerator, getChatroomDetails);
router.get('/chatrooms/:chatroomId/messages', protect, adminOrModerator, getChatroomMessages);
router.delete('/messages/:messageId', protect, adminOrModerator, deleteMessage);
router.patch('/chat-users/:userId/warn', protect, adminOrModerator, warnChatUser);
router.patch('/chat-users/:userId/suspend', protect, adminOrModerator, suspendChatUser);

// Podcasts - View and moderation
router.get('/podcasts', protect, adminOrModerator, getAllPodcasts);
router.get('/podcasts/:podcastId', protect, adminOrModerator, getPodcastDetails);
router.get('/podcasts/pending/list', protect, adminOrModerator, getPendingPodcasts);
router.patch('/podcasts/:podcastId/approve', protect, adminOrModerator, approvePodcast);
router.patch('/podcasts/:podcastId/reject', protect, adminOrModerator, rejectPodcast);
router.delete('/podcasts/:podcastId', protect, adminOrModerator, deletePodcast);
router.patch('/podcasts/:podcastId/suspend-user/:userId', protect, adminOrModerator, suspendPodcastUser);
router.get('/podcasts/stats/overview', protect, adminOrModerator, getPodcastStats);

// Podcast comment moderation
router.get('/podcasts/:podcastId/comments', protect, adminOrModerator, getPodcastComments);
router.delete('/podcast-comments/:commentId', protect, adminOrModerator, deletePodcastComment);
router.patch('/podcast-users/:userId/warn', protect, adminOrModerator, warnPodcastUser);
router.patch('/podcast-users/:userId/suspend', protect, adminOrModerator, suspendPodcastCommentUser);

// Reports - View and moderation
router.get('/reports/pending', protect, adminOrModerator, getPendingReports);
router.get('/reports/:reportId', protect, adminOrModerator, getReportDetails);
router.patch('/reports/:reportId/approve', protect, adminOrModerator, approveReport);
router.patch('/reports/:reportId/delete-message', protect, adminOrModerator, deleteReportedMessage);
router.patch('/reports/:reportId/warn-user', protect, adminOrModerator, warnUser);
router.patch('/reports/:reportId/suspend-user', protect, adminOrModerator, suspendReportedUser);
router.patch('/reports/:reportId/reject', protect, adminOrModerator, rejectReport);
router.get('/reports/stats/overview', protect, adminOrModerator, getReportStats);

module.exports = router;
