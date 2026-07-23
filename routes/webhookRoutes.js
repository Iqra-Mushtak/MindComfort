const express = require('express');
const router = express.Router();
const { handlePayFastITN, getPaymentStatus, debugCompletePayment } = require('../controllers/webhookController');
const { protect } = require('../middleware/authmiddleware');

router.post('/payfast', express.urlencoded({ extended: true }), handlePayFastITN);

router.get('/payment-status', protect, getPaymentStatus);

router.post('/debug/complete-payment', debugCompletePayment);

module.exports = router;