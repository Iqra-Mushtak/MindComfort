const express = require('express');
const router = express.Router();

const { createAdmin, createModerator, register, verifyOTP, submitMentorApplication, adminReviewMentor } = require('../controllers/authController');
const { adminOnly, mentorOnly } = require('../middleware/authmiddleware');

router.post('/setup-admin', createAdmin);
router.post('/create-moderator', adminOnly, createModerator);
router.post('/register', register);
router.post('/verify-otp', verifyOTP);
router.post('/submit-application', mentorOnly, submitMentorApplication);
router.put('/review-application', adminOnly, adminReviewMentor);

module.exports = router; 