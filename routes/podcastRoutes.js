const express = require('express');
const router = express.Router();
const { protect, mentorOnly, adminOrModerator, adminOnly } = require('../middleware/authmiddleware');
const { verifySubscription, verifyPodcastRecordingAccess } = require('../middleware/subscriptionMiddleware');
const { createPodcast, getPendingPodcasts, updatePodcastApproval, getApprovedPodcasts, startPodcastStream, endPodcastStream, joinPodcastStream, addPodcastComment, getPodcastComments } = require('../controllers/podcastController');

router.post('/', protect, mentorOnly, createPodcast);
router.get('/pending', protect, adminOnly, getPendingPodcasts);
router.patch('/:id/approval', protect, adminOnly, updatePodcastApproval);
router.get('/approved', protect, getApprovedPodcasts);
router.put('/:id/start-stream', protect, mentorOnly, startPodcastStream);
router.put('/:id/end-stream', protect, mentorOnly, endPodcastStream);
router.get('/:id/join-stream', protect, verifySubscription('podcast'), joinPodcastStream);
router.post('/:id/comment', protect, addPodcastComment);
router.get('/:id/comments', protect, mentorOnly, getPodcastComments);

module.exports = router;