const Notification = require('../models/Notifications');
const User = require('../models/User');
const { sendEmail } = require('../utils/sendEmail');

const sendNotification = async ({ recipientId, type, message, link, html, channels = ['in-app'] }) => {
    try {  
        const notification = await Notification.create({
            recipient: recipientId,
            type,
            message,
            link,
            isRead: false
        });

        if (channels.includes('in-app') && global.io) {
            global.io.to(`user_${recipientId}`).emit('newNotification', notification);
        }

        if (channels.includes('email')) {
            const user = await User.findById(recipientId).select('email');
            if (user && user.email) {
                await sendEmail({
                    email: user.email,
                    subject: 'New Notification from Mind Comfort',
                    message,
                    html: html || `<p>${message}</p>`
                });
            }
        }
        return notification;
    } catch (error) {
        console.error('Notification Service Error:', error);
        throw error;
    }
};

const sendBulkNotifications = async ({ recipientIds, type, message, link, html, channels = ['in-app'] }) => {
    if (!Array.isArray(recipientIds) || recipientIds.length === 0) {
        return [];
    }

    const notifications = recipientIds.map(recipientId => ({
        recipient: recipientId,
        type,
        message,
        link,
        isRead: false
    }));

    const createdNotifications = await Notification.insertMany(notifications);

    if (channels.includes('in-app') && global.io) {
        createdNotifications.forEach(notification => {
            global.io.to(`user_${notification.recipient}`).emit('newNotification', notification);
        });
    }

    if (channels.includes('email')) {
        const users = await User.find({ _id: { $in: recipientIds } }).select('email');
        await Promise.all(users.map(async (user) => {
            if (!user?.email) return;
            await sendEmail({
                email: user.email,
                subject: 'New Notification from Mind Comfort',
                message,
                html: html || `<p>${message}</p>`
            });
        }));
    }

    return createdNotifications;
};

const getNotifications = async (userId) => {
    return await Notification.find({ recipient: userId }).sort({ createdAt: -1 });
};

module.exports = { sendNotification, sendBulkNotifications, getNotifications };