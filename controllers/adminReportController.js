const ChatReports = require('../models/ChatReports');
const ChatMessage = require('../models/ChatMessage');
const User = require('../models/User');

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
                select: 'content text senderId',
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

        const report = await ChatReports.findById(reportId);
        if (!report) {
            return res.status(404).json({ message: 'Report not found' });
        }

        const message = await ChatMessage.findById(report.messageId);
        const userId = message.senderId;

        const user = await User.findByIdAndUpdate(
            userId,
            { $inc: { warningCount: 1 } },
            { returnDocument: 'after' }
        ).select('-password -otp');

        const updatedReport = await ChatReports.findByIdAndUpdate(
            reportId,
            {
                status: 'resolved',
                actionTaken: 'warnUser',
                actionedBy: req.user._id
            },
            { returnDocument: 'after' }
        ).populate('messageId').populate('reportedBy');

        res.status(200).json({ message: 'User warned and report marked as resolved', report: updatedReport, user });
    } catch (error) {
        res.status(500).json({ message: 'Error warning user', error: error.message });
    }
};

exports.suspendReportedUser = async (req, res) => {
    try {
        const { reportId } = req.params;

        const report = await ChatReports.findById(reportId);
        if (!report) {
            return res.status(404).json({ message: 'Report not found' });
        }

        const message = await ChatMessage.findById(report.messageId);
        const userId = message.senderId;

        const user = await User.findByIdAndUpdate(
            userId,
            { isSuspended: true },
            { returnDocument: 'after' }
        ).select('-password -otp');

        const updatedReport = await ChatReports.findByIdAndUpdate(
            reportId,
            {
                status: 'resolved',
                actionTaken: 'suspendUser',
                actionedBy: req.user._id
            },
            { returnDocument: 'after' }
        ).populate('messageId').populate('reportedBy');

        res.status(200).json({ message: 'User suspended and report marked as resolved', report: updatedReport, user });
    } catch (error) {
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
