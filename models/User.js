const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
//user id   
    userId: { 
        type: String, 
        unique: true, 
        required: true 
    },

//user credentials
    username: { 
        type: String, 
        required: true 
    },
    email: { 
        type: String, 
        required: true, 
        unique: true 
    },
    password: { 
        type: String, 
        required: true 
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
},
    { timestamps: true }); //createdAt tracking
//id generation
    userSchema.pre('validate', function () {
    if (!this.userId) {
        const randomDigits = Math.floor(100000 + Math.random() * 900000);
        this.userId = `mc${randomDigits}`; 
    }
});

module.exports = mongoose.model('User', userSchema);