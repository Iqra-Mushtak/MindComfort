const mongoose = require('mongoose');

const availabilitySlotSchema = new mongoose.Schema({
    day: {
        type: String,
        enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
    },
    endDay: {
        type: String,
        enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
    },
    date: {
        type: Date,
    },
    endDate: {
        type: Date,
    },
    startTime: {
        type: String,
        required: true,
        match: /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/ // HH:mm format
    },
    endTime: {
        type: String,
        required: true,
        match: /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/ // HH:mm format
    },
}, { _id: true });

const mentorProfileSchema = new mongoose.Schema({
    mentorId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true,
    },
    fullName: {
        type: String,
        required: true,
    },
    qualification: {
        type: String,
        required: true,
    },
    experience: {
        type: String,
        required: true,
    },
    expertise: {
        type: String,
        required: true,
    },
    availabilitySchedule: [availabilitySlotSchema],
}, { timestamps: true });

// mentorProfileSchema.pre('save', function(next) {
//     try{
//         if (this.availabilitySchedule) {
//         for (let slot of this.availabilitySchedule) {
//             if (!slot.day && !slot.date) {
//                 return next(new Error('Each availability slot must have either a day or a date.'));
//             }
//             if(slot.startTime && slot.endTime) {
//                 const start = parseInt(slot.startTime.replace(':', ''), 10);
//                 const end = parseInt(slot.endTime.replace(':', ''), 10);
//                 if (start >= end) {
//                 return next(new Error('Start time must be before end time in availability slots.'));
//                 }
//             }
//         }
//     }
//     next();
// } catch (error){
//     return res.status(500).json({ message: 'Error adding availability slot', error: error.message });
//     }
// });

module.exports = mongoose.model('MentorProfile', mentorProfileSchema);
