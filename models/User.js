const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({

//user credentials
    username: { 
        type: String, 
        required: true,
        unique: true,
        trim: true,
        minlength: 3,
        maxlength: 30
    },
    email: { 
        type: String, 
        required: true, 
        unique: true,
        trim: true,
        lowercase: true
    },
    password: { 
        type: String, 
        required: true,
        minlength: 6,
        maxlength: 100
    },

//RBAC
    role: { 
        type: String, 
        enum: ['admin', 'moderator', 'client', 'mentor'], 
        required: true 
    },
//Email Verfication
    isVerified: { 
        type: Boolean, 
        default: false 
    },
    otp: { 
        type: String 
    },
    otpExpires: { 
        type: Date 
    },

//mentor-application lifecycle
    status: { 
        type: String, 
        enum: ['pending', 'approved', 'rejected'], 
        required: function() { return this.role === 'mentor'; },
        default: function() {
            return this.role === 'mentor' ? 'pending' : undefined; 
        }
    },
//Session management and security
    resetPasswordToken: {
        type: String,
        default: null,
  },

    tokenVersion: {
        type: Number,
        default: 0, //logout from all devices
  },
    lastActive: {
        type: Date,
        default: Date.now, //for logout cron job
    },
    isBlacklisted: {
        type: Boolean,
        default: false, //for rejected mentors
    },
    isSuspended: {
        type: Boolean,
        default: false, 
    },
},
    { timestamps: true }); //createdAt tracking

module.exports = mongoose.model('User', userSchema);