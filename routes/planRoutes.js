const express = require('express');
const router = express.Router();
const { protect, adminOnly } = require('../middleware/authmiddleware');
const {getAvailablePlans, createPlan, getAllPlans, getPlanById, updatePlan, deactivatePlan, reactivatePlan} = require('../controllers/planController');

router.get('/available', getAvailablePlans);

router.post('/', protect, adminOnly, createPlan);
router.get('/', protect, adminOnly, getAllPlans);
router.get('/:id', protect, adminOnly, getPlanById);
router.put('/:id', protect, adminOnly, updatePlan);
router.put('/:id/deactivate', protect, adminOnly, deactivatePlan);
router.put('/:id/reactivate', protect, adminOnly, reactivatePlan);

module.exports = router;
