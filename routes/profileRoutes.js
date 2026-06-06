const express = require('express');
const router = express.Router();

const { getProfile, updateUserCredentials, updateMentorProfile, addAvailabilitySlot, updateAvailabilitySlot, deleteAvailabilitySlot, initiateEmailChange, verifyCurrentEmailOTP, setNewEmail, verifyNewEmailOTP, changePassword } = require('../controllers/profileController');
const { protect, mentorOnly } = require('../middleware/authmiddleware');
const { generalRateLimiter, loginLimiter, otpLimiter, registerLimiter } = require('../middleware/rateLimiter');

router.get('/:userId', protect, getProfile);
router.put('/:userId', protect, updateUserCredentials);
router.post('/:userId/change-email/initiate', protect, otpLimiter, initiateEmailChange);
router.post('/:userId/change-email/verify-current', protect, otpLimiter, verifyCurrentEmailOTP);
router.post('/:userId/change-email/set-new', protect, generalRateLimiter, setNewEmail);
router.post('/:userId/change-email/verify-new', protect, otpLimiter, verifyNewEmailOTP);
router.put('/change-password/:userId', generalRateLimiter, protect, changePassword);
router.put('/mentor/:mentorId', protect, mentorOnly, updateMentorProfile);
router.post('/mentor/:mentorId/availability', protect, mentorOnly, addAvailabilitySlot);
router.put('/mentor/:mentorId/availability/:slotId', protect, mentorOnly, updateAvailabilitySlot);
router.delete('/mentor/:mentorId/availability/:slotId', protect, mentorOnly, deleteAvailabilitySlot);

module.exports = router;
