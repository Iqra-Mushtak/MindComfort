const Subscription = require('../models/Subscription');
const Payment = require('../models/Payment');
const Plan = require('../models/Plan');
const User = require('../models/User');

exports.getAllSubscriptions = async (req, res) => {
    try {
        const { userId, type, status, page = 1, limit = 20 } = req.query;
        
        let filter = {};
        if (userId) filter.userId = userId;
        if (type) filter.type = type;
        if (status) filter.status = status;

        const skip = (page - 1) * limit;

        const subscriptions = await Subscription.find(filter)
            .populate('userId', 'username email role')
            .populate('paymentId')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit));

        const total = await Subscription.countDocuments(filter);

        res.status(200).json({
            total,
            page: parseInt(page),
            limit: parseInt(limit),
            pages: Math.ceil(total / limit),
            subscriptions
        });
    } catch (error) {
        res.status(500).json({ message: 'Error fetching subscriptions', error: error.message });
    }
};

exports.getSubscriptionById = async (req, res) => {
    try {
        const { id } = req.params;

        const subscription = await Subscription.findById(id)
            .populate('userId', 'username email role isSuspended')
            .populate('paymentId')
            .populate('overriddenBy', 'username email');

        if (!subscription) {
            return res.status(404).json({ message: 'Subscription not found' });
        }

        res.status(200).json(subscription);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching subscription', error: error.message });
    }
};

exports.editSubscription = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, endDate, plan, planDurationMonths, notes } = req.body;

        const subscription = await Subscription.findById(id);
        if (!subscription) {
            return res.status(404).json({ message: 'Subscription not found' });
        }

        if (status) subscription.status = status;
        if (plan) subscription.plan = plan;
        if (planDurationMonths) {
            subscription.planDurationMonths = planDurationMonths;
            if (!endDate) {
                const newEnd = new Date(subscription.startDate);
                newEnd.setMonth(newEnd.getMonth() + planDurationMonths);
                subscription.endDate = newEnd;
            }
        }
        if (endDate) subscription.endDate = new Date(endDate);
        if (notes) subscription.overrideNotes = notes;

        await subscription.save();

        res.status(200).json({
            message: 'Subscription updated successfully',
            subscription
        });
    } catch (error) {
        res.status(500).json({ message: 'Error updating subscription', error: error.message });
    }
};

exports.getAllPayments = async (req, res) => {
    try {
        const { userId, status, page = 1, limit = 20 } = req.query;
        
        let filter = {};
        if (userId) filter.userId = userId;
        if (status) filter.status = status;

        const skip = (page - 1) * limit;

        const payments = await Payment.find(filter)
            .populate('userId', 'username email role')
            .populate('subscriptionId')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit));

        const total = await Payment.countDocuments(filter);

        res.status(200).json({
            total,
            page: parseInt(page),
            limit: parseInt(limit),
            pages: Math.ceil(total / limit),
            payments
        });
    } catch (error) {
        res.status(500).json({ message: 'Error fetching payments', error: error.message });
    }
};

exports.getPaymentByTransactionId = async (req, res) => {
    try {
        const { transactionId } = req.params;

        const payment = await Payment.findOne({ transactionId })
            .populate('userId', 'username email')
            .populate('subscriptionId');

        if (!payment) {
            return res.status(404).json({ message: 'Payment not found' });
        }

        res.status(200).json(payment);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching payment', error: error.message });
    }
};

exports.updatePaymentStatus = async (req, res) => {
    try {
        const { paymentId } = req.params;
        const { status, notes } = req.body;

        const payment = await Payment.findById(paymentId);
        if (!payment) {
            return res.status(404).json({ message: 'Payment not found' });
        }

        payment.status = status || payment.status;
        payment.notes = notes || payment.notes;
        payment.updatedBy = req.user._id;
        await payment.save();

        if (status === 'completed') {
            const subscription = await Subscription.findOne({ paymentId });
            if (subscription) {
                subscription.status = 'active';
                subscription.paymentStatus = 'completed';
                await subscription.save();
            }
        }

        res.status(200).json({
            message: 'Payment status updated and subscription activated if applicable',
            payment
        });
    } catch (error) {
        res.status(500).json({ message: 'Error updating payment', error: error.message });
    }
};

exports.overrideSubscription = async (req, res) => {
    try {
        const { userId, planId, referenceId, transactionId, notes } = req.body;

        if (!userId || !planId) {
            return res.status(400).json({ message: 'Missing required fields: userId, planId' });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        const plan = await Plan.findById(planId);
        if (!plan) {
            return res.status(404).json({ message: 'Plan not found' });
        }
        const payment = await Payment.create({
            planId: plan._id,
            userId,
            transactionId: transactionId || `TXN_ADMIN_${Date.now()}_${userId}`,
            amount: plan.price,
            currency: plan.currency,
            paymentMethod: 'stripe',
            status: 'completed',
            notes: `Admin override: ${notes || 'Payment verified and recorded'}`,
            createdBy: req.user._id
        });

        const startDate = new Date();
        const endDate = new Date();
        endDate.setMonth(startDate.getMonth() + plan.durationMonths);

        let subscription;
        
         if (plan.type === 'both') {
            await Subscription.create({
                userId,
                planId: plan._id,
                type: 'chat',
                planName: plan.name,
                planPrice: plan.price,
                planDurationMonths: plan.durationMonths,
                startDate,
                endDate,
                status: 'active',
                paymentId: payment._id,
                paymentStatus: 'completed',
                isOverridden: true,
                overriddenBy: req.user._id,
                overrideNotes: notes || 'Admin override'
            });

            subscription = await Subscription.create({
                userId,
                planId: plan._id,
                type: 'podcast',
                planName: plan.name,
                planPrice: plan.price,
                planDurationMonths: plan.durationMonths,
                startDate,
                endDate,
                status: 'active',
                paymentId: payment._id,
                paymentStatus: 'completed',
                isOverridden: true,
                overriddenBy: req.user._id,
                overrideNotes: notes || 'Admin override'
            });
        } else {
            subscription = await Subscription.create({
                userId,
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
                paymentStatus: 'completed',
                isOverridden: true,
                overriddenBy: req.user._id,
                overrideNotes: notes || 'Admin override'
            });
        }

        await User.findByIdAndUpdate(userId, { isSubscribed: true });

        res.status(201).json({
            message: 'Subscription created/overridden successfully',
            subscription,
            payment
        });
    } catch (error) {
        res.status(500).json({ message: 'Error creating override subscription', error: error.message });
    }
};

exports.linkPaymentToSubscription = async (req, res) => {
    try {
        const { subscriptionId, paymentId } = req.body;

        const subscription = await Subscription.findById(subscriptionId);
        if (!subscription) {
            return res.status(404).json({ message: 'Subscription not found' });
        }

        const payment = await Payment.findById(paymentId);
        if (!payment) {
            return res.status(404).json({ message: 'Payment not found' });
        }

        subscription.paymentId = paymentId;
        subscription.paymentStatus = payment.status;
        
        if (payment.status === 'completed') {
            subscription.status = 'active';
        }

        await subscription.save();

        res.status(200).json({
            message: 'Payment linked to subscription successfully',
            subscription
        });
    } catch (error) {
        res.status(500).json({ message: 'Error linking payment', error: error.message });
    }
};

exports.suspendSubscription = async (req, res) => {
    try {
        const { subscriptionId } = req.params;
        const { reason } = req.body;

        const subscription = await Subscription.findByIdAndUpdate(
            subscriptionId,
            { status: 'suspended', overrideNotes: reason || 'Admin suspended' },
            { new: true }
        );

        if (!subscription) {
            return res.status(404).json({ message: 'Subscription not found' });
        }

        res.status(200).json({
            message: 'Subscription suspended successfully',
            subscription
        });
    } catch (error) {
        res.status(500).json({ message: 'Error suspending subscription', error: error.message });
    }
};

exports.reactivateSubscription = async (req, res) => {
    try {
        const { subscriptionId } = req.params;

        const subscription = await Subscription.findById(subscriptionId);
        if (!subscription) {
            return res.status(404).json({ message: 'Subscription not found' });
        }

        if (subscription.endDate && subscription.endDate < new Date()) {
            return res.status(400).json({ message: 'Cannot reactivate expired subscription. User must renew.' });
        }

        subscription.status = 'active';
        await subscription.save();

        res.status(200).json({
            message: 'Subscription reactivated successfully',
            subscription
        });
    } catch (error) {
        res.status(500).json({ message: 'Error reactivating subscription', error: error.message });
    }
};
