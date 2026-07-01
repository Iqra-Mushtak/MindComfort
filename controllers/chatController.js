const Chatroom = require('../models/Chatroom');
const ChatMessage = require('../models/ChatMessage');
const ChatReport = require('../models/ChatReports');
const NotificationService = require('../services/notificationService');
const User = require('../models/User');

exports.getChatrooms = async (req, res) => {
    try {
        const chatrooms = await Chatroom.find({ isActive: true });
        res.status(200).json(chatrooms);
    } catch (error) {
        res.status(500).json({ message: 'Failed to fetch chatrooms', error: error.message });
    }
};

exports.getChatroomById = async (req, res) => {
    try {
        const chatroom = await Chatroom.findById(req.params.id);
        if (!chatroom || !chatroom.isActive) {
            return res.status(404).json({ message: 'Chatroom not found or is currently inactive' });
        }
        res.status(200).json(chatroom);
    } catch (error) {
        res.status(500).json({ message: 'Failed to fetch chatroom', error: error.message });
    }
};

exports.createChatroom = async (req, res) => {
    try {
        const { name, description, allowedRoles } = req.body;
        const existingChatroom = await Chatroom.findOne({ name: name.trim() });
        if (existingChatroom) {
            return res.status(400).json({ message: 'A chatroom with this name already exists. Please choose a different name.' });
        }
        const chatroom = new Chatroom({
            name: name.trim(),
            description: description ? description.trim() : '',
            allowedRoles: allowedRoles && allowedRoles.length > 0 ? allowedRoles : ['client', 'mentor'],
            createdBy: req.user._id
        });
        await chatroom.save();

        const recipientQuery = [];
        if (chatroom.allowedRoles.includes('mentor')) recipientQuery.push({ role: 'mentor' });
        if (chatroom.allowedRoles.includes('client')) recipientQuery.push({ role: 'client', isSubscribed: true });
        if (chatroom.allowedRoles.includes('admin')) recipientQuery.push({ role: 'admin' });
        if (chatroom.allowedRoles.includes('moderator')) recipientQuery.push({ role: 'moderator' });

        if (recipientQuery.length > 0) {
            const usersToNotify = await User.find({ $or: recipientQuery }).select('_id');
            const recipientIds = usersToNotify.map(user => user._id);
            if (recipientIds.length > 0) {
                await NotificationService.sendBulkNotifications({
                    recipientIds,
                    type: 'chatroom_created',
                    message: `A new chatroom "${chatroom.name}" is now available.`,
                    link: `/chatrooms/${chatroom._id}`,
                    channels: ['in-app']
                });
            }
        }

        res.status(201).json({ message: 'Chatroom created successfully', chatroom });
    } catch (error) {
        res.status(500).json({ message: 'Failed to create chatroom', error: error.message });
    }
};

exports.updateChatroom = async (req, res) => {
    try {
        const { name, description, allowedRoles, isActive } = req.body;
        const chatroom = await Chatroom.findById(req.params.id);
        if (!chatroom) {
            return res.status(404).json({ message: 'Chatroom not found' });
        }

        if (name) chatroom.name = name.trim();
        if (description !== undefined) chatroom.description = description.trim();
        if (allowedRoles && allowedRoles.length > 0) chatroom.allowedRoles = allowedRoles;
        if (isActive !== undefined) chatroom.isActive = isActive;
        await chatroom.save();

        const recipientQuery = [];
        if (chatroom.allowedRoles.includes('mentor')) recipientQuery.push({ role: 'mentor' });
        if (chatroom.allowedRoles.includes('client')) recipientQuery.push({ role: 'client' });
        if (chatroom.allowedRoles.includes('admin')) recipientQuery.push({ role: 'admin' });
        if (chatroom.allowedRoles.includes('moderator')) recipientQuery.push({ role: 'moderator' });

        if (recipientQuery.length > 0) {
            const usersToNotify = await User.find({ $or: recipientQuery }).select('_id');
            const recipientIds = usersToNotify.map(user => user._id);
            if (recipientIds.length > 0) {
                await NotificationService.sendBulkNotifications({
                    recipientIds,
                    type: 'chatroom_updated',
                    message: `The chatroom "${chatroom.name}" was updated.`,
                    link: `/chatrooms/${chatroom._id}`,
                    channels: ['in-app']
                });
            }
        }

        res.status(200).json({ message: 'Chatroom updated successfully', chatroom });
    } catch (error) {
        res.status(500).json({ message: 'Failed to update chatroom', error: error.message });
    }
};

exports.deleteChatroom = async (req, res) => {
    try {
        const chatroom = await Chatroom.findById(req.params.id);
        if (!chatroom) {
            return res.status(404).json({ message: 'Chatroom not found' });
        }
        chatroom.isActive = false;
        await chatroom.save();
        res.status(200).json({ message: 'Chatroom deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Failed to delete chatroom', error: error.message });
    }
};

exports.getChatMessages = async (req, res) => {
    try {
        const canViewMessages = ['admin', 'moderator'].includes(req.user.role) || req.user.role === 'mentor' || !!req.subscription || !!req.user.isSubscribed;
        if (!canViewMessages) {
            return res.status(403).json({ 
                message: 'Premium subscription required to view chat messages' 
            });
        }
        const messages = await ChatMessage.find({
            chatroomId: req.params.id,
            isDeleted: false
        })
            .sort({ createdAt: 1 })
            .limit(200)
            .select('-senderId');
        res.status(200).json(messages);
    } catch (error) {
        res. status(500).json({ message: 'Failed to fetch chat messages', error: error.message });
    }
};

exports.reportMessage = async (req, res) => {
    try {
        const { messageId, reason } = req.body;
        const userId = req.user._id;
        const message = await ChatMessage.findById(messageId);
        if (!message || message.isDeleted) {
            return res.status(404).json({ message: 'Chat message not found' });
        }
        if (message.senderId.toString() === userId.toString()) {
            return res.status(400).json({ message: 'You cannot report your own message' });
        }

        const report = new ChatReport({
            messageId,
            reportedBy: userId,
            reason: reason ? reason.trim() : 'No reason provided'
        });
        await report.save();

        const adminsModerators = await User.find({ role: { $in: ['admin', 'moderator'] } }).select('_id');
        if (adminsModerators.length > 0) {
            const recipientIds = adminsModerators.map(user => user._id);
            await NotificationService.sendBulkNotifications({
                recipientIds: recipientIds,
                type: 'message_reported',
                message: `New message report: "${reason ? reason.trim() : 'No reason provided'}"`,
                link: `/admin/reports/${report._id}`,
                channels: ['in-app']
            });
        }

        res.status(201).json({ message: 'Message reported successfully', report });
    } catch (error) {
        res.status(500).json({ message: 'Failed to report message', error: error.message });
    }
};

exports.getReports = async (req, res) => {
    try {
        const reports = await ChatReport.find()
            .sort({ createdAt: -1 })
            .populate('messageId')
            .populate('reportedBy', 'username role');
        res.status(200).json(reports);
    } catch (error) {
        res.status(500).json({ message: 'Failed to fetch reports', error: error.message });
    }
};

exports.reviewReports = async (req, res) => {
    try {
        const { action, notes } = req.body;
        const report = await ChatReport.findById(req.params.id).populate('messageId');
        if (!report) {
            return res.status(404).json({ message: 'Report not found' });
        }
        if(report.status === 'resolved') {
            return res.status(400).json({ message: 'This report has already been resolved' });
        }
        report.status = 'resolved';
        report.actionTaken = action;
        report.notes = notes ? notes.trim() : '';
        report.actionedBy = req.user._id;
    
        if (action === 'deleteMessage' && report.messageId) {
            report.messageId.isDeleted = true;
            await report.messageId.save();
        } else if (action === 'suspendUser' && report.messageId) {
            const offender = await User.findById(report.messageId.senderId);
            if (offender) {
                offender.isSuspended = true;
                await offender.save();
                await NotificationService.sendNotification({
                    recipientId: offender._id,
                    type: 'user_suspended',
                    message: `Your account has been suspended after a reported message violation.${report.notes ? ` Reason: ${report.notes}` : ''}`,
                    link: '/support',
                    channels: ['in-app']
                });
            }
        } else if (action === 'warnUser' && report.messageId) {
            const offender = await User.findById(report.messageId.senderId);
            if (offender) {
                offender.warningCount = (offender.warningCount || 0) + 1;
                await offender.save();
                await NotificationService.sendNotification({
                    recipientId: offender._id,
                    type: 'user_warned',
                    message: `A message you sent was reviewed and a warning was issued.${report.notes ? ` Note: ${report.notes}` : ''}`,
                    link: `/chatrooms/${report.messageId.chatroomId || ''}`,
                    channels: ['in-app']
                });
            }
        } else if (action === 'deleteMessage' && report.messageId) {
            const offender = await User.findById(report.messageId.senderId);
            if (offender) {
                await NotificationService.sendNotification({
                    recipientId: offender._id,
                    type: 'message_deleted',
                    message: 'A message you sent was removed after review.',
                    link: `/chatrooms/${report.messageId.chatroomId || ''}`,
                    channels: ['in-app']
                });
            }
        }
        await report.save();
        res.status(200).json({ message: 'Report reviewed successfully', report });
    } catch (error) {
        res.status(500).json({ message: 'Failed to review report', error: error.message });
    }
};
