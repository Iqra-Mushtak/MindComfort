const express = require('express');
const router = express.Router();
const { handleStripeWebhook, getPaymentStatus, debugCompletePayment, completePayment } = require('../controllers/webhookController');
const { protect } = require('../middleware/authmiddleware');

const captureRawBody = express.raw({ type: 'application/json' });

const storeRawBody = (req, res, next) => {
    if (req.body) {
        req.rawBody = req.body;
    }
    next();
};

router.post('/stripe', captureRawBody, storeRawBody, handleStripeWebhook);

router.get('/payment-status', protect, getPaymentStatus);

router.post('/complete-payment', protect, completePayment);

router.post('/debug/complete-payment', debugCompletePayment);

module.exports = router;