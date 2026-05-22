const mongoose = require('mongoose');

const chatReportSchema = new mongoose.Schema({
    messageId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ChatMessage',
        required: true,
    },
    reportedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    reason: {
        type: String,
        required: true,
        trim: true,
    },
    status: {
        type: String,
        enum: ['pending', 'approved', 'rejected', 'resolved'],
        default: 'pending',
    },
    actionTaken: {
        type: String,
        enum: ['none', 'deleteMessage', 'suspendUser', 'warnUser'],
        default: 'none',
    },
    actionedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },
    notes: {
        type: String,
        trim: true,
        maxlength: 500,
    },

}, { timestamps: true });

module.exports = mongoose.model('ChatReport', chatReportSchema);