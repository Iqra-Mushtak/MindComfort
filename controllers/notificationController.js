const NotificationService = require('../services/notificationService');
const Notification = require('../models/Notifications');
const User = require('../models/User');

const getNotifications = async (req, res) => {
    try {
        const notifications = await NotificationService.getNotifications(req.user._id);
        res.status(200).json({ success: true, data: notifications });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

const createNotification = async (req, res) => {
    try {
        const { recipientId, type, message, link, html, channels = ['in-app'] } = req.body;

        if (!recipientId || !type || !message) {
            return res.status(400).json({ message: 'recipientId, type, and message are required' });
        }

        const user = await User.findById(recipientId);
        if (!user) {
            return res.status(404).json({ message: 'Recipient user not found' });
        }

        const notification = await NotificationService.sendNotification({
            recipientId,
            type,
            message,
            link,
            html,
            channels
        });

        res.status(201).json({
            success: true,
            message: 'Notification sent successfully',
            data: notification
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to send notification', error: error.message });
    }
};

const createBulkNotifications = async (req, res) => {
    try {
        const { recipientIds, type, message, link, html, channels = ['in-app'] } = req.body;

        if (!Array.isArray(recipientIds) || recipientIds.length === 0 || !type || !message) {
            return res.status(400).json({ message: 'recipientIds (array), type, and message are required' });
        }

        const notifications = await NotificationService.sendBulkNotifications({
            recipientIds,
            type,
            message,
            link,
            html,
            channels
        });

        res.status(201).json({
            success: true,
            message: `Notifications sent to ${notifications.length} recipients`,
            data: notifications
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to send bulk notifications', error: error.message });
    }
};

const markAsRead = async (req, res) => {
    try {
        const { notificationId } = req.params;
        const notification = await Notification.findOneAndUpdate(
            { _id: notificationId, recipient: req.user._id },
            { isRead: true },
            { returnDocument: 'after' }
        );

        if (!notification) {
            return res.status(404).json({ message: 'Notification not found' });
        }

        res.status(200).json({ success: true, data: notification });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to update notification', error: error.message });
    }
};

module.exports = { getNotifications, createNotification, createBulkNotifications, markAsRead };