const mongoose = require('mongoose');

const podcastSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        trim: true,
        maxlength: 100
    },
    description: {
        type: String,
        required: true,
        maxlength: 1000
    },
    speaker: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    startTime: {
        type: Date,
        required: true
    },
    endTime: {
        type: Date,
        required: true
    },
    sessions: [{
        date: {
            type: Date
        },
        startTime: {
            type: Date
        },
        endTime: {
            type: Date
        }
    }],
    price: {
        type: Number,
        default: 0,
        min: 0
    },
    approvalStatus: {
        type: String,
        enum: ['pending', 'approved', 'rejected'],
        default: 'pending'
    },
    streamStatus: {
        type: String,
        enum: ['scheduled', 'live', 'ended'],
        default: 'scheduled'
    },
    audioUrl: {
        type: String,
        default: ''
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    agoraResourceId: {
        type: String,
        default: null
    },
    agoraSid: {
        type: String,
        default: null
    },
    recordingUrl: {
        type: String,
        default: null
    },
    recordingUploadedAt: {
        type: Date,
        default: null
    },
    recordingSize: {
        type: Number,  
        default: null
    },
    purchaseCount: {
        type: Number,
        default: 0
    },
    listenCount: {
        type: Number,
        default: 0
    }
});

module.exports = mongoose.model('Podcast', podcastSchema);