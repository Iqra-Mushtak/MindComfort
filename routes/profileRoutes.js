const express = require('express');
const router = express.Router();

const { getOwnProfile, getProfile, getPublicMentors, updateMentorProfile, addAvailabilitySlot, updateAvailabilitySlot, deleteAvailabilitySlot, initiateEmailChange, initiateEmailChangeResendOTP, verifyCurrentEmailOTP, setNewEmail, setNewEmailResendOTP, verifyNewEmailOTP, changePassword } = require('../controllers/profileController');
const { protect, mentorOnly } = require('../middleware/authmiddleware');
const { generalRateLimiter, loginLimiter, otpLimiter, registerLimiter } = require('../middleware/rateLimiter');

router.get('/', protect, getOwnProfile);
router.get('/mentors/public', protect, getPublicMentors);
router.get('/:userId', protect, getProfile);
router.post('/:userId/change-email/initiate', protect, otpLimiter, initiateEmailChange);
router.post('/:userId/change-email/initiate-resend', protect, otpLimiter, initiateEmailChangeResendOTP);
router.post('/:userId/change-email/verify-current', protect, otpLimiter, verifyCurrentEmailOTP);
router.post('/:userId/change-email/set-new', protect, otpLimiter, setNewEmail);
router.post('/:userId/change-email/set-new-resend', protect, otpLimiter, setNewEmailResendOTP);
router.post('/:userId/change-email/verify-new', protect, otpLimiter, verifyNewEmailOTP);
router.put('/change-password/:userId', generalRateLimiter, protect, changePassword);
router.put('/mentor/:mentorId', protect, mentorOnly, updateMentorProfile);
router.post('/mentor/:mentorId/availability', protect, mentorOnly, addAvailabilitySlot);
router.put('/mentor/:mentorId/availability/:slotId', protect, mentorOnly, updateAvailabilitySlot);
router.delete('/mentor/:mentorId/availability/:slotId', protect, mentorOnly, deleteAvailabilitySlot);

module.exports = router;
