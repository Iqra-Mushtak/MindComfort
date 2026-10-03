const mongoose = require('mongoose');

const manualTransactionSchema = new mongoose.Schema({
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
    receiptUrl: {
        type: String,
        required: true
    },
    aiExtractedData: {
        bankName: String,
        amount: Number,
        date: String,
        transactionId: String
    },
    status: {
        type: String,
        enum: ['pending', 'approved', 'rejected'],
        default: 'pending'
    },
    adminNotes: {
        type: String,
        default: ''
    }
}, { timestamps: true });

module.exports = mongoose.model('ManualTransaction', manualTransactionSchema);