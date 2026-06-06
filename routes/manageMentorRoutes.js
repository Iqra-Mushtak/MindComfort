const { suspendMentor, unsuspendMentor } = require('..controllers/mentorManagementController');
const { protect, AdminOnly } = require('../middleware/authmiddleware');

router.patch('/suspend-mentor/:mentorId', protect, AdminOnly, suspendMentor);
router.patch('/unsuspend-mentor/:mentorId', protect, AdminOnly, unsuspendMentor);