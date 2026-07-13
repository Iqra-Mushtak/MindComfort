const express = require('express');
const router = express.Router();
const {protect, adminOnly, adminOrModerator} = require('../middleware/authmiddleware');
const { verifySubscription, verifyChatOperation } = require('../middleware/subscriptionMiddleware');
const { getChatrooms, getChatroomById, getChatMessages, reportMessage, createChatroom, updateChatroom, deleteChatroom, getReports, reviewReports } = require('../controllers/chatController');

router.get('/', protect, getChatrooms);

router.get('/:id', protect, getChatroomById);
router.get('/:id/messages', protect, verifySubscription('chat'), getChatMessages);

router.post('/report', protect, verifyChatOperation, reportMessage);

router.post('/', protect, adminOnly, createChatroom);
router.get('/reports/all', protect, adminOrModerator, getReports);
router.put('/reports/:id/review', protect, adminOrModerator, reviewReports);
router.put('/:id', protect, adminOnly, updateChatroom);
router.delete('/:id', protect, adminOnly, deleteChatroom);

module.exports = router;