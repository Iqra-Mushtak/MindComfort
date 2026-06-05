const mongoose = require('mongoose');

const chatMessageSchema = new mongoose.Schema({
    chatroomId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Chatroom',
        required: true,
    },
    senderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    sessionId: {
        type: String,
        required: true,
        trim: true,
    },
    anonymousId: {
        type: String,
        required: true,
    },
    content: {
        type: String,
        required: true,
        trim: true,
        maxlength: 2000
    },
    replyTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ChatMessage',
    },
    isDeleted: {
        type: Boolean,
        default: false,
    },
}, { timestamps: true });

chatMessageSchema.index({ chatroomId: 1, isDeleted: 1, createdAt: 1 });
module.exports = mongoose.model('ChatMessage', chatMessageSchema);