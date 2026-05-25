const express = require('express');
const router = express.Router();
const { protect, mentorOnly } = require('../middleware/authmiddleware');
const { createPodcast, getPendingPodcasts, updatePodcastApproval } = require('../controllers/podcastController');

router.post('/', protect, mentorOnly, createPodcast);
router.get('/pending', protect, mentorOnly, getPendingPodcasts);
router.put('/:id/approval', protect, mentorOnly, updatePodcastApproval);

module.exports = router;