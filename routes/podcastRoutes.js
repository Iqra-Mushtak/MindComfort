const express = require('express');
const router = express.Router();
const { protect, mentorOnly } = require('../middleware/authmiddleware');
const { createPodcast, getPendingPodcasts, updatePodcastApproval, getApprovedPodcasts, startPodcastStream, endPodcastStream, joinPodcastStream, addPodcastComment, getPodcastComments } = require('../controllers/podcastController');

router.post('/', protect, mentorOnly, createPodcast);
router.get('/pending', protect, mentorOnly, getPendingPodcasts);
router.put('/:id/approval', protect, mentorOnly, updatePodcastApproval);
router.get('/approved', protect, getApprovedPodcasts);
router.put('/:id/start-stream', protect, mentorOnly, startPodcastStream);
router.put('/:id/end-stream', protect, mentorOnly, endPodcastStream);
router.get('/:id/join-stream', protect, joinPodcastStream);
router.post('/:id/comment', protect, addPodcastComment);
router.get('/:id/comments', protect, getPodcastComments);

module.exports = router;