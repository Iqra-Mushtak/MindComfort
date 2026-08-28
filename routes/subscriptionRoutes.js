const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authmiddleware');
const { createSubscription, getMySubscriptionStatus, getSubscriptionByType, renewSubscription, cancelSubscription, purchaseIndividualPodcast, getSessionStatus } = require('../controllers/subscriptionController');
const { completePayment } = require('../controllers/webhookController');

router.post('/purchase', protect, createSubscription);
router.get('/status', protect, getMySubscriptionStatus);
router.get('/session-status', protect, getSessionStatus);
router.get('/type/:type', protect, getSubscriptionByType);
router.post('/renew', protect, renewSubscription);
router.put('/cancel/:subscriptionId', protect, cancelSubscription);
router.post('/podcast/:podcastId', protect, purchaseIndividualPodcast);
router.post('/complete-payment', protect, completePayment);

module.exports = router;