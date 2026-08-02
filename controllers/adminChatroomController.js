const Chatroom = require('../models/Chatroom');
const ChatMessage = require('../models/ChatMessage');
const ChatReports = require('../models/ChatReports');
const User = require('../models/User');

exports.getAllChatrooms = async (req, res) => {
    try {
        const { search, status, page = 1, limit = 20 } = req.query;
        let filter = {};

        if (search) {
            filter.name = { $regex: search, $options: 'i' };
        }
        if (status === 'active') filter.isActive = true;
        if (status === 'disabled') filter.isActive = false;

        const skip = (page - 1) * limit;
        const chatrooms = await Chatroom.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit));

        const total = await Chatroom.countDocuments(filter);

        res.status(200).json({
            total,
            page: parseInt(page),
            limit: parseInt(limit),
            pages: Math.ceil(total / limit),
            chatrooms
        });
    } catch (error) {
        res.status(500).json({ message: 'Error fetching chatrooms', error: error.message });
    }
};

exports.getChatroomDetails = async (req, res) => {
    try {
        const { chatroomId } = req.params;

        const chatroom = await Chatroom.findById(chatroomId);
        if (!chatroom) {
            return res.status(404).json({ message: 'Chatroom not found' });
        }

        const messageCount = await ChatMessage.countDocuments({ chatroomId, isDeleted: false });

        res.status(200).json({ chatroom, messageCount });
    } catch (error) {
        res.status(500).json({ message: 'Error fetching chatroom details', error: error.message });
    }
};

exports.createChatroom = async (req, res) => {
    try {
        const { name, topic, mentor, description } = req.body;

        const chatroom = new Chatroom({
            name,
            topic,
            mentor,
            description,
            isActive: true
        });

        await chatroom.save();
        await chatroom.populate('mentor', 'username fullName');

        res.status(201).json({ message: 'Chatroom created successfully', chatroom });
    } catch (error) {
        res.status(500).json({ message: 'Error creating chatroom', error: error.message });
    }
};

exports.updateChatroom = async (req, res) => {
    try {
        const { chatroomId } = req.params;
        const { name, topic, description } = req.body;

        const chatroom = await Chatroom.findByIdAndUpdate(
            chatroomId,
            { name, topic, description },
            { returnDocument: 'after' }
        ).populate('mentor', 'username fullName');

        if (!chatroom) {
            return res.status(404).json({ message: 'Chatroom not found' });
        }

        res.status(200).json({ message: 'Chatroom updated successfully', chatroom });
    } catch (error) {
        res.status(500).json({ message: 'Error updating chatroom', error: error.message });
    }
};

exports.toggleChatroomStatus = async (req, res) => {
    try {
        const { chatroomId } = req.params;

        const chatroom = await Chatroom.findById(chatroomId);
        if (!chatroom) {
            return res.status(404).json({ message: 'Chatroom not found' });
        }

        chatroom.isActive = !chatroom.isActive;
        await chatroom.save();

        res.status(200).json({ 
            message: `Chatroom ${chatroom.isActive ? 'enabled' : 'disabled'} successfully`, 
            chatroom 
        });
    } catch (error) {
        res.status(500).json({ message: 'Error toggling chatroom status', error: error.message });
    }
};

exports.deleteChatroom = async (req, res) => {
    try {
        const { chatroomId } = req.params;

        const chatroom = await Chatroom.findByIdAndDelete(chatroomId);
        if (!chatroom) {
            return res.status(404).json({ message: 'Chatroom not found' });
        }

        res.status(200).json({ message: 'Chatroom deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Error deleting chatroom', error: error.message });
    }
};

exports.getChatroomMessages = async (req, res) => {
    try {
        const { chatroomId } = req.params;
        const { page = 1, limit = 50 } = req.query;

        const skip = (page - 1) * limit;
        const messages = await ChatMessage.find({ chatroomId, isDeleted: false })
            .populate('senderId', 'username email role')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit));

        const total = await ChatMessage.countDocuments({ chatroomId, isDeleted: false });

        res.status(200).json({
            total,
            page: parseInt(page),
            limit: parseInt(limit),
            messages: messages.reverse() 
        });
    } catch (error) {
        res.status(500).json({ message: 'Error fetching messages', error: error.message });
    }
};

exports.deleteMessage = async (req, res) => {
    try {
        const { messageId } = req.params;

        const message = await ChatMessage.findByIdAndUpdate(
            messageId,
            { isDeleted: true },
            { returnDocument: 'after' }
        );

        if (!message) {
            return res.status(404).json({ message: 'Message not found' });
        }

        res.status(200).json({ message: 'Message deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Error deleting message', error: error.message });
    }
};

exports.warnChatUser = async (req, res) => {
    try {
        const { userId } = req.params;
        const { messageId, reason } = req.body;

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        if (!user.warnings) {
            user.warnings = 0;
        }
        user.warnings += 1;
        await user.save();

        const Notification = require('../models/Notifications');
        await Notification.create({
            recipientId: userId,
            type: 'chat_warning',
            message: `You have received a warning for chat conduct. Reason: ${reason || 'Violation of community guidelines'}`,
            link: '/dashboard'
        });

        res.status(200).json({ 
            message: `User warned successfully. Total warnings: ${user.warnings}`,
            user 
        });
    } catch (error) {
        res.status(500).json({ message: 'Error warning user', error: error.message });
    }
};

exports.suspendChatUser = async (req, res) => {
    try {
        const { userId } = req.params;
        const { messageId, reason } = req.body;

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        user.isSuspended = true;
        if (!user.suspensionReasons) {
            user.suspensionReasons = [];
        }
        user.suspensionReasons.push({
            reason: reason || 'Violation of chat guidelines',
            suspendedBy: req.user._id,
            date: new Date()
        });
        await user.save();

        const Notification = require('../models/Notifications');
        await Notification.create({
            recipientId: userId,
            type: 'account_suspended',
            message: `Your account has been suspended for: ${reason || 'Violation of community guidelines'}. Please contact support.`,
            link: '/support'
        });

        res.status(200).json({ 
            message: 'User suspended successfully',
            user 
        });
    } catch (error) {
        res.status(500).json({ message: 'Error suspending user', error: error.message });
    }
};