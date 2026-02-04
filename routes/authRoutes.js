const express = require('express');
const router = express.Router();

const { createAdmin } = require('../controllers/authController');

router.post('/setup-admin', createAdmin);

module.exports = router;