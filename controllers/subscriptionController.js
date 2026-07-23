const Subscription = require('../models/Subscription');
const Payment = require('../models/Payment');
const Plan = require('../models/Plan');
const User = require('../models/User');
const payfast = require('../config/payfast'); 

exports.createSubscription = async (req, res) => {
    try {
        const { planId, referenceId } = req.body;
        const userId = req.user._id;

        if (!planId) {
            return res.status(400).json({ message: 'Plan ID is required' });
        }

        const plan = await Plan.findById(planId);
        if (!plan) return res.status(404).json({ message: 'Plan not found' });
        if (!plan.isActive) return res.status(400).json({ message: 'This plan is no longer available' });

        const user = await User.findById(userId);
        if (user.isSuspended) {
            return res.status(403).json({ message: 'Suspended users cannot subscribe.' });
        }

        let existingActive;
        if (plan.type === 'both') {
            existingActive = await Subscription.findOne({
                userId,
                planId: { $ne: null },
                type: { $in: ['chat', 'podcast'] },
                status: 'active',
                $or: [{ endDate: { $gt: new Date() } }, { endDate: null }]
            });
        } else {
            existingActive = await Subscription.findOne({
                userId,
                planId: { $ne: null },
                type: plan.type,
                status: 'active',
                $or: [{ endDate: { $gt: new Date() } }, { endDate: null }]
            });
        }

        if (existingActive) {
            return res.status(400).json({ 
                message: 'You already have an active subscription that covers this plan.' 
            });
        }

        await Payment.updateMany(
            {
                userId,
                planId: plan._id,
                status: 'pending'
            },
            {
                status: 'failed',
                notes: 'Superseded by a new checkout attempt'
            }
        );

        const payment = await Payment.create({
            userId,
            planId,
            transactionId: `TXN_${Date.now()}_${userId}`,
            amount: plan.price,
            currency: 'PKR',
            paymentMethod: 'payfast',
            status: 'pending'
        });

        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        const backendUrl = process.env.CLIENT_URL?.replace(':3000', ':5000') || 'http://localhost:5000';
        
        const payfastData = {
            merchant_id: String(process.env.PAYFAST_MERCHANT_ID),
            merchant_key: String(process.env.PAYFAST_MERCHANT_KEY),
            return_url: `${frontendUrl}/payment-success?payment_id=${payment._id}`,
            cancel_url: `${frontendUrl}/client/plans?cancelled=true`,
            notify_url: `${backendUrl}/api/webhooks/payfast`,
            amount: String(plan.price.toFixed(2)),
            item_name: String(plan.name),
            item_description: String(plan.description || `${plan.type} subscription for ${plan.durationMonths} month(s)`),
            custom_str1: String(userId.toString()),
            custom_str2: String(plan._id.toString()),
            custom_str3: String(payment._id.toString()),
            custom_str4: String(plan.type),
            custom_str5: String(plan.durationMonths.toString())
        };

        const signature = payfast.generateSignature(payfastData);
        payfastData.signature = signature;

        res.status(201).json({
            message: 'PayFast payment form created',
            paymentId: payment._id,
            payfastData,
            payfastUrl: payfast.getUrls().process
        });
    } catch (error) {
        console.error('Error creating subscription:', error);
        res.status(500).json({ message: 'Subscription creation failed', error: error.message });
    }
};

exports.getMySubscriptionStatus = async (req, res) => {
    try {
        const subscriptions = await Subscription.find({
            userId: req.user._id
        }).populate('paymentId').sort({ createdAt: -1 });

        const activeSubscriptions = subscriptions.filter(sub => 
            sub.status === 'active' && 
            (sub.endDate === null || sub.endDate > new Date())
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
            $or: [
                { endDate: { $gt: new Date() } },
                { endDate: null }
            ]
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

exports.purchaseIndividualPodcast = async (req, res) => {
    try {
        const { podcastId } = req.params;
        const userId = req.user._id;

        const Podcast = require('../models/Podcast');
        const podcast = await Podcast.findById(podcastId);
        if (!podcast) return res.status(404).json({ message: 'Podcast not found' });
        if (podcast.approvalStatus !== 'approved') {
            return res.status(400).json({ message: 'Podcast is not available for purchase' });
        }
        if (podcast.streamStatus === 'ended') {
            return res.status(400).json({ message: 'Cannot purchase a past podcast' });
        }

        const existing = await Subscription.findOne({
            userId,
            type: 'podcast',
            referenceId: podcastId,
            status: 'active'
        });
        if (existing) {
            return res.status(400).json({ message: 'You have already purchased this podcast' });
        }

         const pendingPayment = await Payment.findOne({
            userId,
            transactionId: new RegExp(`^POD_.*_${userId}$`),
            status: 'pending',
            createdAt: { $gt: new Date(Date.now() - 3600000) } // Within last hour
        });
        
        if (pendingPayment) {
            return res.status(400).json({ message: 'You already have a pending payment for a podcast. Please complete or cancel it first.' });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        const podcastPrice = podcast.price || 0;
        if (typeof podcastPrice !== 'number' || podcastPrice < 0) {
            return res.status(400).json({ message: 'Invalid podcast price' });
        }

        if (podcastPrice === 0) {
            try {
                const payment = await Payment.create({
                    planId: null,
                    referenceId: podcast._id,
                    userId,
                    transactionId: `POD_FREE_${Date.now()}_${userId}`,
                    amount: 0,
                    currency: 'PKR',
                    paymentMethod: 'free',
                    status: 'completed'
                });

                const subscription = await Subscription.create({
                    userId: userId,
                    planId: null,
                    type: 'podcast',
                    referenceId: podcast._id,
                    planName: podcast.title,
                    planPrice: 0,
                    planDurationMonths: 0,
                    startDate: new Date(),
                    endDate: null,
                    status: 'active',
                    paymentId: payment._id,
                    paymentStatus: 'completed'
                });

                return res.status(201).json({
                    message: 'Free podcast access granted',
                    subscriptionId: subscription._id,
                    paymentId: payment._id,
                    isFree: true
                });
            } catch (error) {
                console.error('Free podcast subscription error:', error);
                throw error;
            }
        }

        const amountInCents = Math.round(podcastPrice * 100);
        if (amountInCents < 1) {
            return res.status(400).json({ message: 'Podcast price must be at least 0.01 PKR' });
        }

        await Payment.updateMany(
            {
                userId,
                planId: null,
                status: 'pending',
                notes: { $ne: 'Completed individual podcast purchase' }
            },
            {
                status: 'failed',
                notes: 'Superseded by a new podcast checkout attempt'
            }
        );

        const payment = await Payment.create({
            planId: null,
            referenceId: podcast._id,
            userId,
            transactionId: `POD_${Date.now()}_${userId}`,
            amount: podcastPrice,
            currency: 'PKR',
            paymentMethod: 'payfast',
            status: 'pending'
        });

        try {
            const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
            const backendUrl = process.env.CLIENT_URL?.replace(':3000', ':5000') || 'http://localhost:5000';
            
            const payfastData = {
                merchant_id: String(process.env.PAYFAST_MERCHANT_ID),
                merchant_key: String(process.env.PAYFAST_MERCHANT_KEY),
                return_url: `${frontendUrl}/payment-success?payment_id=${payment._id}`,
                cancel_url: `${frontendUrl}/client/podcasts?cancelled=true`,
                notify_url: `${backendUrl}/api/webhooks/payfast`,
                amount: String(podcastPrice.toFixed(2)),
                item_name: String(podcast.title),
                item_description: String('Individual podcast purchase'),
                custom_str1: String(userId.toString()),
                custom_str3: String(payment._id.toString()),
                custom_str4: String('podcast'),
                custom_str5: String('0'),
                custom_str6: String(podcast._id.toString())
            };

            const signature = payfast.generateSignature(payfastData);
            payfastData.signature = signature;

            res.status(201).json({
                message: 'PayFast payment form created',
                paymentId: payment._id,
                payfastData,
                payfastUrl: payfast.getUrls().process
            });
        } catch (error) {
            console.error('Podcast payment form creation failed:', error.message);
            
            await Payment.findByIdAndDelete(payment._id);
            throw error;
        }
    } catch (error) {
        console.error('Podcast purchase error:', error);
        res.status(500).json({ message: 'Podcast purchase failed', error: error.message });
    }
};