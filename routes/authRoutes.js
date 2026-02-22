const express = require('express');
const router = express.Router();

const { createAdmin, createModerator, register, verifyRegisterOTP, submitMentorApplication, adminReviewMentor, resendOTP, login, getAllApplications, getApplicationById, forgotPassword, verifyResetOTP, resetPassword, logout } = require('../controllers/authController');
const { protect, adminOnly, mentorOnly } = require('../middleware/authmiddleware');

router.post('/setup-admin', createAdmin);
router.post('/create-moderator', protect, adminOnly, createModerator);
router.post('/register', register);
router.post('/verifyRegister-otp', verifyRegisterOTP);
router.post('/submit-application', submitMentorApplication);
router.put('/review-application', protect, adminOnly, adminReviewMentor);
router.post('/resend-otp', resendOTP);
router.post('/login', login);
router.get('/get-applications', protect, adminOnly, getAllApplications);
router.get('/get-applicationById', protect, adminOnly, getApplicationById);
router.post('/forgot-password', forgotPassword);
router.post('/verify-reset-otp', verifyResetOTP);
router.post('/reset-password', resetPassword);
router.post('/logout', protect, logout);

module.exports = router; 