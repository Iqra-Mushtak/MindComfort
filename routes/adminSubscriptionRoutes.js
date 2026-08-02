const express = require('express');
const router = express.Router();
const { protect, adminOnly } = require('../middleware/authmiddleware');
const {getAllSubscriptions, getSubscriptionById, editSubscription, suspendSubscription, reactivateSubscription, getAllPayments, getPaymentByTransactionId, updatePaymentStatus, overrideSubscription, linkPaymentToSubscription} = require('../controllers/adminSubscriptionController');

router.get('/', protect, adminOnly, getAllSubscriptions);
router.get('/:id', protect, adminOnly, getSubscriptionById);
router.put('/:id', protect, adminOnly, editSubscription);
router.put('/:id/suspend', protect, adminOnly, suspendSubscription);
router.put('/:id/reactivate', protect, adminOnly, reactivateSubscription);

router.get('/payments/all', protect, adminOnly, getAllPayments);
router.get('/payments/:transactionId', protect, adminOnly, getPaymentByTransactionId);
router.put('/payments/:paymentId/status', protect, adminOnly, updatePaymentStatus);

router.post('/override', protect, adminOnly, overrideSubscription);
router.post('/link-payment', protect, adminOnly, linkPaymentToSubscription);

module.exports = router;
