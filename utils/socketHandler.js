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
    socket.on('joinRoom', async ({ chatroomId }) => {
        if (!mongoose.Types.ObjectId.isValid(chatroomId)) {
            return socket.emit('joinError', 'Invalid chatroom ID');
        }
        try {
            const previousSessionRaw = await redisClient.get(`socket:session:${socket.id}`);
            if (previousSessionRaw) {
                const previousSession = JSON.parse(previousSessionRaw);
                socket.leave(previousSession.chatroomId);
            }
            const chatroom = await Chatroom.findById(chatroomId);
            if (!chatroom || !chatroom.isActive) {
            return socket.emit('joinError', 'Chatroom not found or is currently inactive');
            }
            if (socket.user.role === 'client' && !socket.user.isSubscribed) {
                return socket.emit('joinError', 'Premium subscription required');
            }
            if(socket.user.role === 'mentor' && (!socket.user.isActive || socket.user.isSuspended)) {
                return socket.emit('joinError', 'Your account is currently inactive or suspended. Please contact support for assistance.');
            }
            if (!chatroom.allowedRoles.includes(socket.user.role)) {
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
            };
            await redisClient.setEx(`socket:session:${socket.id}`, 3600, JSON.stringify(sessionData));
            socket.join(chatroomId);

            const messages = await ChatMessage.find({ chatroomId , isDeleted: false })
            .sort({ createdAt: 1 })
            .limit(200)
            .select('-senderId');

            socket.emit('joinedRoom', {
                chatroomId,
                anonymousId: displayIdentity,
                sessionId: dbSessionId,
                messages,
            });

            socket.to(chatroomId).emit('userJoined', {
                anonymousId: displayIdentity,
                role: socket.user.role,
            });
        } catch (error) {
            socket.emit('joinError', 'An error occurred while joining the chatroom');
        }
    });

    socket.on('sendMessage', async ({ chatroomId, content, replyTo }) => {
        const sessionRaw = await redisClient.get(`socket:session:${socket.id}`);
        const session = sessionRaw ? JSON.parse(sessionRaw) : null;
        if (!session || session.chatroomId !== chatroomId) {
            return socket.emit('messageError', 'Connection reference match failed.');
        }

        try {
            const message = new ChatMessage({
                chatroomId,
                senderId: session.userId,
                sessionId: session.sessionId,
                anonymousId: session.anonymousId,
                content: content.trim(),
                replyTo
            });
            await message.save();
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
