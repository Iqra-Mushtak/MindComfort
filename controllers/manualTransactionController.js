const ManualTransaction = require('../models/ManualTransaction');
const Subscription = require('../models/Subscription');
const Plan = require('../models/Plan');
const Groq = require('groq-sdk');
const NotificationService = require('../Services/NotificationService');
const fs = require('fs');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const parseExtractedReceipt = (content) => {
    const jsonText = content
        .replace(/```json\s*/i, '')
        .replace(/```\s*/g, '')
        .trim();
    const jsonStart = jsonText.indexOf('{');
    const jsonEnd = jsonText.lastIndexOf('}');

    if (jsonStart === -1 || jsonEnd <= jsonStart) {
        throw new Error('Vision model returned no JSON object');
    }

    const data = JSON.parse(jsonText.slice(jsonStart, jsonEnd + 1));
    return {
        bankName: String(data.bankName || 'Unknown'),
        amount: Number(data.amount) || 0,
        date: String(data.date || 'Unknown'),
        transactionId: String(data.transactionId || 'Unknown')
    };
};

const scanReceiptWithAI = async (base64Image, mimeType) => {
    try {
        const response = await groq.chat.completions.create({
            model: process.env.GROQ_VISION_MODEL || "meta-llama/llama-4-scout-17b-16e-instruct",
            messages: [
                {
                    role: "user",
                    content: [
                        { type: "text", text: "Extract the Bank Name, Amount, Date, and Transaction Reference ID from this bank transfer receipt. Return ONLY a valid JSON object with keys: bankName, amount, date, transactionId." },
                        { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64Image}` } }
                    ]
                }
            ]
        });
        return parseExtractedReceipt(response.choices[0].message.content);
    } catch (error) {
        console.error('Groq Vision Error:', error.message);
        return { bankName: 'Unknown', amount: 0, date: 'Unknown', transactionId: 'Unknown' };
    }
};

exports.submitManualTransaction = async (req, res) => {
    try {
        const { planId } = req.body;
        const file = req.file;

        if (!file || !planId) {
            return res.status(400).json({ message: 'Receipt and Plan ID are required' });
        }

        const base64Image = fs.readFileSync(file.path).toString('base64');
        const aiData = file.mimetype.startsWith('image/')
            ? await scanReceiptWithAI(base64Image, file.mimetype)
            : { bankName: 'Unsupported file type', amount: 0, date: 'Unknown', transactionId: 'Unknown' };

        const newTransaction = new ManualTransaction({
            userId: req.user._id,
            planId,
            receiptUrl: `/uploads/receipts/${file.filename}`,
            aiExtractedData: aiData,
            status: 'pending'
        });

        await newTransaction.save();
        res.status(201).json({ message: 'Receipt uploaded successfully. Awaiting admin approval.', transaction: newTransaction });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

exports.getPendingTransactions = async (req, res) => {
    try {
        const transactions = await ManualTransaction.find({ status: 'pending' })
            .populate('userId', 'username email')
            .populate('planId', 'name price')
            .sort({ createdAt: -1 });
        res.json(transactions);
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
};

exports.reviewTransaction = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, adminNotes } = req.body;

        const transaction = await ManualTransaction.findById(id).populate('userId planId');
        if (!transaction) return res.status(404).json({ message: 'Transaction not found' });

        transaction.status = status;
        transaction.adminNotes = adminNotes || '';
        await transaction.save();

        if (status === 'approved') {
            const plan = transaction.planId;
            const startDate = new Date();
            const endDate = new Date();
            endDate.setMonth(endDate.getMonth() + plan.durationMonths);

            await Subscription.create({
                userId: transaction.userId._id,
                planId: plan._id,
                planName: plan.name,
                planPrice: plan.price,
                planDurationMonths: plan.durationMonths,
                startDate,
                endDate,
                paymentMethod: 'Manual Bank Transfer',
                paymentStatus: 'completed',
                transactionId: transaction.aiExtractedData.transactionId || 'MANUAL-' + transaction._id
            });

            await NotificationService.sendNotification({
                recipientId: transaction.userId._id,
                type: 'subscription_approved',
                message: `Your manual subscription for ${plan.name} has been approved!`,
                link: '/client/plans',
                channels: ['in-app']
            });
        } else {
            await NotificationService.sendNotification({
                recipientId: transaction.userId._id,
                type: 'subscription_rejected',
                message: `Your manual subscription request was rejected. Reason: ${adminNotes || 'Invalid receipt'}`,
                link: '/client/plans',
                channels: ['in-app']
            });
        }

        res.json({ message: `Transaction ${status} successfully.`, transaction });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};