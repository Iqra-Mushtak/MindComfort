const express = require('express');
const router = express.Router();
const { protect, mentorOnly } = require('../middleware/authmiddleware');
const { createPodcast } = require('../controllers/podcastController');

router.post('/', protect, mentorOnly, createPodcast);

module.exports = router;