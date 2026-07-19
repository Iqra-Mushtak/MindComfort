const mongoose = require('mongoose');

const subscriptionSchema = new mongoose.Schema({
    userId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User', 
        required: true 
    },
    planId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Plan',
        required: true
    },
    type: { 
        type: String, 
        enum: ['chat', 'podcast', 'both'], 
        required: true 
    },
    referenceId: { 
        type: mongoose.Schema.Types.ObjectId, 
        default: null
    },
    planName: {
        type: String,
        required: true
    },
    planPrice: {
        type: Number,
        required: true
    },
    planDurationMonths: { 
        type: Number, 
        required: true 
    }, 
    startDate: { 
        type: Date, 
        default: Date.now
    },
    endDate: { 
        type: Date, 
        required: false
    },
    status: { 
        type: String, 
        enum: ['active', 'expired', 'pending', 'suspended'],
        default: 'pending' 
    },
    paymentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Payment',
        default: null
    },
    paymentStatus: {
        type: String,
        enum: ['pending', 'completed', 'failed'],
        default: 'pending'
    },
    isOverridden: {
        type: Boolean,
        default: false
    },
    overriddenBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    overrideNotes: {
        type: String,
        default: ''
    }
}, { timestamps: true });

module.exports = mongoose.model('Subscription', subscriptionSchema);