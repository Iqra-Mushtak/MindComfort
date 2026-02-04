const express = require('express');
const router = express.Router();

const { createAdmin, createModerator } = require('../controllers/authController');
const { adminOnly } = require('../middleware/authmiddleware');

router.post('/setup-admin', createAdmin);
router.post('/create-moderator', adminOnly, createModerator);

module.exports = router;