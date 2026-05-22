const mongoose = require('mongoose');

const clientAnonymousSessionSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    chatroomId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Chatroom',
        required: true,
    },
    anonymousId: {
        type: String,
        required: true,
        unique: true,
        trim: true,
    },
    isActive: {
        type: Boolean,
        default: true,
    },
}, { timestamps: true });

clientAnonymousSessionSchema.index({ userId: 1, chatroomId: 1 }, { unique: true });

module.exports = mongoose.model('ClientAnonymousSession', clientAnonymousSessionSchema);