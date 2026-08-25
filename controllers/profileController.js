const User = require('../models/User');
const MentorProfile = require('../models/MentorProfile');
const bcrypt = require('bcryptjs');
const passwordSchema = require('../utils/passwordValidator');
const sendEmail = require('../utils/sendEmail');
const crypto = require('crypto');
const NotificationService = require('../Services/NotificationService');
const Subscription = require('../models/Subscription');

const enforceOwnership = (req, targetId) => {
    if (!req.user || !req.user._id || !targetId) return true;
    return req.user._id.toString() !== targetId.toString();
};

const buildSubscriptionInfo = async (userId) => {
    const now = new Date();
    
    const subscriptions = await Subscription.find({
        userId,
        status: { $in: ['active', 'suspended'] }
    }).populate('planId', 'name type price durationMonths').populate('referenceId', 'title startTime endTime');

    const chatSub = subscriptions.find(s => 
        s.type === 'chat' && 
        s.planId && 
        (s.endDate === null || s.endDate > now)
    );

    const podcastPlanSub = subscriptions.find(s => 
        s.type === 'podcast' && 
        s.planId && 
        !s.referenceId &&
        (s.endDate === null || s.endDate > now)
    );

    const individualPodcasts = subscriptions.filter(s => 
        s.type === 'podcast' && 
        s.referenceId && 
        s.status === 'active'
    );

    return {
        chat: chatSub ? {
            hasAccess: true,
            planName: chatSub.planId?.name,
            price: chatSub.planId?.price,
            status: chatSub.status,
            endDate: chatSub.endDate
        } : { hasAccess: false },
        
        podcast: {
            hasPlanAccess: !!podcastPlanSub,
            planName: podcastPlanSub?.planId?.name || null,
            planStatus: podcastPlanSub?.status || null,
            planEndDate: podcastPlanSub?.endDate || null,
            individualPurchases: individualPodcasts.map(p => ({
                podcastId: p.referenceId?._id,
                podcastTitle: p.referenceId?.title,
                purchasedAt: p.createdAt,
                price: p.planPrice
            }))
        },

        totalActiveSubscriptions: subscriptions.filter(s => 
            s.status === 'active' && (s.endDate === null || s.endDate > now)
        ).length
    };
};

exports.getPublicMentors = async (req, res) => {
    try {
        const mentors = await User.find({ role: 'mentor', status: 'approved', isSuspended: false })
            .select('username email createdAt');

        const mentorIds = mentors.map(m => m._id);
        const profiles = await MentorProfile.find({ mentorId: { $in: mentorIds } });
        const profileMap = new Map(profiles.map(p => [p.mentorId.toString(), p]));

        const merged = mentors.map(m => {
            const profile = profileMap.get(m._id.toString());
            return {
                _id: m._id,
                username: m.username,
                fullName: profile?.fullName || m.username,
                qualification: profile?.qualification || '',
                experience: profile?.experience || '',
                expertise: profile?.expertise || '',
                availabilitySchedule: profile?.availabilitySchedule || []
            };
        });

        res.status(200).json({ mentors: merged });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

exports.getOwnProfile = async (req, res) => {
    try {
        const user = await User.findById(req.user._id).select('-password -otp -otpExpires -resetPasswordToken -pendingEmail');
        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }

        const subscriptionInfo = await buildSubscriptionInfo(user._id);

        res.status(200).json({
            user: {
                id: user._id,
                username: user.username,
                email: user.email,
                role: user.role,
                isVerified: user.isVerified,
                status: user.status,
                isSubscribed: user.isSubscribed,
                subscriptionStatus: user.isSubscribed ? 'active' : 'inactive'
            },
            subscriptions: subscriptionInfo
        });
    } catch (error) {
        res.status(500).json({ message: 'Error fetching profile', error: error.message });
    }
};

exports.getProfile = async (req, res) => {
    try {
        const userId = req.params.userId;
        const user = await User.findById(userId).select('-password -otp -otpExpires -resetPasswordToken -pendingEmail');
        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }

                const subscriptionInfo = await buildSubscriptionInfo(user._id);

        let profile = {
            user: {
                id: user._id,
                username: user.username,
                email: user.email,
                role: user.role,
                isVerified: user.isVerified,
                status: user.status,
                isSubscribed: user.isSubscribed,
                subscriptionStatus: user.isSubscribed ? 'active' : 'inactive'
            },
            subscriptions: subscriptionInfo
        };

        if (user.role === 'mentor') {
            const MentorProfile = require('../models/MentorProfile');
            const MentorApplication = require('../models/MentorApplication');

            let mentorProfile = await MentorProfile.findOne({ mentorId: userId });
            
            if (!mentorProfile) {
                const application = await MentorApplication.findOne({ mentorId: userId, status: 'approved' }).sort({ createdAt: -1 });
                
                if (application) {
                    profile.mentorProfile = {
                        fullName: application.fullName,
                        qualification: Array.isArray(application.qualification) ? application.qualification.join(', ') : application.qualification,
                        experience: application.experience,
                        expertise: Array.isArray(application.expertise) ? application.expertise.join(', ') : application.expertise
                    };
                }
            } else {
                profile.mentorProfile = mentorProfile;
            }
        }

        res.status(200).json(profile);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching profile', error: error.message });
    }
};

exports.initiateEmailChange = async (req, res) => {
    try {
        const userId = req.params.userId;
        const { currentEmail } = req.body;

        if(enforceOwnership(req, userId)) {
            return res.status(403).json({ message: "Access denied. You can only change your own email." });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }
        console.log("DB Email:", `"${user.email}"`);
        console.log("Input Email:", `"${currentEmail}"`);
        if (user.email !== currentEmail) {
            return res.status(400).json({ message: 'Current email does not match.' });
        }

        const otp = crypto.randomInt(100000, 999999).toString();
        const otpHash = await bcrypt.hash(otp, 10);
        const otpExpires = Date.now() + 10 * 60 * 1000;

        user.otp = otpHash;
        user.otpExpires = otpExpires;
        await user.save();

        try {
            await sendEmail({
                email: user.email,
                subject: "MindComfort Email Change Verification",
                message: `You requested to change your email. Your verification code is: ${otp}. It expires in 10 minutes.`,
            });

            res.status(200).json({
                message: "OTP sent to your current email. Please verify to proceed.",
                step: "verify-current"
            });
        } catch (emailError) {
            return res.status(500).json({
                message: "Failed to send verification email.",
                error: emailError.message,
            });
        }
    } catch (error) {
        res.status(500).json({ message: 'Error initiating email change', error: error.message });
    }
};

exports.initiateEmailChangeResendOTP = async (req, res) => {
    try {
        const userId = req.params.userId;
        const { currentEmail } = req.body;

        if(enforceOwnership(req, userId)) {
            return res.status(403).json({ message: "Access denied. You can only change your own email." });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }
        console.log("DB Email:", `"${user.email}"`);
        console.log("Input Email:", `"${currentEmail}"`);
        if (user.email !== currentEmail) {
            return res.status(400).json({ message: 'Current email does not match.' });
        }

        const otp = crypto.randomInt(100000, 999999).toString();
        const otpHash = await bcrypt.hash(otp, 10);
        const otpExpires = Date.now() + 10 * 60 * 1000;

        user.otp = otpHash;
        user.otpExpires = otpExpires;
        await user.save();

        try {
            await sendEmail({
                email: user.email,
                subject: "MindComfort Email Change Verification",
                message: `You requested to change your email. Your new verification code is: ${otp}. It expires in 10 minutes.`,
            });

            res.status(200).json({
                message: "New OTP sent to your current email. Please verify to proceed.",
                step: "verify-current"
            });
        } catch (emailError) {
            return res.status(500).json({
                message: "Failed to send new verification email.",
                error: emailError.message,
            });
        }
    } catch (error) {
        res.status(500).json({ message: 'Error initiating email change', error: error.message });
    }
};

exports.verifyCurrentEmailOTP = async (req, res) => {
    try {
        const userId = req.params.userId;
        const { otp } = req.body;

        if(enforceOwnership(req, userId)) {
            return res.status(403).json({ message: "Access denied. You can only verify your own email." });
        }
        const user = await User.findById(userId).select('+otp');
        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }
        const isMatch = await bcrypt.compare(otp, user.otp);
        if (!isMatch) {
            return res.status(400).json({ message: 'Invalid OTP.' });
        }

        if (user.otpExpires < Date.now()) {
            return res.status(400).json({ message: 'OTP has expired.' });
        }

        user.otp = undefined;
        user.otpExpires = undefined;
        await user.save();

        res.status(200).json({
            message: "Current email verified. Please provide your new email.",
            step: "set-new-email"
        });
    } catch (error) {
        res.status(500).json({ message: 'Error verifying current email', error: error.message });
    }
};

exports.setNewEmail = async (req, res) => {
    try {
        const userId = req.params.userId;
        const { newEmail } = req.body;

        if(enforceOwnership(req, userId)) {
            return res.status(403).json({ message: "Access denied. You can only set a new email for your own profile." });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }

        const emailExists = await User.findOne({ email: newEmail });
        if (emailExists) {
            return res.status(400).json({ message: 'Email already in use.' });
        }

        const otp = crypto.randomInt(100000, 999999).toString();
        const otpHash = await bcrypt.hash(otp, 10);
        const otpExpires = Date.now() + 10 * 60 * 1000;

        user.pendingEmail = newEmail;
        user.otp = otpHash;
        user.otpExpires = otpExpires;
        await user.save();

        try {
            await sendEmail({
                email: newEmail,
                subject: "MindComfort New Email Verification",
                message: `Please verify your new email address. Your verification code is: ${otp}. It expires in 10 minutes.`,
            });

            res.status(200).json({
                message: "OTP sent to your new email. Please verify to complete the change.",
                step: "verify-new"
            });
        } catch (emailError) {
            return res.status(500).json({
                message: "Failed to send verification email to new address.",
                error: emailError.message,
            });
        }
    } catch (error) {
        res.status(500).json({ message: 'Error setting new email', error: error.message });
    }
};

exports.setNewEmailResendOTP = async (req, res) => {
    try {
        const userId = req.params.userId;
        const { newEmail } = req.body;

        if(enforceOwnership(req, userId)) {
            return res.status(403).json({ message: "Access denied. You can only set a new email for your own profile." });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }

        const emailExists = await User.findOne({ email: newEmail });
        if (emailExists) {
            return res.status(400).json({ message: 'Email already in use.' });
        }

        const otp = crypto.randomInt(100000, 999999).toString();
        const otpHash = await bcrypt.hash(otp, 10);
        const otpExpires = Date.now() + 10 * 60 * 1000;

        user.pendingEmail = newEmail;
        user.otp = otpHash;
        user.otpExpires = otpExpires;
        await user.save();

        try {
            await sendEmail({
                email: newEmail,
                subject: "MindComfort New Email Verification",
                message: `Please verify your new email address. Your new verification code is: ${otp}. It expires in 10 minutes.`,
            });

            res.status(200).json({
                message: "New OTP sent to your new email. Please verify to complete the change.",
                step: "verify-new"
            });
        } catch (emailError) {
            return res.status(500).json({
                message: "Failed to send verification email to new address.",
                error: emailError.message,
            });
        }
    } catch (error) {
        res.status(500).json({ message: 'Error setting new email', error: error.message });
    }
};

exports.verifyNewEmailOTP = async (req, res) => {
    try {
        const userId = req.params.userId;
        const { otp, newEmail } = req.body;

        if(enforceOwnership(req, userId)) {
            return res.status(403).json({ message: "Access denied. You can only verify your own email." });
        }

        const user = await User.findById(userId).select('+otp');
        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }

        if(!user.pendingEmail) {
            return res.status(400).json({ message: 'No pending email change.' });
        }
        const isMatch = await bcrypt.compare(otp, user.otp);
        if (!isMatch) {
            return res.status(400).json({ message: 'Invalid OTP.' });
        }

        if (user.otpExpires < Date.now()) {
            return res.status(400).json({ message: 'OTP has expired.' });
        }

        user.email = user.pendingEmail;
        user.pendingEmail = undefined;

                await NotificationService.sendNotification({
                    recipientId: user._id,
                    type: 'email_changed',
                    message: `Your email has been successfully changed to ${user.email}`,
                    link: '/profile',
                    channels: ['in-app']
                });
        user.otp = undefined;
        user.otpExpires = undefined;
        await user.save();

        res.status(200).json({
            message: "Email updated successfully.",
            user: {
                id: user._id,
                username: user.username,
                email: user.email,
            }
        });
    } catch (error) {
        res.status(500).json({ message: 'Error verifying new email', error: error.message });
    }
};

exports.changePassword = async (req, res) => {
    try{
        const userId = req.params.userId;
        const { currentPassword, newPassword, confirmPassword } = req.body;

        if (enforceOwnership(req, userId)){
            return res.status(403).json({message: "Access Denied. You can only change your own password."})
        }
        const user = await User.findById(userId).select('+password');
        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }

        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Incorrect current password.' });
        }
        if (newPassword !== confirmPassword) {
            return res.status(400).json({ message: 'New passwords do not match.' });
        }

        const validationErrors = passwordSchema.validate(newPassword, { list: true });
        if (validationErrors.length > 0) {
            return res.status(400).json({
                message: 'New password is too weak.',
                failedRules: validationErrors
            });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        user.password = hashedPassword;
        user.tokenVersion = (user.tokenVersion || 0) + 1;

        // Notify user of password change
        await NotificationService.sendNotification({
            recipientId: user._id,
            type: 'password_changed',
            message: 'Your password has been changed successfully. If you did not make this change, please contact support immediately.',
            link: '/profile/security',
            channels: ['in-app']
        });

        await user.save();

        res.status(200).json({ message: 'Password changed successfully.' });
    } catch (error){
        res.status(500).json({ message: 'Error changing password', error: error.message });
    } 
};
// exports.updateUserCredentials = async (req, res) => {
//     try {
//         const userId = req.params.userId;
//         const { currentPassword, newPassword, confirmPassword } = req.body;

//         if(enforceOwnership(req, userId)) {
//             return res.status(403).json({ message: "Access denied. You can only update your own credentials." });
//         }

//         const user = await User.findById(userId);
//         if (!user) {
//             return res.status(404).json({ message: 'User not found.' });
//         }

//         if (newPassword) {
//             if (!currentPassword) {
//                 return res.status(400).json({ message: 'Current password is required to change password.' });
//             }

//             const isMatch = await bcrypt.compare(currentPassword, user.password);
//             if (!isMatch) {
//                 return res.status(400).json({ message: 'Current password is incorrect.' });
//             }

//             if (newPassword !== confirmPassword) {
//                 return res.status(400).json({ message: 'New passwords do not match.' });
//             }

//             const validationErrors = passwordSchema.validate(newPassword, { list: true });
//             if (validationErrors.length > 0) {
//                 return res.status(400).json({
//                     message: 'New password is too weak.',
//                     failedRules: validationErrors
//                 });
//             }

//             const hashedPassword = await bcrypt.hash(newPassword, 10);
//             user.password = hashedPassword;
//             user.tokenVersion += 1;
//         }

//         await user.save();

//         res.status(200).json({
//             message: 'Password updated successfully.',
//             user: {
//                 id: user._id,
//                 username: user.username,
//                 email: user.email,
//             }
//         });
//     } catch (error) {
//         res.status(500).json({ message: 'Error updating credentials', error: error.message });
//     }
// };

exports.updateMentorProfile = async (req, res) => {
    try {
        const mentorId = req.params.mentorId;
        const { fullName, qualification, experience, expertise } = req.body;

        if(enforceOwnership(req, mentorId)) {
            return res.status(403).json({ message: "Access denied. You can only update your own mentor profile." });
        }
        const user = await User.findById(mentorId);
        if (!user || user.role !== 'mentor') {
            return res.status(404).json({ message: 'Mentor not found.' });
        }

        let mentorProfile = await MentorProfile.findOne({ mentorId });
        if (!mentorProfile) {
            const MentorApplication = require('../models/MentorApplication');
            const application = await MentorApplication.findOne({ mentorId, status: 'approved' });
            
            if (application) {
                mentorProfile = new MentorProfile({
                    mentorId,
                    fullName: application.fullName,
                    qualification: Array.isArray(application.qualification) ? application.qualification.join(', ') : application.qualification,
                    experience: application.experience,
                    expertise: Array.isArray(application.expertise) ? application.expertise.join(', ') : application.expertise,
                });
                await mentorProfile.save();
            } else {
                return res.status(404).json({ message: 'Mentor profile not found. Profile is created after admin approval.' });
            }
        }

        if (fullName) mentorProfile.fullName = fullName;
        if (qualification) mentorProfile.qualification = qualification;
        if (experience) mentorProfile.experience = experience;
        if (expertise) mentorProfile.expertise = expertise;

        await mentorProfile.save();

        res.status(200).json({
            message: 'Mentor profile updated successfully.',
            mentorProfile
        });
    } catch (error) {
        res.status(500).json({ message: 'Error updating mentor profile', error: error.message });
    }
};

exports.addAvailabilitySlot = async (req, res) => {
    try {
        const mentorId = req.params.mentorId;
        const { day, endDay, date, endDate, startTime, endTime } = req.body;

        console.log("Adding slot for mentorId:", mentorId, "Payload:", req.body);

        if(enforceOwnership(req, mentorId)) {
            return res.status(403).json({ message: "Access denied." });
        }
        
        if (!day && !date) {
            return res.status(400).json({ message: 'Either day or date must be provided.' });
        }
        
        if (date) {
            const parsedDate = new Date(date);
            if (isNaN(parsedDate.getTime())) {
                return res.status(400).json({ message: 'Invalid date format.' });
            }
            if (endDate) {
                const parsedEndDate = new Date(endDate);
                if (isNaN(parsedEndDate.getTime())) {
                    return res.status(400).json({ message: 'Invalid end date format.' });
                }
                if (parsedEndDate < parsedDate) {
                    return res.status(400).json({ message: 'End date must be after start date.' });
                }
            }
        }

        if (!startTime || !endTime) {
            return res.status(400).json({ message: 'Start time and end time are required.' });
        }
        
        const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
        if (!timeRegex.test(startTime) || !timeRegex.test(endTime)) {
            return res.status(400).json({ message: 'Invalid time format.' });
        }

        const start = parseInt(startTime.replace(':', ''), 10);
        const end = parseInt(endTime.replace(':', ''), 10);
        if (start >= end) {
            return res.status(400).json({ message: 'Start time must be before end time.' });
        }
        
        const user = await User.findById(mentorId);
        if (!user || user.role !== 'mentor') {
            return res.status(404).json({ message: 'Mentor not found.' });
        }

        let mentorProfile = await MentorProfile.findOne({ mentorId });
        if (!mentorProfile) {
            return res.status(404).json({ message: 'Mentor profile not found.' });
        }

        const newSlot = {
            startTime,
            endTime,
        };

        if (day && day.trim() !== '') newSlot.day = day;
        if (endDay && endDay.trim() !== '') newSlot.endDay = endDay;
        if (date && date.trim() !== '') newSlot.date = new Date(date);
        if (endDate && endDate.trim() !== '') newSlot.endDate = new Date(endDate);

        mentorProfile.availabilitySchedule.push(newSlot);
        mentorProfile.markModified('availabilitySchedule');
        await mentorProfile.save();

        res.status(201).json({
            message: 'Availability slot added successfully.',
            slot: mentorProfile.availabilitySchedule[mentorProfile.availabilitySchedule.length - 1]
        });
    } catch (error) {
        console.error("CRASH ERROR in addAvailabilitySlot:", error);
        res.status(500).json({ message: 'Error adding availability slot', error: error.message });
    }
};

exports.updateAvailabilitySlot = async (req, res) => {
    try {
        const { mentorId, slotId } = req.params;
        const { day, date, startTime, endTime } = req.body;

        if(enforceOwnership(req, mentorId)) {
            return res.status(403).json({ message: "Access denied. You can only update your own availability slots." });
        }

        if (date) {
            const parsedDate = new Date(date);
            if (isNaN(parsedDate.getTime())) {
                return res.status(400).json({ message: 'Invalid date format provided.' });
            }
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            if (parsedDate < today) {
                return res.status(400).json({ message: 'Cannot set availability for past dates.' });
            }
        }

        if (startTime || endTime) {
            const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
            if (startTime && !timeRegex.test(startTime)) {
                return res.status(400).json({ message: 'Invalid start time format. Use HH:MM.' });
            }
            if (endTime && !timeRegex.test(endTime)) {
                return res.status(400).json({ message: 'Invalid end time format. Use HH:MM.' });
            }

            if (startTime && endTime) {
                const start = parseInt(startTime.replace(':', ''), 10);
                const end = parseInt(endTime.replace(':', ''), 10);
                if (start >= end) {
                    return res.status(400).json({ message: 'Start time must be before end time.' });
                }
            }
        }

        const user = await User.findById(mentorId);
        if (!user || user.role !== 'mentor') {
            return res.status(404).json({ message: 'Mentor not found.' });
        }

        let mentorProfile = await MentorProfile.findOne({ mentorId });
        if (!mentorProfile) {
            return res.status(404).json({ message: 'Mentor profile not found.' });
        }

        const slot = mentorProfile.availabilitySchedule.id(slotId);
        if (!slot) {
            return res.status(404).json({ message: 'Availability slot not found.' });
        }

        const updatedDay = day !== undefined ? day : slot.day;
        const updatedDate = date !== undefined ? new Date(date) : slot.date;
        const updatedStartTime = startTime || slot.startTime;
        const updatedEndTime = endTime || slot.endTime;

        const hasConflict = mentorProfile.availabilitySchedule.some(existingSlot => {
            if (existingSlot._id.toString() === slotId) return false; // Skip current slot
            
            const sameDay = updatedDay && existingSlot.day === updatedDay;
            const sameDate = updatedDate && existingSlot.date && 
                            new Date(existingSlot.date).toDateString() === updatedDate.toDateString();
            
            if (sameDay || sameDate) {
                const existingStart = parseInt(existingSlot.startTime.replace(':', ''), 10);
                const existingEnd = parseInt(existingSlot.endTime.replace(':', ''), 10);
                const newStart = parseInt(updatedStartTime.replace(':', ''), 10);
                const newEnd = parseInt(updatedEndTime.replace(':', ''), 10);
                
                return newStart < existingEnd && newEnd > existingStart;
            }
            return false;
        });

        if (hasConflict) {
            return res.status(400).json({ message: 'Time slot overlaps with existing availability.' });
        }

        if (day !== undefined) slot.day = day;
        if (date !== undefined) slot.date = new Date(date);
        if (startTime) slot.startTime = startTime;
        if (endTime) slot.endTime = endTime;

        await mentorProfile.save();

        res.status(200).json({
            message: 'Availability slot updated successfully.',
            slot
        });
    } catch (error) {
        res.status(500).json({ message: 'Error updating availability slot', error: error.message });
    }
};

exports.deleteAvailabilitySlot = async (req, res) => {
    try {
        const { mentorId, slotId } = req.params;

        if(enforceOwnership(req, mentorId)) {
            return res.status(403).json({ message: "Access denied. You can only delete your own availability slots." });
        }

        const user = await User.findById(mentorId);
        if (!user || user.role !== 'mentor') {
            return res.status(404).json({ message: 'Mentor not found.' });
        }

        let mentorProfile = await MentorProfile.findOne({ mentorId });
        if (!mentorProfile) {
            return res.status(404).json({ message: 'Mentor profile not found.' });
        }

        const updateResult = await MentorProfile.updateOne(
            { mentorId, 'availabilitySchedule._id': slotId },
            { $pull: { availabilitySchedule: { _id: slotId } } }
        );
        
        if (updateResult.matchedCount === 0) {
            return res.status(404).json({ message: 'Availability slot not found.' });
        }

        res.status(200).json({
            message: 'Availability slot deleted successfully.'
        });
    } catch (error) {
        res.status(500).json({ message: 'Error deleting availability slot', error: error.message });
    }
};
