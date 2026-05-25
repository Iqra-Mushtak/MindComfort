const express = require('express');
const router = express.Router();
const { protect, mentorOnly } = require('../middleware/authmiddleware');
const { createPodcast, getPendingPodcasts, updatePodcastApproval, getApprovedPodcasts, startPodcastStream, endPodcastStream } = require('../controllers/podcastController');

router.post('/', protect, mentorOnly, createPodcast);
router.get('/pending', protect, mentorOnly, getPendingPodcasts);
router.put('/:id/approval', protect, mentorOnly, updatePodcastApproval);
router.get('/approved', protect, getApprovedPodcasts);
router.put('/:id/start-stream', protect, mentorOnly, startPodcastStream);
router.put('/:id/end-stream', protect, mentorOnly, endPodcastStream);

module.exports = router;