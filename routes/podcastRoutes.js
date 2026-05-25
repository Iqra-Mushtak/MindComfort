const express = require('express');
const router = express.Router();
const { protect, mentorOnly } = require('../middleware/authmiddleware');
const { createPodcast, getPendingPodcasts, updatePodcastApproval, getApprovedPodcasts } = require('../controllers/podcastController');

router.post('/', protect, mentorOnly, createPodcast);
router.get('/pending', protect, mentorOnly, getPendingPodcasts);
router.put('/:id/approval', protect, mentorOnly, updatePodcastApproval);
router.get('/approved', protect, getApprovedPodcasts);

module.exports = router;