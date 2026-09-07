const ChatReports = require('../models/ChatReports');
const ChatMessage = require('../models/ChatMessage');
const User = require('../models/User');
const NotificationService = require('../Services/NotificationService');

exports.getPendingReports = async (req, res) => {
    try {
        const { search, dateFilter, status = 'all', page = 1, limit = 20 } = req.query;
        let filter = {};

        if (status !== 'all') {
            filter.status = status;
        }

        if (dateFilter === 'week') {
            const oneWeekAgo = new Date();
            oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
            filter.createdAt = { $gte: oneWeekAgo };
        } else if (dateFilter === 'month') {
            const oneMonthAgo = new Date();
            oneMonthAgo.setDate(oneMonthAgo.getDate() - 30);
            filter.createdAt = { $gte: oneMonthAgo };
        }

        if (search) {
            filter.$or = [
                { reason: { $regex: search, $options: 'i' } },
                { otherReason: { $regex: search, $options: 'i' } }
            ];
        }

        const skip = (page - 1) * limit;
        
        const reports = await ChatReports.find(filter)
            .populate('reportedBy', 'username email')
            .populate({
                path: 'messageId',
                select: 'content text senderId chatroomId',
                populate: {
                    path: 'senderId',
                    select: 'username email'
                }
            })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit));

        const total = await ChatReports.countDocuments(filter);

        const formattedReports = reports.map(report => {
            const reportObj = report.toObject();
            
            if (reportObj.messageId) {
                reportObj.message = reportObj.messageId.content || reportObj.messageId.text || '';
                if (reportObj.messageId.senderId) {
                    reportObj.reportedUser = reportObj.messageId.senderId;
                }
            }
            
            return reportObj;
        });

        res.status(200).json({
            total,
            page: parseInt(page),
            limit: parseInt(limit),
            pages: Math.ceil(total / limit),
            reports: formattedReports
        });
    } catch (error) {
        console.error('Error fetching reports:', error);
        res.status(500).json({ 
            message: 'Error fetching reports', 
            error: error.message 
        });
    }
};

exports.getReportDetails = async (req, res) => {
    try {
        const { reportId } = req.params;

        const report = await ChatReports.findById(reportId)
            .populate({
                path: 'messageId',
                populate: { path: 'senderId', select: 'username email role' }
            })
            .populate('reportedBy', 'username email');

        if (!report) {
            return res.status(404).json({ message: 'Report not found' });
        }

        const reportedMessage = report.messageId;
        const contextMessages = await ChatMessage.find({
            chatroomId: reportedMessage.chatroomId,
            isDeleted: false
        })
            .populate('senderId', 'username email role')
            .sort({ createdAt: 1 });

        const reportedIndex = contextMessages.findIndex(msg => msg._id.toString() === reportedMessage._id.toString());
        const contextStart = Math.max(0, reportedIndex - 10);
        const contextEnd = Math.min(contextMessages.length, reportedIndex + 11);
        const messageContext = contextMessages.slice(contextStart, contextEnd);

        res.status(200).json({ report, messageContext, reportedIndex });
    } catch (error) {
        res.status(500).json({ message: 'Error fetching report details', error: error.message });
    }
};

exports.approveReport = async (req, res) => {
    try {
        const { reportId } = req.params;

        const report = await ChatReports.findByIdAndUpdate(
            reportId,
            { 
                status: 'approved',
                actionTaken: 'none',
                actionedBy: req.user._id
            },
            { returnDocument: 'after' }
        ).populate('messageId').populate('reportedBy');

        if (!report) {
            return res.status(404).json({ message: 'Report not found' });
        }

        res.status(200).json({ message: 'Report approved - Message remains visible', report });
    } catch (error) {
        res.status(500).json({ message: 'Error approving report', error: error.message });
    }
};

exports.deleteReportedMessage = async (req, res) => {
    try {
        const { reportId } = req.params;

        const report = await ChatReports.findById(reportId);
        if (!report) {
            return res.status(404).json({ message: 'Report not found' });
        }

        await ChatMessage.findByIdAndUpdate(
            report.messageId,
            { isDeleted: true }
        );

        const updatedReport = await ChatReports.findByIdAndUpdate(
            reportId,
            {
                status: 'resolved',
                actionTaken: 'deleteMessage',
                actionedBy: req.user._id
            },
            { returnDocument: 'after' }
        ).populate('messageId').populate('reportedBy');

        res.status(200).json({ message: 'Message deleted and report marked as resolved', report: updatedReport });
    } catch (error) {
        res.status(500).json({ message: 'Error deleting message', error: error.message });
    }
};

exports.warnUser = async (req, res) => {
    try {
        const { reportId } = req.params;
        const reason = req.body?.reason;

        const report = await ChatReports.findById(reportId);
        if (!report) {
            return res.status(404).json({ message: 'Report not found' });
        }

        const message = await ChatMessage.findById(report.messageId);
        if (!message) {
            return res.status(404).json({ message: 'Reported message not found' });
        }

        const targetUserId = message.senderId?._id || message.senderId;
        if (!targetUserId) {
            return res.status(400).json({ message: 'Sender of the reported message not found' });
        }

        const user = await User.findByIdAndUpdate(
            targetUserId,
            { $inc: { warningCount: 1, warnings: 1 } },
            { new: true }
        ).select('-password -otp');

        const flaggedText = message.content || message.text || report.content || 'Reported message';
        const warningReason = reason || report.reason || report.otherReason || 'Violation of community guidelines';

        try {
            await NotificationService.sendNotification({
                recipientId: targetUserId,
                type: 'chat_warning',
                message: `Warning: You have received a warning. Reason: "${warningReason}". Flagged message: "${flaggedText}".`,
                link: '/dashboard',
                channels: ['in-app']
            });

            const ioInstance = global.io || req.app?.get('io');
            if (ioInstance) {
                ioInstance.to(`user_${targetUserId}`).emit('notification', {
                    type: 'chat_warning',
                    message: `Warning: You have received a warning. Reason: "${warningReason}". Flagged message: "${flaggedText}".`,
                    createdAt: new Date()
                });
            }
        } catch (notifErr) {
            console.error('Notification dispatch warning in warnUser:', notifErr.message);
        }

        const updatedReport = await ChatReports.findByIdAndUpdate(
            reportId,
            {
                status: 'resolved',
                actionTaken: 'warnUser',
                actionedBy: req.user._id
            },
            { returnDocument: 'after' }
        ).populate('messageId').populate('reportedBy');

        res.status(200).json({ 
            success: true,
            message: 'User warned and report marked as resolved', 
            report: updatedReport, 
            user 
        });
    } catch (error) {
        console.error('Error in warnUser:', error);
        res.status(500).json({ message: 'Error warning user', error: error.message });
    }
};

exports.suspendReportedUser = async (req, res) => {
    try {
        const { reportId } = req.params;
        const reason = req.body?.reason;

        const report = await ChatReports.findById(reportId);
        if (!report) {
            return res.status(404).json({ message: 'Report not found' });
        }

        const message = await ChatMessage.findById(report.messageId);
        if (!message) {
            return res.status(404).json({ message: 'Reported message not found' });
        }

        const targetUserId = message.senderId?._id || message.senderId;
        if (!targetUserId) {
            return res.status(400).json({ message: 'Sender of the reported message not found' });
        }

        const reportReason = reason || report.reason || report.otherReason || 'Severe violation of community guidelines';
        const flaggedText = message.content || message.text || report.content || 'Reported message';

        const user = await User.findById(targetUserId);
        if (user) {
            user.isSuspended = true;
            if (!user.suspensionReasons) {
                user.suspensionReasons = [];
            }
            user.suspensionReasons.push({
                reason: reportReason,
                suspendedBy: req.user._id,
                date: new Date()
            });
            await user.save();
        }

        try {
            await NotificationService.sendNotification({
                recipientId: targetUserId,
                type: 'account_suspended',
                message: `Account Suspended: Your account has been suspended. Reason: "${reportReason}". Flagged message: "${flaggedText}".`,
                link: '/support',
                channels: ['in-app']
            });

            const ioInstance = global.io || req.app?.get('io');
            if (ioInstance) {
                ioInstance.to(`user_${targetUserId}`).emit('notification', {
                    type: 'account_suspended',
                    message: `Account Suspended: Your account has been suspended. Reason: "${reportReason}". Flagged message: "${flaggedText}".`,
                    createdAt: new Date()
                });
            }
        } catch (notifErr) {
            console.error('Notification dispatch warning in suspendReportedUser:', notifErr.message);
        }

        const updatedReport = await ChatReports.findByIdAndUpdate(
            reportId,
            {
                status: 'resolved',
                actionTaken: 'suspendUser',
                actionedBy: req.user._id
            },
            { returnDocument: 'after' }
        ).populate('messageId').populate('reportedBy');

        res.status(200).json({ 
            success: true,
            message: 'User suspended and report marked as resolved', 
            report: updatedReport, 
            user 
        });
    } catch (error) {
        console.error('Error in suspendReportedUser:', error);
        res.status(500).json({ message: 'Error suspending user', error: error.message });
    }
};

exports.rejectReport = async (req, res) => {
    try {
        const { reportId } = req.params;

        const report = await ChatReports.findById(reportId);
        if (!report) {
            return res.status(404).json({ message: 'Report not found' });
        }

        const updatedReport = await ChatReports.findByIdAndUpdate(
            reportId,
            {
                status: 'resolved',
                actionTaken: 'none',
                actionedBy: req.user._id
            },
            { returnDocument: 'after' }
        ).populate('messageId').populate('reportedBy');

        res.status(200).json({ message: 'Report rejected and marked as resolved', report: updatedReport });
    } catch (error) {
        res.status(500).json({ message: 'Error rejecting report', error: error.message });
    }
};

exports.getReportStats = async (req, res) => {
    try {
        const stats = {
            pendingReports: await ChatReports.countDocuments({ status: 'pending' }),
            resolvedReports: await ChatReports.countDocuments({ status: 'resolved' }),
            approvedReports: await ChatReports.countDocuments({ status: 'approved' }),
            rejectedReports: await ChatReports.countDocuments({ status: 'rejected' })
        };

        res.status(200).json({ stats });
    } catch (error) {
        res.status(500).json({ message: 'Error fetching report stats', error: error.message });
    }
};
