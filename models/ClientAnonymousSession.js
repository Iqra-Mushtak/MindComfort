const mongoose = require('mongoose');

const clientAnonymousSessionSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    chatroomId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        refPath: 'onModel',
    },
    onModel: {
        type: String,
        required: true,
        enum: ['Podcast', 'Chatroom'],
    },
    anonymousId: {
        type: String,
        required: true,
        trim: true,
    },
    isActive: {
        type: Boolean,
        default: true,
    },
}, { timestamps: true });

clientAnonymousSessionSchema.index({ userId: 1, chatroomId: 1 });

module.exports = mongoose.model('ClientAnonymousSession', clientAnonymousSessionSchema);