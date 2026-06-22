const Subscription = require('../models/Subscription');
const Payment = require('../models/Payment');
const Plan = require('../models/Plan');
const User = require('../models/User');

exports.createSubscription = async (req, res) => {
    try {
        const { planId, referenceId } = req.body;

        if (!planId) {
            return res.status(400).json({ message: 'Plan ID is required' });
        }

        const plan = await Plan.findById(planId);
        if (!plan) {
            return res.status(404).json({ message: 'Plan not found' });
        }

        if (!plan.isActive) {
            return res.status(400).json({ message: 'This plan is no longer available' });
        }

        const user = await User.findById(req.user._id);
        if (user.isSuspended) {
            return res.status(403).json({ message: 'Suspended users cannot subscribe.' });
        }

        if (plan.type === 'podcast' && !referenceId) {
            return res.status(400).json({ message: 'Podcast ID is required for podcast subscriptions' });
        }

        const existingActive = await Subscription.findOne({
            userId: req.user._id,
            type: { $in: plan.type === 'both' ? ['chat', 'podcast'] : [plan.type] },
            status: 'active',
            endDate: { $gt: new Date() }
        });

        if (existingActive) {
            return res.status(400).json({ message: `You already have an active ${plan.type} subscription` });
        }

        const startDate = new Date();
        const endDate = new Date();
        endDate.setMonth(startDate.getMonth() + plan.durationMonths);

        // Create payment record first
        const payment = await Payment.create({
            planId: plan._id,
            userId: req.user._id,
            transactionId: `TXN_${Date.now()}_${req.user._id}`,
            amount: plan.price,
            currency: plan.currency,
            paymentMethod: 'payfast',
            status: 'completed'
        });

        const newSubscription = await Subscription.create({
            userId: req.user._id,
            planId: plan._id,
            type: plan.type,
            referenceId: plan.type === 'podcast' ? referenceId : null,
            planName: plan.name,
            planPrice: plan.price,
            planDurationMonths: plan.durationMonths,
            startDate,
            endDate,
            status: 'active',
            paymentId: payment._id,
            paymentStatus: 'completed'
        });

        await User.findByIdAndUpdate(req.user._id, { isSubscribed: true });

        res.status(201).json({ 
            message: `${plan.type} subscription activated successfully`, 
            subscription: newSubscription,
            payment
        });
    } catch (error) {
        res.status(500).json({ message: 'Subscription creation failed', error: error.message });
    }
};

exports.getMySubscriptionStatus = async (req, res) => {
    try {
        const subscriptions = await Subscription.find({
            userId: req.user._id
        }).populate('paymentId').sort({ createdAt: -1 });

        const activeSubscriptions = subscriptions.filter(sub => 
            sub.status === 'active' && sub.endDate > new Date()
        );

        res.status(200).json({
            totalSubscriptions: subscriptions.length,
            activeSubscriptions: activeSubscriptions.length,
            subscriptions: subscriptions,
            hasActiveChat: activeSubscriptions.some(s => s.type === 'chat'),
            hasActivePodcast: activeSubscriptions.some(s => s.type === 'podcast')
        });
    } catch (error) {
        res.status(500).json({ message: 'Error fetching status', error: error.message });
    }
};

exports.getSubscriptionByType = async (req, res) => {
    try {
        const { type } = req.params;

        if (!['chat', 'podcast'].includes(type)) {
            return res.status(400).json({ message: 'Invalid subscription type' });
        }

        const subscription = await Subscription.findOne({
            userId: req.user._id,
            type,
            status: 'active',
            endDate: { $gt: new Date() }
        }).populate('paymentId');

        if (!subscription) {
            return res.status(404).json({ 
                message: `No active ${type} subscription found`,
                isSubscribed: false 
            });
        }

        res.status(200).json({
            isSubscribed: true,
            subscription
        });
    } catch (error) {
        res.status(500).json({ message: 'Error fetching subscription', error: error.message });
    }
};

exports.isSubscriptionValid = async (userId, type) => {
    const subscription = await Subscription.findOne({
        userId,
        type,
        status: 'active',
        endDate: { $gt: new Date() }
    });
    return !!subscription;
};

exports.renewSubscription = async (req, res) => {
    try {
        const { subscriptionId } = req.body;

        const subscription = await Subscription.findOne({
            _id: subscriptionId,
            userId: req.user._id
        });

        if (!subscription) {
            return res.status(404).json({ message: 'Subscription not found' });
        }

        const plan = await Plan.findById(subscription.planId);
        if (!plan) {
            return res.status(404).json({ message: 'Plan not found' });
        }

        // Create new payment
        const payment = await Payment.create({
            planId: plan._id,
            userId: req.user._id,
            transactionId: `TXN_${Date.now()}_${req.user._id}`,
            amount: plan.price,
            currency: plan.currency,
            paymentMethod: 'payfast',
            status: 'completed'
        });

        const baseDate = subscription.endDate > new Date() ? subscription.endDate : new Date();
        const newEndDate = new Date(baseDate);
        newEndDate.setMonth(newEndDate.getMonth() + plan.durationMonths);

        const updatedSubscription = await Subscription.findByIdAndUpdate(
            subscriptionId,
            {
                endDate: newEndDate,
                planPrice: plan.price,
                paymentId: payment._id,
                paymentStatus: 'completed',
                status: 'active'
            },
            { new: true }
        );

        res.status(200).json({
            message: 'Subscription renewed successfully',
            subscription: updatedSubscription
        });
    } catch (error) {
        res.status(500).json({ message: 'Subscription renewal failed', error: error.message });
    }
};

exports.cancelSubscription = async (req, res) => {
    try {
        const { subscriptionId } = req.params;

        const subscription = await Subscription.findOne({
            _id: subscriptionId,
            userId: req.user._id
        });

        if (!subscription) {
            return res.status(404).json({ message: 'Subscription not found' });
        }

        await Subscription.findByIdAndUpdate(
            subscriptionId,
            { status: 'expired' }
        );

        res.status(200).json({ message: 'Subscription cancelled successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Error cancelling subscription', error: error.message });
    }
};