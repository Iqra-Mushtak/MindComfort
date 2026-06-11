const express = require('express');
const router = express.Router();

const { createAdmin, createModerator, register, verifyRegisterOTP, submitMentorApplication, adminReviewMentor, resendOTP, login, getAllApplications, getApplicationById, forgotPassword, resendResetOTP, verifyResetOTP, resetPassword, logout } = require('../controllers/authController');
const { protect, adminOnly, mentorOnly } = require('../middleware/authmiddleware');
const { loginLimiter, otpLimiter, registerLimiter } = require('../middleware/rateLimiter');

router.post('/setup-admin', createAdmin);
router.post('/create-moderator', protect, adminOnly, createModerator);
router.post('/register', registerLimiter, register);
router.post('/verifyRegister-otp', otpLimiter, verifyRegisterOTP);
router.post('/submit-application', protect, submitMentorApplication);
router.put('/review-application', protect, adminOnly, adminReviewMentor);
router.post('/resend-otp', otpLimiter, resendOTP);
router.post('/login', loginLimiter, login);
router.get('/get-applications', protect, adminOnly, getAllApplications);
router.get('/get-applicationById/:id', protect, adminOnly, getApplicationById);
router.post('/forgot-password', otpLimiter, forgotPassword);
router.post('/resend-reset-otp', otpLimiter, resendResetOTP);
router.post('/verify-reset-otp', otpLimiter, verifyResetOTP);
router.post('/reset-password', otpLimiter, resetPassword);
router.post('/logout', protect, logout);

module.exports = router; 