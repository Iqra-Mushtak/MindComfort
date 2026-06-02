const Podcast = require('../models/Podcast');
const PodcastComment = require('../models/PodcastComment');
const { RtcTokenBuilder, RtcRole } = require('agora-access-token');
const { v4: uuidv4 } = require('uuid');
const ClientAnonymousSession = require('../models/ClientAnonymousSession');
const axios = require('axios');

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
    
const getPendingPodcasts = async (req, res) => {
    try {
        const pendingPodcasts = await Podcast.find({ approvalStatus: 'pending' })
        .populate('speaker', 'name email')
        .sort({ startTime: 1 });

        res.status(200).json({
            success: true,
            count: pendingPodcasts.length,
            data: pendingPodcasts,
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message,
            message: 'Failed to retrieve pending podcasts',
        });
    }
};

const updatePodcastApproval = async (req, res) => {
    try {
        const { approvalStatus } = req.body;

        if (!approvalStatus || !['approved', 'rejected'].includes(approvalStatus)) {
            return res.status(400).json({ message: 'Invalid approval status. Must be either "approved" or "rejected".' });
        }
        const podcast = await Podcast.findById(req.params.id);
        if (!podcast) {
            return res.status(404).json({ message: 'Podcast listing not found' });
        }
        if (podcast.approvalStatus !== 'pending') {
            return res.status(400).json({ message: 'Only pending podcast sessions can be updated' });
        }
        podcast.approvalStatus = approvalStatus;
        await podcast.save();

        res.status(200).json({
            success: true,
            message: `Podcast session has been ${approvalStatus}.`,
            data: podcast,
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message,
            message: 'Failed to update podcast approval status',
        });
    }
};

const getApprovedPodcasts = async (req, res) => {
    try {
        const approvedPodcasts = await Podcast.find({ approvalStatus: 'approved' })
        .populate('speaker', 'name email')
        .sort({ startTime: 1 });

        res.status(200).json({
            success: true,
            count: approvedPodcasts.length,
            data: approvedPodcasts,
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message,
            message: 'Failed to retrieve approved podcasts',
        });
    }
};

const startPodcastStream = async (req, res) => {
    try {
        const podcast = await Podcast.findById(req.params.id);
        if (!podcast) {
            return res.status(404).json({ message: 'Podcast session not found' });
        }
        if (podcast.speaker.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: 'You are not authorized to start this podcast session' });
        }
        if (podcast.approvalStatus !== 'approved') {
            return res.status(400).json({ message: 'Only approved podcast sessions can be started' });
        }
        if (podcast.streamStatus !== 'scheduled') {
            return res.status(400).json({ message: 'This podcast session has already been started or ended' });
        }
        const channelName = podcast._id.toString();
        const uid = 0;
        const role = RtcRole.PUBLISHER;
        const expirationTime = 7200;
        const currentTimestamp = Math.floor(Date.now() / 1000);
        const privilegeExpiredTs = currentTimestamp + expirationTime;

        const rtcToken = RtcTokenBuilder.buildTokenWithUid(
            process.env.AGORA_APP_ID, 
            process.env.AGORA_APP_CERTIFICATE, 
            channelName, 
            uid, 
            role, 
            privilegeExpiredTs
        );

        let resourceId = null;
        let recordingSid = null;
        try{
            const headers = getAgoraRestHeaders();

            const aquireResponse = await axios.post(
                `https://api.agora.io/v1/apps/${process.env.AGORA_APP_ID}/cloud_recording/acquire`,
                {
                    cname: channelName,
                    uid: "999",
                    clientRequest: {resourceExpiredHour: 24, scene: 0}
                },
                { headers }
            );
        resourceId = aquireResponse.data.resourceId;
        const startResponse = await axios.post(
            `https://api.agora.io/v1/apps/${process.env.AGORA_APP_ID}/cloud_recording/resourceId/${resourceId}/mode/mix/start`,
            {
                cname: channelName,
                uid: "999",
                clientRequest: {
                    recordingConfig: {
                        maxIdleTime: 30,
                        streamTypes: 0,
                        channelType: 0
                    },
                    storageConfig: {
                        vendor: 1,
                        region: 0,
                        bucket: process.env.FIREBASE_STORAGE_BUCKET_NAME,
                        accessKey: process.env.FIREBASE_ACCESS_KEY,
                        secretKey: process.env.FIREBASE_SECRET_KEY,
                        fileNamePrefix: `podcast_recordings/${podcast._id}`
                    }
                }
            },
            { headers }
        );
        recordingSid = startResponse.data.sid;
    } catch (recordingError) {
        console.error('Failed to start Agora recording:', recordingError.message);
    }

        podcast.streamStatus = 'live';
        await podcast.save();

        res.status(200).json({
            success: true,
            message: 'Podcast stream started successfully',
            token: rtcToken,
            channelName: channelName,
            data: podcast
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message,
            message: 'Failed to start podcast stream',
        });
    }
};

const endPodcastStream = async (req, res) => {
    try {
        const podcast = await Podcast.findById(req.params.id);
        if (!podcast) {
            return res.status(404).json({ message: 'Podcast not found' });
        }
        if (podcast.speaker.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: 'Access denied.' });
        }
        if (podcast.streamStatus !== 'live') {
            return res.status(400).json({ message: 'Podcast stream is not currently live' });
        }

        if(podcast.agoraResourceId && podcast.agoraSid){
            try{
                const headers = getAgoraRestHeaders();

                const stopResponse = await axios.post(
                    `https://api.agora.io/v1/apps/${process.env.AGORA_APP_ID}/cloud_recording/resourceId/${podcast.agoraResourceId}/sid/${podcast.agoraSid}/mode/mix/stop`,
                    {
                        cname: podcast._id.toString(),
                        uid: "999",
                        clientRequest: {}
                    },
                    { headers }
                );
                const finalFile = stopResponse.data.serverResponse.fileList;
                if (finalFile) {
                    podcast.recordingUrl = `https://storage.googleapis.com/${process.env.FIREBASE_STORAGE_BUCKET_NAME}/${finalFile}`;
                }
            }
            catch (recordingError) {
                console.error('Failed to stop Agora recording:', recordingError.message);
            }
        }

        podcast.streamStatus = 'ended';
        await podcast.save();

        res.status(200).json({
            success: true,
            message: 'Podcast stream ended successfully',
            data: podcast,
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message,
            message: 'Failed to end podcast stream',
        });
    }
};

const joinPodcastStream = async (req, res) => {
    try{
        const podcast = await Podcast.findById(req.params.id);
        if (!podcast){
            return res.status(404).json({message: 'Podcast session not found.'});
        }
        if (podcast.streamStatus !== 'live'){
            return res.status(400).json({message: 'This podcast session is not currently live.'});
        }

        const secureAnonymousId = uuidv4();
        const anonymousSession = await ClientAnonymousSession.create({
            userId: req.user._id,
            chatroomId: podcast._id,
            anonymousId: secureAnonymousId,
        });
        await anonymousSession.save();

        const channelName = podcast._id.toString();
        const uid = 0;
        const role = RtcRole.SUBSCRIBER;
        const expirationTime = 7200;
        const currentTimestamp = Math.floor(Date.now() / 1000);
        const privilegeExpiredTs = currentTimestamp + expirationTime;

        const rtcToken = RtcTokenBuilder.buildTokenWithUid(
            process.env.AGORA_APP_ID,
            process.env.AGORA_APP_CERTIFICATE,
            channelName,
            uid,
            role,
            privilegeExpiredTs
        );

        res.status(200).json({
            success: true,
            message: 'Connected successfully',
            token: rtcToken,
            channelName: channelName,
            anonymousId: secureAnonymousId,
            sessionId: anonymousSession._id,
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message,
            message: 'Failed to connect with live session'
        });
    }
};

const addPodcastComment = async (req, res) => {
    try{
        const { content, anonymousId } = req.body;
        if (!content || content.trim() === '') {
            return res.status(400).json({message: 'Writing a comment is required.'});
        }
        if(!anonymousId){
            return res.status(400).json({message: 'Anonymous session ID is required to submit a comment.'});
        }

        const podcast = await Podcast.findById(req.params.id);
        if (!podcast){
            return res.status(404).json({message: 'Podcast session not found.'});
        }

        const PodcastComment = require('../models/PodcastComment');
        const comment = await PodcastComment.create({
            podcastId: req.params.id,
            user: req.user._id,
            anonymousId: anonymousId,
            content: content.trim(),
        });

        const io = req.app.get('io');
        io.to(podcast._id.toString()).emit('newComment', {
            _id: comment._id,
            podcastId: comment.podcastId,
            anonymousId: comment.anonymousId,
            content: comment.content,
            createdAt: comment.createdAt,
        });

        res.status(201).json({
            success: true,
            message: 'Comment submitted successfully to the host mentor.',
            data: {
                _id: comment._id,
                podcastId: comment.podcastId,
                anonymousId: comment.anonymousId,
                content: comment.content,
                createdAt: comment.createdAt,
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message,
            message: 'Failed to submit comment',
        });
    }
};

const getPodcastComments = async (req, res) => {
    try {
        const podcast = await Podcast.findById(req.params.id);
        if (!podcast) {
            return res.status(404).json({ message: 'Podcast session not found.' });
        }
        if (podcast.speaker.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: 'Access denied. Only the host mentor can view comments.' });
        }
        const PodcastComment = require('../models/PodcastComment');
        const {v5: uuidv5} = require('uuid');

        const comments = await PodcastComment
        .find({ podcastId: req.params.id })
        .select('-user')
        .sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            count: comments.length,
            data: comments,
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message,
            message: 'Failed to retrieve comments',
        });
    }
};

module.exports = { createPodcast, getPendingPodcasts, updatePodcastApproval, getApprovedPodcasts, startPodcastStream, endPodcastStream, joinPodcastStream, addPodcastComment, getPodcastComments };
