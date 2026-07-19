const Podcast = require('../models/Podcast');
const PodcastComment = require('../models/PodcastComment');
const NotificationService = require('../services/notificationService');
const User = require('../models/User');
const { RtcTokenBuilder, RtcRole } = require('agora-access-token');
const { v4: uuidv4 } = require('uuid');
const ClientAnonymousSession = require('../models/ClientAnonymousSession');
const axios = require('axios');
const { getAgoraRestHeaders } = require('../config/agora');
const Subscription = require('../models/Subscription'); 

const createPodcast = async (req, res) => {
    try {
        const { title, description, startTime, endTime, price } = req.body;
        if (!title || !description || !startTime || !endTime || !price) {
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
            price: price !== undefined ? Number(price) : 0, 
            coverImage,
            speaker: req.user._id,
            approvalStatus: 'pending',
            streamStatus: 'scheduled',
        });

        const admins = await User.find({ role: 'admin' }).select('_id');
        if (admins.length > 0) {
            const adminIds = admins.map(admin => admin._id);
            await NotificationService.sendBulkNotifications({
                recipientIds: adminIds,
                type: 'podcast_submitted',
                message: `New podcast session submitted: "${title}" by ${req.user.username || 'a mentor'}`,
                link: `/admin/podcasts/${podcast._id}`,
                channels: ['in-app']
            });
        }

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
        .populate('speaker', 'username email')
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

        const isApproved = approvalStatus === 'approved';
        
        await NotificationService.sendNotification({
            recipientId: podcast.speaker,
            type: isApproved ? 'podcast_approved' : 'podcast_rejected',
            message: isApproved 
                ? `Great news! Your podcast "${podcast.title}" has been approved.` 
                : `We're sorry, but your podcast "${podcast.title}" was rejected.`,
            link: `/podcasts/${podcast._id}`,
            html: isApproved 
                ? `<h1>Podcast Approved</h1><p>Your podcast <strong>${podcast.title}</strong> is ready to go live.</p>`
                : `<h1>Podcast Update</h1><p>Your podcast <strong>${podcast.title}</strong> could not be approved at this time. You can try again.</p>`,
            channels: ['in-app', 'email']
        });

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
        .populate('speaker', 'username email')
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
        if (podcast.streamStatus === 'live') {
            if(podcast.speaker.toString() !== req.user._id.toString()){
                return res.status(400).json({message: 'Unauthorized action.'});
            }
            return res.status(200).json({
                success: true,
                message: 'Resuming the session.',
                token: RtcTokenBuilder.buildTokenWithUid(
                    process.env.AGORA_APP_ID, 
                    process.env.AGORA_APP_CERTIFICATE,
                    podcast._id.toString(),
                    0,
                    RtcRole.PUBLISHER),
                channelName: podcast._id.toString(),
                data: podcast,
            });
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
                    // storageConfig: {
                    //     vendor: 1,
                    //     region: 0,
                    //     bucket: process.env.FIREBASE_STORAGE_BUCKET_NAME,
                    //     accessKey: process.env.FIREBASE_ACCESS_KEY,
                    //     secretKey: process.env.FIREBASE_SECRET_KEY,
                    //     fileNamePrefix: `podcast_recordings/${podcast._id}`
                    // }
                }
            },
            { headers }
        );
        recordingSid = startResponse.data.sid;
    } catch (recordingError) {
        console.error('Failed to start Agora recording:', recordingError.message);
    }
    if(!recordingSid) {
        return res.status(500).json({
            success: false,
            message: 'Failed to start recording.'
        });
    }

        podcast.streamStatus = 'live';
        podcast.agoraResourceId = resourceId;
        podcast.agoraSid = recordingSid;
        await podcast.save();

        const subscribedUsers = await User.find({ isSubscribed: true }).select('_id');
        const subscriberIds = subscribedUsers.map(user => user._id);
        if (subscriberIds.length > 0) {
            await NotificationService.sendBulkNotifications({
                recipientIds: subscriberIds,
                type: 'podcast_live',
                message: `Live now: "${podcast.title}" has started streaming. Join now!`,
                link: `/podcasts/${podcast._id}`,
                channels: ['in-app']
            });
        }

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
            onModel: 'Podcast',
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

const moderatePodcastComment = async (req, res) => {
    try {
        const { action, reason } = req.body;
        if (!['warn', 'suspend'].includes(action)) {
            return res.status(400).json({ message: 'Action must be either warn or suspend.' });
        }

        const comment = await PodcastComment.findById(req.params.commentId).populate('user');
        if (!comment || comment.podcastId.toString() !== req.params.id) {
            return res.status(404).json({ message: 'Podcast comment not found.' });
        }

        const targetUser = comment.user;
        if (!targetUser || targetUser.role !== 'client') {
            return res.status(400).json({ message: 'Only client accounts can be warned or suspended from podcast comments.' });
        }

        const moderationReason = reason?.trim() || 'No reason provided.';

        if (action === 'warn') {
            targetUser.warningCount = (targetUser.warningCount || 0) + 1;
            await targetUser.save();
            await NotificationService.sendNotification({
                recipientId: targetUser._id,
                type: 'user_warned',
                message: `A podcast comment you posted was reviewed and a warning was issued. Reason: ${moderationReason}`,
                link: `/podcasts/${req.params.id}`,
                channels: ['in-app']
            });
        } else {
            if (targetUser.isSuspended) {
                return res.status(400).json({ message: 'This user is already suspended.' });
            }
            targetUser.isSuspended = true;
            await targetUser.save();
            await NotificationService.sendNotification({
                recipientId: targetUser._id,
                type: 'user_suspended',
                message: `Your account has been suspended after a podcast comment violation. Reason: ${moderationReason}`,
                link: `/podcasts/${req.params.id}`,
                channels: ['in-app']
            });
        }

        res.status(200).json({
            success: true,
            message: `Client ${action === 'warn' ? 'warned' : 'suspended'} successfully.`,
            data: {
                action,
                reason: moderationReason,
                userId: targetUser._id,
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message,
            message: 'Failed to moderate podcast comment',
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
        if (['admin', 'moderator'].includes(req.user.role)) {
            return res.status(403).json({ message: 'Admins and moderators cannot post podcast comments.' });
        }
        if (req.user.role !== 'client') {
            return res.status(403).json({ message: 'Only clients can post podcast comments.' });
        }

        const podcast = await Podcast.findById(req.params.id);
        if (!podcast){
            return res.status(404).json({message: 'Podcast session not found.'});
        }

        const comment = await PodcastComment.create({
            podcastId: req.params.id,
            user: req.user._id,
            anonymousId: anonymousId,
            content: content.trim(),
        });

        const io = req.app.get('io');
        io.to(`podcast_${req.params.id}`).emit('newComment', {
            _id: comment._id,
            podcastId: comment.podcastId,
            anonymousId: comment.anonymousId,
            content: comment.content,
            createdAt: comment.createdAt,
        });
        await NotificationService.sendNotification({
            recipientId: podcast.speaker,
            type: 'podcast_comment_received',
            message: `New comment on your podcast "${podcast.title}": "${content.trim().substring(0, 50)}${content.trim().length > 50 ? '...' : ''}"`,
            link: `/podcasts/${req.params.id}`,
            channels: ['in-app']
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
        const canViewComments = ['admin', 'moderator'].includes(req.user.role) || podcast.speaker.toString() === req.user._id.toString();
        if (!canViewComments) {
            return res.status(403).json({ message: 'Access denied. Only the host mentor or staff can view comments.' });
        }

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

// 1. Get single podcast by ID
const getPodcastById = async (req, res) => {
    try {
        const podcast = await Podcast.findById(req.params.id).populate('speaker', 'username fullName email');
        if (!podcast) return res.status(404).json({ message: 'Podcast not found' });
        res.status(200).json({ success: true, data: podcast });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

const getClientUpcomingPodcasts = async (req, res) => {
    try {
        const now = new Date();
        const upcomingPodcasts = await Podcast.find({
            approvalStatus: 'approved',
            streamStatus: { $in: ['scheduled', 'live'] },
            startTime: { $gt: now }
        }).populate('speaker', 'username fullName').sort({ startTime: 1 });

        const userId = req.user._id;
        const userSubs = await Subscription.find({
            userId,
            type: { $in: ['podcast', 'both'] },
            status: 'active',
            $or: [{ endDate: { $gt: now } }, { endDate: null }]
        }).select('referenceId type');

        const hasPlanAccess = userSubs.some(s => s.type === 'podcast' || s.type === 'both');
        const purchasedIds = new Set(userSubs.filter(s => s.referenceId).map(s => s.referenceId.toString()));

        const podcasts = upcomingPodcasts.map(p => ({
            ...p.toObject(),
            isPurchased: hasPlanAccess || purchasedIds.has(p._id.toString())
        }));

        res.status(200).json({ success: true, data: podcasts });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

const getClientMyLibrary = async (req, res) => {
    try {
        const userId = req.user._id;
        const now = new Date();

        const subscriptions = await Subscription.find({
            userId,
            type: { $in: ['podcast', 'both'] },
            status: 'active',
            $or: [{ endDate: { $gt: now } }, { endDate: null }]
        }).select('referenceId type status createdAt');

        const hasPlanAccess = subscriptions.some(s => !s.referenceId);
        let podcasts = [];

        if (hasPlanAccess) {
            podcasts = await Podcast.find({ approvalStatus: 'approved' }).populate('speaker', 'username fullName');
        } else {
            const podcastIds = subscriptions.filter(s => s.referenceId).map(s => s.referenceId);
            if (podcastIds.length === 0) return res.status(200).json({ success: true, upcoming: [], past: [] });
            podcasts = await Podcast.find({ _id: { $in: podcastIds } }).populate('speaker', 'username fullName');
        }

        const upcoming = [];
        const past = [];

        podcasts.forEach(podcast => {
            const podcastData = { ...podcast.toObject(), hasPlanAccess };
            if (podcast.streamStatus === 'scheduled' || podcast.streamStatus === 'live') {
                upcoming.push(podcastData);
            } else if (podcast.streamStatus === 'ended') {
                past.push({
                    ...podcastData,
                    hasRecording: !!podcast.recordingUrl,
                    recordingUrl: podcast.recordingUrl || null
                });
            }
        });

        upcoming.sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
        past.sort((a, b) => new Date(b.endTime) - new Date(a.endTime));

        res.status(200).json({ success: true, upcoming, past });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

const getPodcastRecording = async (req, res) => {
    try {
        const userId = req.user._id;
        const podcast = await Podcast.findById(req.params.id);
        if (!podcast) return res.status(404).json({ message: 'Podcast not found' });

        if (!podcast.recordingUrl) {
            return res.status(404).json({ message: 'No recording available for this podcast' });
        }

        const isSpeaker = podcast.speaker.toString() === userId.toString();
        const isStaff = ['admin', 'moderator'].includes(req.user.role);

        if (!isSpeaker && !isStaff) {
            const subscription = await Subscription.findOne({
                userId,
                type: { $in: ['podcast', 'both'] },
                status: 'active',
                $and: [
                    { $or: [{ endDate: { $gt: new Date() } }, { endDate: null }] },
                    { $or: [{ referenceId: podcast._id }, { referenceId: null }] }
                ]
            });
            if (!subscription) {
                return res.status(403).json({ message: 'You must purchase this podcast to access the recording' });
            }
        }

        podcast.listenCount = (podcast.listenCount || 0) + 1;
        await podcast.save();

        res.status(200).json({ success: true, recordingUrl: podcast.recordingUrl });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

const deletePodcastRecording = async (req, res) => {
    try {
        const podcast = await Podcast.findById(req.params.id);
        if (!podcast) return res.status(404).json({ message: 'Podcast not found' });
        if (!podcast.recordingUrl) return res.status(400).json({ message: 'This podcast has no recording to delete' });

        podcast.recordingUrl = null;
        await podcast.save();

        res.status(200).json({ success: true, message: 'Recording deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

module.exports = { 
    createPodcast, getPendingPodcasts, updatePodcastApproval, getApprovedPodcasts, 
    startPodcastStream, endPodcastStream, joinPodcastStream, moderatePodcastComment, 
    addPodcastComment, getPodcastComments,
    getPodcastById, getClientUpcomingPodcasts, getClientMyLibrary, getPodcastRecording, deletePodcastRecording 
};