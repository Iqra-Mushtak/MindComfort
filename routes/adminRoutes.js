const express = require('express');
const router = express.Router();
const { suspendMentor, unsuspendMentor } = require('../controllers/mentorManagementController');
const { getAdminDashboardInsights } = require('../controllers/insightsController');
const { protect, adminOnly } = require('../middleware/authmiddleware');

router.patch('/suspend-mentor/:mentorId', protect, adminOnly, suspendMentor);
router.patch('/unsuspend-mentor/:mentorId', protect, adminOnly, unsuspendMentor);
router.get('/insights', protect, adminOnly, getAdminDashboardInsights);

module.exports = router;