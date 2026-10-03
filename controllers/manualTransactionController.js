const ManualTransaction = require('../models/ManualTransaction');
const Subscription = require('../models/Subscription');
const Plan = require('../models/Plan');
const Groq = require('groq-sdk');
const NotificationService = require('../Services/NotificationService');
const { uploadToB2, getB2SignedUrl } = require('../config/b2');

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
            model: process.env.GROQ_VISION_MODEL || "qwen/qwen3.8-27b",
            messages: [
                {
                    role: "user",
                    content: [
                        { type: "text", text: "Read this payment receipt carefully, including small text. Extract the bank name, transferred amount as a number, transaction date, and reference/transaction ID. Return ONLY this JSON shape: {\"bankName\":\"...\",\"amount\":0,\"date\":\"...\",\"transactionId\":\"...\"}. Use \"Unknown\" only when a value is genuinely unreadable." },
                        { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64Image}` } }
                    ]
                }
            ],
            temperature: 0,
            max_completion_tokens: 300,
            response_format: { type: "json_object" }
        });
        return { data: parseExtractedReceipt(response.choices[0].message.content), error: '' };
    } catch (error) {
        console.error('Groq Vision Error:', error.message);
        return {
            data: { bankName: 'Unknown', amount: 0, date: 'Unknown', transactionId: 'Unknown' },
            error: error.message
        };
    }
};

exports.submitManualTransaction = async (req, res) => {
    try {
        const { planId } = req.body;
        const file = req.file;

        if (!file || !planId) {
            return res.status(400).json({ message: 'Receipt and Plan ID are required' });
        }

        const base64Image = file.buffer.toString('base64');
        const extraction = file.mimetype.startsWith('image/')
            ? await scanReceiptWithAI(base64Image, file.mimetype)
            : {
                data: { bankName: 'Unsupported file type', amount: 0, date: 'Unknown', transactionId: 'Unknown' },
                error: 'Only image receipts can be extracted automatically'
            };
        const receiptKey = `manual-receipts/${req.user._id}-${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        const receiptBucket = process.env.BACKBLAZE_DOCUMENTS_BUCKET_NAME || process.env.BACKBLAZE_BUCKET_NAME;
        await uploadToB2(receiptKey, file.buffer, file.mimetype, receiptBucket);

        const newTransaction = new ManualTransaction({
            userId: req.user._id,
            planId,
            receiptUrl: await getB2SignedUrl(receiptKey, receiptBucket),
            aiExtractedData: extraction.data,
            aiExtractionError: extraction.error,
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

        if (!['approved', 'rejected'].includes(status)) {
            return res.status(400).json({ message: 'Review status must be approved or rejected' });
        }

        const transaction = await ManualTransaction.findById(id).populate('userId planId');
        if (!transaction) return res.status(404).json({ message: 'Transaction not found' });
        if (transaction.status !== 'pending') {
            return res.status(409).json({ message: 'This transaction has already been reviewed' });
        }

        if (status === 'approved') {
            const plan = transaction.planId;
            if (!plan) {
                return res.status(400).json({ message: 'The plan associated with this transaction no longer exists' });
            }
            const startDate = new Date();
            const endDate = new Date();
            endDate.setMonth(endDate.getMonth() + plan.durationMonths);

            await Subscription.create({
                userId: transaction.userId._id,
                planId: plan._id,
                type: plan.type,
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

        transaction.status = status;
        transaction.adminNotes = adminNotes || '';
        await transaction.save();
        res.json({ message: `Transaction ${status} successfully.`, transaction });
    } catch (error) {
        console.error('Manual transaction review error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};