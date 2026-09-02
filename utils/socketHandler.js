const jwt = require('jsonwebtoken');
const {Server} = require('socket.io');
const {v4: uuidv4 } = require('uuid');
const mongoose = require('mongoose');
const redisClient = require('../config/redis');

const Chatroom = require('../models/Chatroom');
const ChatMessage = require('../models/ChatMessage');
const ClientAnonymousSession = require('../models/ClientAnonymousSession');
const User = require('../models/User');
const NotificationService = require('../Services/NotificationService');

const initSocket = (server) => {
const allowedOrigins = [
    process.env.CLIENT_URL,
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://0.0.0.0:5173'
].filter(Boolean);

const isAllowedOrigin = (origin) => {
    if (!origin) return true;
    if (allowedOrigins.includes(origin)) return true;

    try {
        const { hostname } = new URL(origin);
        return ['localhost', '127.0.0.1', '0.0.0.0', '::1'].includes(hostname)
            || hostname.startsWith('192.168.')
            || hostname.startsWith('172.')
            || hostname.startsWith('10.');
    } catch (error) {
        return false;
    }
};

const corsOrigin = (origin, callback) => {
    if (isAllowedOrigin(origin)) {
        callback(null, true);
    } else {
        callback(new Error('Not allowed by CORS'));
    }
};

const io = new Server(server, {
    cors: {
        origin: corsOrigin,
        methods: ['GET', 'POST'],
        credentials: true
    }
});

const isStaffRole = (role) => ['admin', 'moderator'].includes(role);

const checkChatRateLimit = async (chatroomId, userId) => {
    const rateKey = `ratelimit:chat:${chatroomId}:${userId}`;
    const currentCount = await redisClient.incr(rateKey);
    if (currentCount === 1) {
        await redisClient.expire(rateKey, 60);
    }
    return currentCount <= 15;
};

io.use(async (socket, next) => {
    try{
        const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.split(' ')[1];
        if (!token) {
            return next(new Error('Authentication token is required'));
        }
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id).select('-password');
        if (!user) {
            return next(new Error('User not found'));
        }
        if (user.isSuspended || user.isBlacklisted || (user.role === 'mentor' && user.status === 'rejected')) {
            return next(new Error('User is suspended or rejected'));
        }
        socket.user = user;
        socket.join(`user_${user._id}`);
        next();
    } catch (error) {
        return next(new Error('Invalid authentication token'));
    }
});

io.on('connection', (socket) => {
    socket.on('joinRoom', async (payload, callback) => {
        const sendJoinAck = (response) => {
            if (typeof callback === 'function') {
                return callback(response);
            }
            socket.emit('joinAck', response);
        };

        try {
            let rawData = payload;

            if (payload && typeof payload === 'object' && Array.isArray(payload.args)) {
                rawData = payload.args[0];
            }

            console.log('Raw data extracted:', typeof rawData, JSON.stringify(rawData));

        let chatroomId = null;

        if (rawData && typeof rawData === 'object') {
            chatroomId = rawData.chatroomId;
        } else if (typeof rawData === 'string') {
            try {
                const parsed = JSON.parse(rawData);
                chatroomId = parsed.chatroomId || rawData;
            } catch (e) {
                chatroomId = rawData; 
            }
        }

        if (typeof chatroomId === 'string') {
            chatroomId = chatroomId.trim();
        }
        console.log('Extracted chatroomId:', chatroomId);

        if (!mongoose.Types.ObjectId.isValid(chatroomId)) {
            console.log('Invalid ID');
            if (typeof callback === 'function') {
                return callback({ status: 'error', message: 'Invalid chatroom ID' });
            }
            return socket.emit('joinError', 'Invalid chatroom ID');
        }
        
            const previousSessionRaw = await redisClient.get(`socket:session:${socket.id}`);
            if (previousSessionRaw) {
                const previousSession = JSON.parse(previousSessionRaw);
                socket.leave(previousSession.chatroomId);
            }
            const chatroom = await Chatroom.findById(chatroomId);
            console.log('Chatroom found:', !!chatroom);
            if (!chatroom || !chatroom.isActive) {
            console.log('Chatroom inactive or not found');
            if (typeof callback === 'function') {
                return callback({ status: 'error', message: 'Chatroom not found or is currently inactive' });
            }
            return socket.emit('joinError', 'Chatroom not found or is currently inactive');
            }
            if (socket.user.role === 'client' && !socket.user.isSubscribed) {
                if (typeof callback === 'function') {
                    return callback({ status: 'error', message: 'Premium subscription required' });
                }
                return socket.emit('joinError', 'Premium subscription required');
            }
            if (socket.user.role === 'mentor' && (socket.user.isSuspended || socket.user.status !== 'approved')) {
                if (typeof callback === 'function') {
                    return callback({ status: 'error', message: 'Your account is currently inactive or suspended.' });
                }
                return socket.emit('joinError', 'Your account is currently inactive or suspended.');
            }
            if (!isStaffRole(socket.user.role) && !chatroom.allowedRoles.includes(socket.user.role)) {
                if (typeof callback === 'function') {
                    return callback({ status: 'error', message: 'You do not have permission to join this chatroom' });
                }
                return socket.emit('joinError', 'You do not have permission to join this chatroom');
            }

            let dbSessionId = null;
            let displayIdentity = "";
                
                        if (socket.user.role === 'client') {
                let anonymousSession = await ClientAnonymousSession.findOne({
                    userId: socket.user._id,
                    chatroomId: chatroomId,
                });

                const secureUuid = uuidv4();

                if (!anonymousSession) {
                    // If absolutely no record exists, create a new one
                    anonymousSession = new ClientAnonymousSession({
                        userId: socket.user._id,
                        chatroomId: chatroomId,
                        onModel: 'Chatroom',
                        anonymousId: secureUuid,
                        isActive: true,
                    });
                    await anonymousSession.save();
                } else {
                    // If a record exists (even if it was marked inactive), update it with a NEW ID
                    anonymousSession.anonymousId = secureUuid;
                    anonymousSession.isActive = true;
                    await anonymousSession.save();
                }

                dbSessionId = anonymousSession._id;
                displayIdentity = anonymousSession.anonymousId;
            } else {
                const roleLabel = socket.user.role === 'admin' ? 'Admin' : socket.user.role === 'moderator' ? 'Moderator' : 'Mentor';
                displayIdentity = `${socket.user.fullName || socket.user.username} (${roleLabel})`;
                dbSessionId = `staff-${socket.user._id}`;
            }

            const sessionData = {
                userId: socket.user._id.toString(),
                chatroomId,
                sessionId: dbSessionId,
                anonymousId: displayIdentity,
                role: socket.user.role,
                isSubscribed: socket.user.isSubscribed
            };
            await redisClient.setex(`socket:session:${socket.id}`, 3600, JSON.stringify(sessionData));
            console.log('Session saved to Redis for socket:', socket.id);
            socket.join(chatroomId);

            const messages = await ChatMessage.find({ chatroomId , isDeleted: false })
            .sort({ createdAt: 1 })
            .limit(200)
            .populate('replyTo', 'content anonymousId'); 
            const safeMessages = messages.map(msg => {
                const msgObj = msg.toObject();
                const isOwn = msgObj.senderId.toString() === socket.user._id.toString();
                delete msgObj.senderId; 
                return { ...msgObj, isOwn };
            });

            const joinedData = {
                status: 'success',
                chatroomId,
                anonymousId: displayIdentity,
                sessionId: dbSessionId,
                messages: safeMessages,
            };

            socket.emit('joinedRoom', joinedData);
            sendJoinAck(joinedData);

            socket.to(chatroomId).emit('userJoined', {
                anonymousId: displayIdentity,
                role: socket.user.role,
            });
        } catch (error) {
            console.error('Auth failed:', error.message);
            console.error('Join Room Error:', error);
            sendJoinAck({ status: 'error', message: 'An error occurred while joining the chatroom' });
        }
    });

    socket.on('sendMessage', async (...args) => {
        console.log('Backend received sendMessage event');
        let rawPayload = args[0];

        if (args.length > 1) {
            const [maybeChatroomId, maybeContent, maybeReplyTo] = args;
            if (typeof maybeChatroomId === 'string' && typeof maybeContent === 'string') {
                rawPayload = {
                    chatroomId: maybeChatroomId,
                    content: maybeContent,
                    replyTo: maybeReplyTo,
                };
            }
        }

        if (rawPayload && typeof rawPayload === 'object' && Array.isArray(rawPayload.args)) {
            rawPayload = rawPayload.args[0];
        }

        if (typeof rawPayload === 'string') {
            rawPayload = { chatroomId: rawPayload };
        }

        const { chatroomId, content, replyTo } = rawPayload || {};
        const sessionRaw = await redisClient.get(`socket:session:${socket.id}`);
        const session = sessionRaw ? JSON.parse(sessionRaw) : null;

        if (!session || session.chatroomId !== chatroomId) {
            console.log(`Session verification failed for socket ${socket.id}`);
            console.log('Session:', sessionRaw, 'payload:', JSON.stringify(rawPayload));
            return socket.emit('messageError', 'Connection reference match failed.');
        }

        if (!content || !content.toString().trim()) {
            console.log(`Missing message content for socket ${socket.id}`, JSON.stringify(rawPayload));
            return socket.emit('messageError', 'Message content is required.');
        }

        if (isStaffRole(socket.user.role)) {
            return socket.emit('messageError', 'Admins and moderators cannot send messages in chatrooms.');
        }

        const isAllowed = (await checkChatRateLimit(chatroomId, session.userId));
        console.log('Rate limit check passed:', !isAllowed);
        if (!isAllowed) {
            console.log('Rate limit exceeded! Blocking message.');
            return socket.emit('messageError', 'You can send only 15 messages per minute in this chatroom.');
        }

        try {
            console.log('Saving message to database...');
            const message = new ChatMessage({
                chatroomId,
                senderId: session.userId,
                sessionId: session.sessionId,
                anonymousId: session.anonymousId,
                content: content.toString().trim(),
                replyTo
            });
            await message.save();
            if (replyTo) {
                await message.populate({
                    path: 'replyTo',
                    select: 'content anonymousId'
                });
            }
            console.log('Message saved to MongoDB:', message._id);

            const date = new Date().toISOString().split('T')[0];
            const totalKey = `activity:chatroom:${chatroomId}:total:${date}`; 
            const roleKey = `activity:chatroom:${chatroomId}:${session.role}:${date}`;
            const mentorKey = `activity:mentor:${session.userId}:chatroom:${chatroomId}:${date}`;
            
            // const multi = redisClient.multi();
            // multi.incr(totalKey);
            // multi.incr(roleKey);

            // if(session.role === 'mentor') {
            //     multi.incr(mentorKey);
            // }

            // await multi.exec();

            const pipeline = redisClient.pipeline();
            pipeline.incr(totalKey);
            pipeline.incr(roleKey);

            if (session.role === 'mentor') {
                pipeline.incr(mentorKey);
            }
            await pipeline.exec();

            const TTL = 3546000;
            await redisClient.expire(totalKey, TTL);
            await redisClient.expire(roleKey, TTL);
            if (session.role === 'mentor') {
                await redisClient.expire(mentorKey, TTL);
            }

            const basePayload = {
                _id: message._id,
                chatroomId: message.chatroomId,
                sessionId: message.sessionId,
                anonymousId: message.anonymousId,
                content: message.content,
                replyTo: message.replyTo,
                createdAt: message.createdAt
            };

            socket.emit('newMessage', { ...basePayload, isOwn: true });
            socket.to(chatroomId).emit('newMessage', { ...basePayload, isOwn: false });
        } catch (error) {
            console.error("Database Save Error:", error);
            socket.emit('messageError', 'An error occurred while sending the message');
        }
    });

    socket.on('leaveRoom', async () => {
        const sessionRaw = await redisClient.get(`socket:session:${socket.id}`);
        if (sessionRaw) {
            const session = JSON.parse(sessionRaw);
            socket.leave(session.chatroomId);
            if (session.role === 'client' && session.sessionId) {
                try {
                    await ClientAnonymousSession.findByIdAndUpdate(session.sessionId, { isActive: false });
                } catch (err) {
                    console.error('Error terminating session in DB:', err);
                }
            }
            await redisClient.del(`socket:session:${socket.id}`);
        }
    });

    socket.on('joinPodcastRoom', (podcastId) => {
        socket.join(`podcast_${podcastId}`);
        console.log(`Mentor ${socket.user._id} joined podcast room: podcast_${podcastId}`);
    });

    socket.on('adminDeleteMessage', async (payload) => {
        try {
            if (!isStaffRole(socket.user.role)) {
                return socket.emit('moderationError', 'Unauthorized: Only admins and moderators can delete messages');
            }

            const { messageId, chatroomId } = payload;
            const message = await ChatMessage.findByIdAndUpdate(
                messageId,
                { isDeleted: true },
                { returnDocument: 'after' }
            );

            if (!message) {
                return socket.emit('moderationError', 'Message not found');
            }

            io.to(chatroomId).emit('messageDeleted', {
                messageId,
                chatroomId,
                deletedAt: new Date()
            });

            socket.emit('moderationSuccess', 'Message deleted successfully');
        } catch (error) {
            console.error('Error deleting message:', error);
            socket.emit('moderationError', error.message);
        }
    });

    socket.on('adminWarnUser', async (payload) => {
        try {
            if (!isStaffRole(socket.user.role)) {
                return socket.emit('moderationError', 'Unauthorized: Only admins and moderators can warn users');
            }

            const { userId, messageId, reason } = payload;
            const user = await User.findById(userId);

            if (!user) {
                return socket.emit('moderationError', 'User not found');
            }

            if (!user.warnings) {
                user.warnings = 0;
            }
            user.warnings += 1;
            await user.save();

            await NotificationService.sendNotification({
                recipientId: userId,
                type: 'chat_warning',
                message: `You have received a warning for chat conduct. Reason: ${reason || 'Violation of community guidelines'}`,
                link: '/dashboard',
                channels: ['in-app']
            });

            io.to(`user_${userId}`).emit('userWarned', {
                reason: reason || 'Violation of community guidelines',
                warnings: user.warnings
            });

            socket.emit('moderationSuccess', `User warned. Total warnings: ${user.warnings}`);
        } catch (error) {
            console.error('Error warning user:', error);
            socket.emit('moderationError', error.message);
        }
    });

    socket.on('adminSuspendUser', async (payload) => {
        try {
            if (!isStaffRole(socket.user.role)) {
                return socket.emit('moderationError', 'Unauthorized: Only admins and moderators can suspend users');
            }

            const { userId, messageId, reason } = payload;
            const user = await User.findById(userId);

            if (!user) {
                return socket.emit('moderationError', 'User not found');
            }

            user.isSuspended = true;
            if (!user.suspensionReasons) {
                user.suspensionReasons = [];
            }
            user.suspensionReasons.push({
                reason: reason || 'Violation of chat guidelines',
                suspendedBy: socket.user._id,
                date: new Date()
            });
            await user.save();

            await NotificationService.sendNotification({
                recipientId: userId,
                type: 'account_suspended',
                message: `Your account has been suspended for: ${reason || 'Violation of community guidelines'}.`,
                link: '/support',
                channels: ['in-app']
            });

            io.to(`user_${userId}`).emit('accountSuspended', {
                reason: reason || 'Violation of community guidelines'
            });

            socket.emit('moderationSuccess', 'User suspended successfully');
        } catch (error) {
            console.error('Error suspending user:', error);
            socket.emit('moderationError', error.message);
        }
    });

    socket.on('adminDeleteComment', async (payload) => {
        try {
            if (!isStaffRole(socket.user.role)) {
                return socket.emit('podcastModerationError', 'Unauthorized: Only admins and moderators can delete comments');
            }

            const PodcastComment = require('../models/PodcastComment');
            const { commentId, podcastId } = payload;
            
            const comment = await PodcastComment.findByIdAndDelete(commentId);
            if (!comment) {
                return socket.emit('podcastModerationError', 'Comment not found');
            }

            io.to(`podcast_${podcastId}`).emit('commentDeleted', {
                commentId,
                podcastId,
                deletedAt: new Date()
            });

            socket.emit('podcastModerationSuccess', 'Comment deleted successfully');
        } catch (error) {
            console.error('Error deleting comment:', error);
            socket.emit('podcastModerationError', error.message);
        }
    });

    socket.on('adminWarnPodcastUser', async (payload) => {
        try {
            if (!isStaffRole(socket.user.role)) {
                return socket.emit('podcastModerationError', 'Unauthorized: Only admins and moderators can warn users');
            }

            const { userId, commentId, reason } = payload;
            const user = await User.findById(userId);

            if (!user) {
                return socket.emit('podcastModerationError', 'User not found');
            }

            if (!user.warnings) {
                user.warnings = 0;
            }
            user.warnings += 1;
            await user.save();

            await NotificationService.sendNotification({
                recipientId: userId,
                type: 'podcast_warning',
                message: `You have received a warning for podcast comment conduct. Reason: ${reason || 'Violation of community guidelines'}`,
                link: '/dashboard',
                channels: ['in-app']
            });

            io.to(`user_${userId}`).emit('userWarned', {
                reason: reason || 'Violation of community guidelines',
                warnings: user.warnings
            });

            socket.emit('podcastModerationSuccess', `User warned. Total warnings: ${user.warnings}`);
        } catch (error) {
            console.error('Error warning user:', error);
            socket.emit('podcastModerationError', error.message);
        }
    });

    socket.on('adminSuspendPodcastUser', async (payload) => {
        try {
            if (!isStaffRole(socket.user.role)) {
                return socket.emit('podcastModerationError', 'Unauthorized: Only admins and moderators can suspend users');
            }

            const { userId, commentId, reason } = payload;
            const user = await User.findById(userId);

            if (!user) {
                return socket.emit('podcastModerationError', 'User not found');
            }

            user.isSuspended = true;
            if (!user.suspensionReasons) {
                user.suspensionReasons = [];
            }
            user.suspensionReasons.push({
                reason: reason || 'Violation of podcast guidelines',
                suspendedBy: socket.user._id,
                date: new Date()
            });
            await user.save();

            await NotificationService.sendNotification({
                recipientId: userId,
                type: 'account_suspended',
                message: `Your account has been suspended for: ${reason || 'Violation of community guidelines'}.`,
                link: '/support',
                channels: ['in-app']
            });

            io.to(`user_${userId}`).emit('accountSuspended', {
                reason: reason || 'Violation of community guidelines'
            });

            socket.emit('podcastModerationSuccess', 'User suspended successfully');
        } catch (error) {
            console.error('Error suspending user:', error);
            socket.emit('podcastModerationError', error.message);
        }
    });
    socket.on('disconnect', async () => {
        const sessionRaw = await redisClient.get(`socket:session:${socket.id}`);
        if (sessionRaw) {
            const session = JSON.parse(sessionRaw);
            if (session.role === 'client' && session.sessionId) {
                try {
                    await ClientAnonymousSession.findByIdAndUpdate(session.sessionId, { isActive: false });
                } catch (err) {
                    console.error('Error terminating session in DB on disconnect:', err);
                }
            }
        }
        await redisClient.del(`socket:session:${socket.id}`);
    });
    socket.on('error', async (error) => {
        console.error(`Socket error for ${socket.id}:`, error.message);
        await redisClient.del(`socket:session:${socket.id}`);
        });
    });

    return io;
};
module.exports = initSocket;
