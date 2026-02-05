const express = require('express');
const router = express.Router();

const { createAdmin, createModerator, register, verifyOTP } = require('../controllers/authController');
const { adminOnly } = require('../middleware/authmiddleware');

router.post('/setup-admin', createAdmin);
router.post('/create-moderator', adminOnly, createModerator);
router.post('/register', register);
router.post('/verify-otp', verifyOTP);

module.exports = router; 