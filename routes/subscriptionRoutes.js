const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authmiddleware');
const { createSubscription, getMySubscriptionStatus, getSubscriptionByType, renewSubscription, cancelSubscription } = require('../controllers/subscriptionController');

router.post('/purchase', protect, createSubscription);
router.get('/status', protect, getMySubscriptionStatus);
router.get('/type/:type', protect, getSubscriptionByType);
router.post('/renew', protect, renewSubscription);
router.put('/cancel/:subscriptionId', protect, cancelSubscription);

module.exports = router;