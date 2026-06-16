const express = require('express');
const router = express.Router();
const { getNotifications, createNotification, createBulkNotifications, markAsRead } = require('../controllers/notificationController');
const { protect, adminOrModerator } = require('../middleware/authmiddleware');

router.get('/', protect, getNotifications);
router.post('/', protect, adminOrModerator, createNotification);
router.post('/bulk', protect, adminOrModerator, createBulkNotifications);
router.put('/:notificationId/read', protect, markAsRead);

module.exports = router;