const Subscription = require('../models/Subscription');
const Payment = require('../models/Payment');
const User = require('../models/User');
const Plan = require('../models/Plan');
const Podcast = require('../models/Podcast');
const payfast = require('../config/payfast');
const mongoose = require('mongoose');

exports.handlePayFastITN = async (req, res) => {
    res.setHeader('Content-Type', 'text/plain');
    res.status(200).send('OK');

    try {
        const pfData = req.body;
        
        console.log('PayFast ITN webhook received');
        console.log('Raw ITN Data:', pfData);

        const normalizedData = {};
        for (const key in pfData) {
            normalizedData[key] = String(pfData[key]);
        }
        
        console.log('Normalized Data:', normalizedData);

        const clientIp = req.ip || req.connection.remoteAddress;
        console.log('Client IP:', clientIp);
        
        if (!payfast.isTestMode && !payfast.isValidPayFastIP(clientIp)) {
            console.error('Invalid PayFast IP:', clientIp);
            return;
        }

        const signature = normalizedData.signature;
        console.log('Received Signature:', signature);
        
        const receivedMerchantId = normalizedData.merchant_id;
        const expectedMerchantId = process.env.PAYFAST_MERCHANT_ID;
        console.log('Merchant ID - Expected:', expectedMerchantId, 'Received:', receivedMerchantId);
        
        if (receivedMerchantId !== expectedMerchantId) {
            console.error('Merchant ID mismatch. Rejecting webhook.');
            return;
        }
        
        const isValid = await payfast.verifySignature(
            normalizedData, 
            signature
        );

        console.log('Signature Valid:', isValid);

        if (!isValid) {
            console.warn('PayFast ITN signature verification failed');
        }

        const paymentStatus = normalizedData.payment_status;
        const paymentId = normalizedData.custom_str3;
        const userId = normalizedData.custom_str1;
        const planId = normalizedData.custom_str2;
        const planType = normalizedData.custom_str4;
        const durationMonths = parseInt(normalizedData.custom_str5) || 0;
        const referenceId = normalizedData.custom_str6 || null;
        const pfPaymentId = normalizedData.pf_payment_id;

        console.log('Extracted Payment Data:');
        console.log('- paymentStatus:', paymentStatus);
        console.log('- paymentId:', paymentId);
        console.log('- userId:', userId);
        console.log('- planId:', planId);
        console.log('- planType:', planType);
        console.log('- referenceId:', referenceId);
        console.log('- pfPaymentId:', pfPaymentId);

        console.log('Payment Status:', paymentStatus);
        console.log('Payment ID:', paymentId);
        console.log('User ID:', userId);
        console.log('Plan ID:', planId);

        if (!paymentId || !userId) {
            console.error('Missing paymentId or userId in ITN data');
            return;
        }

        const payment = await Payment.findById(paymentId);
        if (!payment) {
            console.error('Payment not found in DB:', paymentId);
            return;
        }

        console.log('Found Payment:', payment);
        let actualReferenceId = referenceId;
        if (!actualReferenceId && payment.referenceId) {
            actualReferenceId = payment.referenceId.toString();
            console.log('Using referenceId from Payment record:', actualReferenceId);
        }
        if (payment.status === 'completed') {
            console.log('Payment already completed, skipping');
            return;
        }

        if (paymentStatus === 'COMPLETE') {
            payment.status = 'completed';
            payment.pfPaymentId = pfPaymentId;
            await payment.save();
            console.log('Payment status updated to completed');

            await createSubscriptionFromPayment({
                userId,
                planId,
                planType,
                durationMonths,
                referenceId: actualReferenceId,
                paymentId: payment._id,
                amount: parseFloat(normalizedData.amount_gross)
            });

            console.log(`Payment ${paymentId} completed successfully`);
        } else if (paymentStatus === 'FAILED' || paymentStatus === 'CANCELLED') {
            payment.status = 'failed';
            payment.pfPaymentId = pfPaymentId;
            await payment.save();
            console.log(`Payment ${paymentId} failed or cancelled`);
        } else if (paymentStatus === 'INCOMPLETE') {
            payment.pfPaymentId = pfPaymentId;
            await payment.save();
            console.log(`Payment ${paymentId} incomplete - EFT pending`);
        } else {
            console.log('Unknown payment status:', paymentStatus);
        }
        
        console.log('Webhook processing complete');
    } catch (error) {
        console.error('PayFast ITN processing error:', error);
    }
};

async function createSubscriptionFromPayment({ userId, planId, planType, durationMonths, referenceId, paymentId, amount }) {
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
        console.log('Dual subscriptions created');
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
        console.log(`Subscription created for ${planType}`);
    }

    await User.findByIdAndUpdate(userObjectId, { isSubscribed: true });
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