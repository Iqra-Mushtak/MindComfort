const express = require('express');
const router = express.Router();

const { createAdmin, createModerator } = require('../controllers/authController');

router.post('/setup-admin', createAdmin);
router.post('/create-moderator', createModerator);

module.exports = router;