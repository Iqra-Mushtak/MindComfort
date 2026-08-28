const Subscription = require('../models/Subscription');
const Payment = require('../models/Payment');
const Plan = require('../models/Plan');
const User = require('../models/User');
const Podcast = require('../models/Podcast');
const { createCheckoutSession } = require('../config/stripe'); 
const { createSubscriptionFromPayment } = require('./webhookController');
const { createPaymentIntent, getPaymentIntent } = require('../utils/stripe');

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
            paymentMethod: 'stripe',
            status: 'pending'
        });

        try {
            const metadata = {
                planId: plan._id.toString(),
                planType: plan.type,
                durationMonths: plan.durationMonths.toString(),
                paymentId: payment._id.toString()
            };

            const session = await createCheckoutSession({
                name: plan.name,
                description: plan.description,
                price: plan.price
            }, metadata);

            res.status(201).json({
                message: 'Stripe checkout session created',
                paymentId: payment._id,
                checkoutUrl: session.url,
                sessionId: session.id
            });
        } catch (error) {
            console.error('Stripe checkout session creation failed:', error.message);
            await Payment.findByIdAndDelete(payment._id);
            throw error;
        }
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
            paymentMethod: 'stripe',
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
            { returnDocument: 'after' }
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
                await Podcast.findByIdAndUpdate(podcastId, { 
                    $inc: { purchaseCount: 1 } 
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
            paymentMethod: 'stripe',
            status: 'pending'
        });

        try {
            const metadata = {
                podcastId: podcast._id.toString(),
                paymentType: 'podcast',
                paymentId: payment._id.toString()
            };

            const paymentIntent = await createPaymentIntent(podcastPrice, metadata);

            res.status(201).json({
                message: 'Stripe payment intent created',
                paymentId: payment._id,
                clientSecret: paymentIntent.client_secret,
                stripePaymentIntentId: paymentIntent.id
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

exports.getSessionStatus = async (req, res) => {
    try {
        const { sessionId } = req.query;
        const userId = req.user._id;

        if (!sessionId) {
            return res.status(400).json({ message: 'Session ID is required' });
        }

        const { getStripeInstance } = require('../config/stripe');
        const stripe = getStripeInstance();

        const session = await stripe.checkout.sessions.retrieve(sessionId);
        

        if (!session) {
            return res.status(404).json({ message: 'Session not found' });
        }

        let paymentStatus = 'pending';
        let payment = null;
        let subscription = null;

        if (session.payment_status === 'paid') {
            paymentStatus = 'completed';
            
            const paymentId = session.metadata?.paymentId;
            
            if (!paymentId) {
                return res.status(400).json({ message: 'Invalid session metadata' });
            }

            payment = await Payment.findByIdAndUpdate(
                paymentId,
                {
                    status: 'completed',
                    stripeSessionId: sessionId,
                    stripePaymentIntentId: session.payment_intent
                },
                { new: true }
            );

            if (!payment) {
                return res.status(404).json({ message: 'Payment not found' });
            }

            subscription = await Subscription.findOne({ paymentId: payment._id });

            if (!subscription && payment.planId) {
                const plan = await Plan.findById(payment.planId);
                if (plan) {
                    await createSubscriptionFromPayment({
                        userId: payment.userId,
                        planId: payment.planId,
                        planType: plan.type,
                        durationMonths: plan.durationMonths,
                        paymentId: payment._id,
                        amount: payment.amount
                    });
                    subscription = await Subscription.findOne({ paymentId: payment._id });
                }
            } else if (!subscription && payment.referenceId) {
                // Handle podcast purchase
                const podcast = await Podcast.findById(payment.referenceId);
                const user = await User.findById(payment.userId);
                
                if (podcast && user) {
                    user.podcastAccess = user.podcastAccess || [];
                    if (!user.podcastAccess.includes(podcast._id)) {
                        user.podcastAccess.push(podcast._id);
                        await user.save();
                    }
                    console.log('Podcast access granted to user');
                }
                
                subscription = await Subscription.findOne({ 
                    userId: payment.userId, 
                    referenceId: payment.referenceId 
                });
            }
        } else if (session.payment_status === 'unpaid') {
            paymentStatus = 'pending';
            const paymentId = session.metadata?.paymentId;
            if (paymentId) {
                payment = await Payment.findById(paymentId);
            }
        }

        res.status(200).json({
            session: {
                id: session.id,
                payment_status: session.payment_status,
                customer_email: session.customer_email,
            },
            payment: payment ? {
                _id: payment._id,
                status: payment.status,
                amount: payment.amount,
                currency: payment.currency,
                stripeSessionId: sessionId,
            } : null,
            subscription: subscription || null,
            status: paymentStatus
        });
    } catch (error) {
        console.error('Error fetching session status:', error);
        res.status(500).json({ message: 'Error fetching session status', error: error.message });
    }
};