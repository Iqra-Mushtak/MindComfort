const express = require('express');
const router = express.Router();

const { getProfile, updateUserCredentials, updateMentorProfile, addAvailabilitySlot, updateAvailabilitySlot, deleteAvailabilitySlot, initiateEmailChange, verifyCurrentEmailOTP, setNewEmail, verifyNewEmailOTP } = require('../controllers/profileController');
const { protect, mentorOnly } = require('../middleware/authmiddleware');

router.get('/:userId', getProfile);

router.put('/:userId', protect, updateUserCredentials);

router.post('/:userId/change-email/initiate', protect, initiateEmailChange);
router.post('/:userId/change-email/verify-current', protect, verifyCurrentEmailOTP);
router.post('/:userId/change-email/set-new', protect, setNewEmail);
router.post('/:userId/change-email/verify-new', protect, verifyNewEmailOTP);
router.put('/mentor/:mentorId', protect, mentorOnly, updateMentorProfile);
router.post('/mentor/:mentorId/availability', protect, mentorOnly, addAvailabilitySlot);
router.put('/mentor/:mentorId/availability/:slotId', protect, mentorOnly, updateAvailabilitySlot);
router.delete('/mentor/:mentorId/availability/:slotId', protect, mentorOnly, deleteAvailabilitySlot);

module.exports = router;
