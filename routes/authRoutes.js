const express = require('express');
const router = express.Router();

const { createAdmin, createModerator, register, verifyRegisterOTP, submitMentorApplication, adminReviewMentor, resendOTP, login, getAllApplications, getApplicationById, forgotPassword, verifyResetOTP, resetPassword } = require('../controllers/authController');
const { adminOnly, mentorOnly } = require('../middleware/authmiddleware');

router.post('/setup-admin', createAdmin);
router.post('/create-moderator', adminOnly, createModerator);
router.post('/register', register);
router.post('/verifyRegister-otp', verifyRegisterOTP);
router.post('/submit-application', mentorOnly, submitMentorApplication);
router.put('/review-application', adminOnly, adminReviewMentor);
router.post('/resend-otp', resendOTP);
router.post('/login', login);
router.get('/get-applications', adminOnly, getAllApplications);
router.get('/get-applicationById', adminOnly, getApplicationById);
router.post('/forgot-password', forgotPassword);
router.post('/verify-reset-otp', verifyResetOTP);
router.post('/reset-password', resetPassword);

module.exports = router; 