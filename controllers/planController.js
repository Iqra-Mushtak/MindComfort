const Plan = require('../models/Plan');
const Subscription = require('../models/Subscription');

exports.createPlan = async (req, res) => {
    try {
        const { name, description, type, price, durationMonths, features, displayOrder } = req.body;

        if (!name || !type || price === undefined || !durationMonths) {
            return res.status(400).json({ message: 'Missing required fields: name, type, price, durationMonths' });
        }

        if (!['chat', 'podcast', 'both'].includes(type)) {
            return res.status(400).json({ message: 'Invalid plan type. Must be chat, podcast, or both' });
        }

        const existingPlan = await Plan.findOne({ name: name.trim() });
        if (existingPlan) {
            return res.status(400).json({ message: 'Plan with this name already exists' });
        }

        const plan = await Plan.create({
            name: name.trim(),
            description: description ? description.trim() : '',
            type,
            price,
            currency: 'PKR',
            durationMonths,
            features: features || [],
            displayOrder: displayOrder || 0,
            createdBy: req.user._id
        });

        res.status(201).json({
            message: 'Plan created successfully',
            plan
        });
    } catch (error) {
        res.status(500).json({ message: 'Error creating plan', error: error.message });
    }
};

exports.getAllPlans = async (req, res) => {
    try {
        const { type, isActive } = req.query;
        
        let filter = {};
        if (type) filter.type = type;
        if (isActive !== undefined) filter.isActive = isActive === 'true';

        const plans = await Plan.find(filter)
            .populate('createdBy', 'username email')
            .populate('updatedBy', 'username email')
            .sort({ displayOrder: 1, createdAt: -1 });

        res.status(200).json({
            total: plans.length,
            plans
        });
    } catch (error) {
        res.status(500).json({ message: 'Error fetching plans', error: error.message });
    }
};

exports.getPlanById = async (req, res) => {
    try {
        const { id } = req.params;

        const plan = await Plan.findById(id)
            .populate('createdBy', 'username email')
            .populate('updatedBy', 'username email');

        if (!plan) {
            return res.status(404).json({ message: 'Plan not found' });
        }

        res.status(200).json(plan);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching plan', error: error.message });
    }
};

exports.updatePlan = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, description, price, durationMonths, features, isActive, displayOrder } = req.body;

        const plan = await Plan.findById(id);
        if (!plan) {
            return res.status(404).json({ message: 'Plan not found' });
        }

        if (name && name.trim() !== plan.name) {
            const existingPlan = await Plan.findOne({ name: name.trim() });
            if (existingPlan) {
                return res.status(400).json({ message: 'Plan with this name already exists' });
            }
            plan.name = name.trim();
        }

        if (description !== undefined) plan.description = description.trim();
        if (price !== undefined) plan.price = price;
        if (durationMonths !== undefined) plan.durationMonths = durationMonths;
        if (features) plan.features = features;
        if (isActive !== undefined) plan.isActive = isActive;
        if (displayOrder !== undefined) plan.displayOrder = displayOrder;

        plan.updatedBy = req.user._id;
        await plan.save();

        res.status(200).json({
            message: 'Plan updated successfully',
            plan
        });
    } catch (error) {
        res.status(500).json({ message: 'Error updating plan', error: error.message });
    }
};

exports.deactivatePlan = async (req, res) => {
    try {
        const { id } = req.params;

        const plan = await Plan.findByIdAndUpdate(
            id,
            { isActive: false, updatedBy: req.user._id },
            { new: true }
        );

        if (!plan) {
            return res.status(404).json({ message: 'Plan not found' });
        }

        res.status(200).json({
            message: 'Plan deactivated successfully',
            plan
        });
    } catch (error) {
        res.status(500).json({ message: 'Error deactivating plan', error: error.message });
    }
};

exports.reactivatePlan = async (req, res) => {
    try {
        const { id } = req.params;

        const plan = await Plan.findByIdAndUpdate(
            id,
            { isActive: true, updatedBy: req.user._id },
            { new: true }
        );

        if (!plan) {
            return res.status(404).json({ message: 'Plan not found' });
        }

        res.status(200).json({
            message: 'Plan reactivated successfully',
            plan
        });
    } catch (error) {
        res.status(500).json({ message: 'Error reactivating plan', error: error.message });
    }
};

exports.getAvailablePlans = async (req, res) => {
    try {
        const { type } = req.query;
        
        let filter = { isActive: true };
        if (type) filter.type = { $in: [type, 'both'] };

        const plans = await Plan.find(filter)
            .select('_id name description type price currency durationMonths features displayOrder')
            .sort({ displayOrder: 1 });

        res.status(200).json({
            total: plans.length,
            plans
        });
    } catch (error) {
        res.status(500).json({ message: 'Error fetching plans', error: error.message });
    }
};


