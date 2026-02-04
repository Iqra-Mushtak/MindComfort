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

//role
    role: { 
        type: String, 
        enum: ['admin', 'moderator', 'client', 'mentor'], 
        required: true 
    },

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

//mentor-status
    status: { 
        type: String, 
        enum: ['pending', 'approved', 'rejected'], 
        default: function() {
            return this.role === 'mentor' ? 'pending' : 'approved'; 
        }
    },
},
    { timestamps: true });

module.exports = mongoose.model('User', userSchema);