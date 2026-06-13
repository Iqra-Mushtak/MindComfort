const jwt = require('jsonwebtoken');
const {Server} = require('socket.io');
const {v4: uuidv4 } = require('uuid');
const mongoose = require('mongoose');
const redisClient = require('../config/redis');

const Chatroom = require('../models/Chatroom');
const ChatMessage = require('../models/ChatMessage');
const ClientAnonymousSession = require('../models/ClientAnonymousSession');
const User = require('../models/User');

const initSocket = (server) => {
const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST'],
        credentials: true
    }
});

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

            console.log("DEBUG: Raw data extracted:", typeof rawData, JSON.stringify(rawData));

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
        console.log("DEBUG: Extracted chatroomId:", chatroomId);

        if (!mongoose.Types.ObjectId.isValid(chatroomId)) {
            console.log("DEBUG: Invalid ID");
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
            console.log("DEBUG: Chatroom found:", !!chatroom);
            if (!chatroom || !chatroom.isActive) {
            console.log("DEBUG: Chatroom inactive or not found");
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
                    return callback({ status: 'error', message: 'Your account is currently inactive or suspended. Please contact support for assistance.' });
                }
                return socket.emit('joinError', 'Your account is currently inactive or suspended. Please contact support for assistance.');
            }
            if (!chatroom.allowedRoles.includes(socket.user.role)) {
                if (typeof callback === 'function') {
                    return callback({ status: 'error', message: 'You do not have permission to join this chatroom' });
                }
                return socket.emit('joinError', 'You do not have permission to join this chatroom');
            }

            let dbSessionId = null;
            let displayIdentity = "";
                
            if (socket.user.role === 'client') {
                const secureUuid = uuidv4();
                const anonymousSession = new ClientAnonymousSession({
                    userId: socket.user._id,
                    chatroomId: chatroomId,
                    onModel: 'Chatroom',
                    anonymousId: secureUuid,
                });
                await anonymousSession.save();
                dbSessionId = anonymousSession._id;
                displayIdentity = secureUuid;
            } else {
                displayIdentity = `${socket.user.fullName || socket.user.username} (Mentor)`;
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
            console.log("DEBUG: Session saved to Redis for socket:", socket.id);
            socket.join(chatroomId);

            const messages = await ChatMessage.find({ chatroomId , isDeleted: false })
            .sort({ createdAt: 1 })
            .limit(200)
            .select('-senderId');

            const joinedData = {
                status: 'success',
                chatroomId,
                anonymousId: displayIdentity,
                sessionId: dbSessionId,
                messages,
            };

            socket.emit('joinedRoom', joinedData);
            sendJoinAck(joinedData);

            socket.to(chatroomId).emit('userJoined', {
                anonymousId: displayIdentity,
                role: socket.user.role,
            });
        } catch (error) {
            console.error("DEBUG: Auth failed:", error.message);
            console.error("DEBUG: Join Room Error:", error);
            sendJoinAck({ status: 'error', message: 'An error occurred while joining the chatroom' });
        }
    });

    socket.on('sendMessage', async (...args) => {
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
            console.log(`DEBUG: Session verification failed for socket ${socket.id}`);
            console.log('DEBUG: sessionRaw=', sessionRaw, 'payload=', JSON.stringify(rawPayload));
            return socket.emit('messageError', 'Connection reference match failed.');
        }

        if (!content || !content.toString().trim()) {
            console.log(`DEBUG: Missing message content for socket ${socket.id}`, JSON.stringify(rawPayload));
            return socket.emit('messageError', 'Message content is required.');
        }

        try {
            const message = new ChatMessage({
                chatroomId,
                senderId: session.userId,
                sessionId: session.sessionId,
                anonymousId: session.anonymousId,
                content: content.toString().trim(),
                replyTo
            });
            await message.save();

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

            const dynamicPayload = {
                _id: message._id,
                chatroomId: message.chatroomId,
                sessionId: message.sessionId,
                anonymousId: message.anonymousId,
                content: message.content,
                replyTo: message.replyTo,
                createdAt: message.createdAt
            };

            io.to(chatroomId).emit('newMessage', dynamicPayload);
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
            await redisClient.del(`socket:session:${socket.id}`);
        }
    });

    socket.on('joinPodcastRoom', (podcastId) => {
        socket.join(`podcast_${podcastId}`);
        console.log(`Mentor ${socket.user._id} joined podcast room: podcast_${podcastId}`);
    });
    socket.on('disconnect', async () => {
        await redisClient.del(`socket:session:${socket.id}`);
    });
    socket.on('error', async (error) => {
        console.error(`Socket error for ${socket.id}:`, error.message);
        await redisClient.del(`socket:session:${socket.id}`);
        });
    });
};
module.exports = initSocket;
