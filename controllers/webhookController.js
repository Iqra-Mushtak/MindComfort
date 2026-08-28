const Subscription = require('../models/Subscription');
const Payment = require('../models/Payment');
const User = require('../models/User');
const Plan = require('../models/Plan');
const Podcast = require('../models/Podcast');
const { verifyWebhookSignature, getPaymentIntent } = require('../config/stripe');
const mongoose = require('mongoose');
const express = require('express');

exports.handleStripeWebhook = async (req, res) => {
    let responseSent = false;
    
    const sendResponse = (status, data) => {
        if (!responseSent) {
            responseSent = true;
            res.status(status).json(data);
        }
    };

    try {
        const sig = req.headers['stripe-signature'];
        
        if (!req.rawBody) {
            console.error('CRITICAL: req.rawBody is undefined');
            return sendResponse(200, { received: true });
        }
        
        let event;
        try {
            event = verifyWebhookSignature(req.rawBody, sig);
        } catch (verifyError) {
            console.error('Webhook signature verification failed:', verifyError.message);
            return sendResponse(200, { received: true });
        }
        
        console.log('Stripe webhook received:', event.type);

        if (event.type === 'checkout.session.completed') {
            console.log('Processing checkout.session.completed');
            const session = event.data.object;
            
            try {
                if (session.payment_status === 'paid') {
                    const paymentId = session.metadata?.paymentId;
                    
                    if (!paymentId) {
                        console.error('No paymentId in metadata');
                        return sendResponse(200, { received: true });
                    }
                    
                    const payment = await Payment.findById(paymentId);
                    if (!payment) {
                        console.error('Payment not found:', paymentId);
                        return sendResponse(200, { received: true });
                    }
                    
                    if (payment.status !== 'completed') {
                        payment.status = 'completed';
                        payment.stripeSessionId = session.id;
                        payment.stripePaymentIntentId = session.payment_intent;
                        await payment.save();
                        console.log('Payment marked completed:', paymentId);
                        
                        if (payment.planId) {
                            try {
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
                                    console.log('Subscription created');
                                }
                            } catch (subError) {
                                console.error('Subscription creation error:', subError.message);
                            }
                        }
                    }
                }
            } catch (sessionError) {
                console.error('Session processing error:', sessionError.message);
            }
        }
        
        return sendResponse(200, { received: true });
    } catch (error) {
        console.error('Webhook handler error:', error.message);
        return sendResponse(200, { received: true });
    } finally {
        if (!responseSent) {
            res.status(200).json({ received: true });
        }
    }
};

exports.createSubscriptionFromPayment = async function({ userId, planId, planType, durationMonths, referenceId, paymentId, amount }) {
    try {
        const userObjectId = new mongoose.Types.ObjectId(userId);
        const startDate = new Date();

        console.log('Creating subscription with:');
        console.log('- userId:', userId);
        console.log('- planId:', planId);
        console.log('- planType:', planType);
        console.log('- referenceId:', referenceId);

        if (planType === 'podcast' && !planId) {
            console.log('Creating individual podcast subscription');
            
            if (!referenceId) {
                console.error('No podcast ID (referenceId) found for podcast purchase');
                return;
            }

            const podcast = await Podcast.findById(referenceId);
            const subscription = await Subscription.create({
                userId: userObjectId,
                planId: null,
                type: 'podcast',
                referenceId: referenceId,
                planName: podcast ? podcast.title : 'Individual Podcast',
                planPrice: amount,
                planDurationMonths: 0,
                startDate,
                endDate: null, 
                status: 'active',
                paymentId,
                paymentStatus: 'completed'
            });
            await Podcast.findByIdAndUpdate(referenceId, { 
                $inc: { purchaseCount: 1 } 
            });
            console.log('Individual podcast subscription created:', subscription._id, 'for podcast:', referenceId);
            return;
        }

        if (!planId) {
            console.error('Missing planId and no podcast type detected');
            return;
        }

        const plan = await Plan.findById(planId);
        if (!plan) {
            console.error('Plan not found:', planId);
            return;
        }

        const endDate = new Date(startDate);
        endDate.setMonth(endDate.getMonth() + durationMonths);

        if (planType === 'both') {
            await Subscription.create({
                userId: userObjectId,
                planId,
                type: 'chat',
                planName: plan.name,
                planPrice: amount,
                planDurationMonths: durationMonths,
                startDate,
                endDate,
                status: 'active',
                paymentId,
                paymentStatus: 'completed'
            });
            await Subscription.create({
                userId: userObjectId,
                planId,
                type: 'podcast',
                planName: plan.name,
                planPrice: amount,
                planDurationMonths: durationMonths,
                startDate,
                endDate,
                status: 'active',
                paymentId,
                paymentStatus: 'completed'
            });
            console.log('Dual subscriptions created (chat + podcast)');
        } else {
            await Subscription.create({
                userId: userObjectId,
                planId,
                type: planType,
                planName: plan.name,
                planPrice: amount,
                planDurationMonths: durationMonths,
                startDate,
                endDate,
                status: 'active',
                paymentId,
                paymentStatus: 'completed'
            });
            console.log(`Subscription created for type: ${planType}`);
        }

        await User.findByIdAndUpdate(userObjectId, { isSubscribed: true });
        console.log('User marked as subscribed');
    } catch (error) {
        console.error('ERROR in createSubscriptionFromPayment:', error.message);
        console.error('   Full error:', error);
    }
}

exports.getPaymentStatus = async (req, res) => {
    try {
        const { paymentId } = req.query;

        if (!paymentId) {
            return res.status(400).json({ message: 'Payment ID is required' });
        }

        const payment = await Payment.findById(paymentId);
        if (!payment) {
            return res.status(404).json({ message: 'Payment not found' });
        }

        const subscription = await Subscription.findOne({ paymentId: payment._id });

        res.status(200).json({
            payment: {
                _id: payment._id,
                status: payment.status,
                amount: payment.amount,
                currency: payment.currency,
                transactionId: payment.transactionId,
                createdAt: payment.createdAt
            },
            subscription: subscription || null
        });
    } catch (error) {
        res.status(500).json({ message: 'Error fetching payment status', error: error.message });
    }
};

exports.debugCompletePayment = async (req, res) => {
    try {
        const { paymentId } = req.body;

        if (!paymentId) {
            return res.status(400).json({ message: 'Payment ID is required' });
        }

        const payment = await Payment.findById(paymentId);
        if (!payment) {
            return res.status(404).json({ message: 'Payment not found' });
        }

        console.log('Manually completing payment for:', paymentId);

        payment.status = 'completed';
        await payment.save();

        const plan = await Plan.findById(payment.planId);
        if (!plan) {
            return res.status(404).json({ message: 'Plan not found' });
        }

        await createSubscriptionFromPayment({
            userId: payment.userId.toString(),
            planId: payment.planId.toString(),
            planType: plan.type,
            durationMonths: plan.durationMonths,
            referenceId: null,
            paymentId: payment._id,
            amount: payment.amount
        });

        res.status(200).json({ 
            message: 'Payment marked as complete (DEBUG)',
            payment: payment
        });
    } catch (error) {
        console.error('Debug payment completion error:', error);
        res.status(500).json({ message: 'Error completing payment', error: error.message });
    }
};

exports.completePayment = async (req, res) => {
    try {
        const { paymentId } = req.body;
        console.log('\ncompletePayment CALLED for paymentId:', paymentId);

        if (!paymentId) {
            return res.status(400).json({ message: 'Payment ID is required' });
        }

        const payment = await Payment.findById(paymentId);
        if (!payment) {
            return res.status(404).json({ message: 'Payment record not found' });
        }

        if (payment.status === 'completed') {
            const subscription = await Subscription.findOne({ paymentId: payment._id });
            return res.status(200).json({ 
                message: 'Payment already completed',
                payment: {
                    _id: payment._id,
                    status: payment.status,
                    amount: payment.amount,
                    currency: payment.currency
                },
                subscription
            });
        }

        payment.status = 'completed';
        await payment.save();

        if (payment.planId) {
            const plan = await Plan.findById(payment.planId);
            if (plan) {
                await createSubscriptionFromPayment({
                    userId: payment.userId.toString(),
                    planId: payment.planId.toString(),
                    planType: plan.type,
                    durationMonths: plan.durationMonths,
                    referenceId: payment.referenceId,
                    paymentId: payment._id,
                    amount: payment.amount
                });
            }
        } else {
            await createSubscriptionFromPayment({
                userId: payment.userId.toString(),
                planId: null,
                planType: 'podcast',
                durationMonths: 0,
                referenceId: payment.referenceId,
                paymentId: payment._id,
                amount: payment.amount
            });
        }

        const subscription = await Subscription.findOne({ paymentId: payment._id });

        res.status(200).json({ 
            message: 'Payment completed successfully',
            payment: {
                _id: payment._id,
                status: payment.status,
                amount: payment.amount,
                currency: payment.currency
            },
            subscription
        });
    } catch (error) {
        console.error('completePayment ERROR:', error.message);
        res.status(500).json({ message: 'Error completing payment', error: error.message });
    }
};