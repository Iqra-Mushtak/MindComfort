const User = require('../models/User');
const Subscription = require('../models/Subscription');
const Plan = require('../models/Plan');
const mongoose = require('mongoose');

exports.getAllClients = async (req, res) => {
try {
const { search, status, page = 1, limit = 20 } = req.query;
let filter = { role: 'client' };

if (search) {
if (mongoose.Types.ObjectId.isValid(search)) {
filter.$or = [
{ username: { $regex: search, $options: 'i' } },
{ email: { $regex: search, $options: 'i' } },
{ _id: search }
];
} else {
filter.$or = [
{ username: { $regex: search, $options: 'i' } },
{ email: { $regex: search, $options: 'i' } }
];
}
}

if (status === 'active') {
filter.isSuspended = false;
} else if (status === 'suspended') {
filter.isSuspended = true;
}

const skip = (page - 1) * limit;
const clients = await User.find(filter)
.select('-password -otp')
.sort({ createdAt: -1 })
.skip(skip)
.limit(parseInt(limit));

const total = await User.countDocuments(filter);

res.status(200).json({
total,
page: parseInt(page),
limit: parseInt(limit),
pages: Math.ceil(total / limit),
clients
});
} catch (error) {
res.status(500).json({ message: 'Error fetching clients', error: error.message });
}
};

exports.getClientDetails = async (req, res) => {
    try {
        const { clientId } = req.params;

        const client = await User.findById(clientId).select('-password -otp');
        if (!client || client.role !== 'client') {
            return res.status(404).json({ message: 'Client not found' });
        }

        const subscriptions = await Subscription.find({ userId: clientId })
            .populate('planId')
            .sort({ createdAt: -1 });

        res.status(200).json({ client, subscriptions });
    } catch (error) {
        res.status(500).json({ message: 'Error fetching client details', error: error.message });
    }
};

exports.getSubscriptionBreakdown = async (req, res) => {
    try {
        const breakdown = await Plan.aggregate([
            {
                $lookup: {
                    from: 'subscriptions',
                    localField: '_id',
                    foreignField: 'planId',
                    as: 'subscriptions'
                }
            },
            {
                $project: {
                    name: 1,
                    type: 1,
                    price: 1,
                    durationMonths: 1,
                    totalSubscriptions: { $size: '$subscriptions' },
                    activeSubscriptions: {
                        $size: {
                            $filter: {
                                input: '$subscriptions',
                                as: 'sub',
                                cond: { $eq: ['$$sub.status', 'active'] }
                            }
                        }
                    }
                }
            },
            { $sort: { totalSubscriptions: -1 } }
        ]);

        res.status(200).json({ breakdown });
    } catch (error) {
        res.status(500).json({ message: 'Error fetching breakdown', error: error.message });
    }
};

exports.suspendClient = async (req, res) => {
    try {
        const { clientId } = req.params;
        const { reason } = req.body;

        const client = await User.findByIdAndUpdate(
            clientId,
            { isSuspended: true },
            { returnDocument: 'after' }
        ).select('-password -otp');

        if (!client) {
            return res.status(404).json({ message: 'Client not found' });
        }

        res.status(200).json({ message: 'Client suspended successfully', client });
    } catch (error) {
        res.status(500).json({ message: 'Error suspending client', error: error.message });
    }
};

exports.unsuspendClient = async (req, res) => {
    try {
        const { clientId } = req.params;

        const client = await User.findByIdAndUpdate(
            clientId,
            { isSuspended: false },
            { returnDocument: 'after' }
        ).select('-password -otp');

        if (!client) {
            return res.status(404).json({ message: 'Client not found' });
        }

        res.status(200).json({ message: 'Client unsuspended successfully', client });
    } catch (error) {
        res.status(500).json({ message: 'Error unsuspending client', error: error.message });
    }
};

exports.getSubscriptionStats = async (req, res) => {
    try {
        const now = new Date();
        const stats = {
            totalSubscribed: await User.countDocuments({ role: 'client', isSubscribed: true }),
            totalClients: await User.countDocuments({ role: 'client' }),
            activeSubscriptions: await Subscription.countDocuments({ 
                status: 'active',
                $or: [{ endDate: { $gt: now } }, { endDate: null }]
            }),
            expiredSubscriptions: await Subscription.countDocuments({ status: 'expired' }),
            suspendedSubscriptions: await Subscription.countDocuments({ status: 'suspended' })
        };

        res.status(200).json({ stats });
    } catch (error) {
        res.status(500).json({ message: 'Error fetching stats', error: error.message });
    }
};
