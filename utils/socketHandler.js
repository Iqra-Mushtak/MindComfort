const {Server} = require('socket.io');
const {v4: uuidv4 } = require('uuid');
const mongoose = require('mongoose');

const Chatroom = require('./models/Chatroom');
const chatMessage = require('./models/ChatMessage');
const ClientAnonymousSession = require('./models/ClientAnonymousSession');

const initSocket = (server) => {
const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

const activeSessions = new Map();
io.use((socket, next) => {
    socket.user = {
        _id : new mongoose.Types.ObjectId(),
        role: 'client',
        isSubscribed: true,
        isActive: true,
        isSuspended: false,
    };
    next();
});

io.on('connection', (socket) => {
    socket.on('joinRoom', async ({ chatroomId }) => {
        try {
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
                    anonymousId: secureUuid,
                });
                await anonymousSession.save();
                dbSessionId = anonymousSession._id;
                displayIdentity = secureUuid;
            } else {
                displayIdentity = `${socket.user.fullName || socket.user.username} (Mentor)`;
            }

            activeSessions.set(socket.id, {
                userId: socket.user._id.toString(),
                chatroomId,
                sessionId: dbSessionId,
                anonymousId: displayIdentity,
                role: socket.user.role,
            });
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
        const session = activeSessions.get(socket.id);
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

    socket.on('leaveRoom', () => {
        const session = activeSessions.get(socket.id);
        if (session) {
            socket.leave(session.chatroomId);
            activeSessions.delete(socket.id);
        }
    });

    socket.on('disconnect', () => {
        activeSessions.delete(socket.id);
    });
});
return io;
};

module.exports = initSocket;
