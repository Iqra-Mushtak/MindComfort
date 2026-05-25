const Podcast = require('../models/Podcast');

const createPodcast = async (req, res) => {
    try {
        const { title, description, startTime, endTime, coverImage } = req.body;
        if (!title || !description || !startTime || !endTime || !coverImage) {
            return res.status(400).json({ message: 'All fields are required' });
        }

        const start = new Date(startTime);
        const end = new Date(endTime);
        const now = new Date();

        if (start >= end) {
            return res.status(400).json({ message: 'Start time must be before end time' });
        }
        if (start < now) {
            return res.status(400).json({ message: 'Start time must be in the future' });
        }
        if (!coverImage.match(/\.(jpg|jpeg|png|gif)$/)) {
            return res.status(400).json({ message: 'Cover image must be a valid image URL' });
        }

        const overLappingPodcast = await Podcast.findOne({
            approvalStatus: {$in: ['pending', 'approved']},
            $and: [
                {
                    startTime: { $lt: new Date(endTime) },
                },
                {
                    endTime: { $gt: new Date(startTime) },
                }
            ]
        });
        if (overLappingPodcast) {
            return res.status(400).json({ message: 'Scheduling conflict! Another podcast session has already reserved or requested this time slot.' });
        }
        const podcast = await Podcast.create({
            title,
            description,
            startTime: new Date(startTime),
            endTime: new Date(endTime),
            coverImage,
            speaker: req.user._id,
            approvalStatus: 'pending',
            streamStatus: 'scheduled',
        });
        res.status(201).json({
            success: true,
            message: 'Podcast session created successfully and is pending approval.',
            data: podcast,
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message,
            message: 'Failed to create podcast session',
        });
    }
};
module.exports = { createPodcast };
    