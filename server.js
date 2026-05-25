const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const cron = require('node-cron');
const http = require('http');
const {Server} = require('socket.io');
const {v4: uuidv4 } = require('uuid');
require('dotenv').config();

const User = require('./models/User');
const MentorApplication = require('./models/MentorApplication');
const MentorProfile = require('./models/MentorProfile');
const Chatroom = require('./models/Chatroom');
const ChatMessage = require('./models/ChatMessage');
const ChatReport = require('./models/ChatReports');
const ClientAnonymousSession = require('./models/ClientAnonymousSession');
const Podcast = require('./models/Podcast');
const PodcastComment = require('./models/PodcastComment');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

app.use(cors());
app.use(express.json()); 

const authRoutes = require('./routes/authRoutes');
const profileRoutes = require('./routes/profileRoutes');
const chatRoutes = require('./routes/chatRoutes');
const podcastRoutes = require('./routes/podcastRoutes');

app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/podcasts', podcastRoutes);

app.get('/', (req, res) => {
    res.send("The MindComfort Backend is officially running!");
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
                senderId: socket.user._id,
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
            socket.emit('messageError', 'Failed to transmit message.');
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

cron.schedule('0 0 * * *', async () => {
    try {
        const fifteenDaysAgo = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000);
        const result = await User.deleteMany({ 
            isVerified: false, 
            createdAt: { $lt: fifteenDaysAgo } 
        });
        if (result.deletedCount > 0) {
            console.log(`[Cron] Cleaned up ${result.deletedCount} unverified users.`);
        }
    } catch (err) {
        console.error('[Cron Error] OTP Cleanup:', err.message);
    }
});

cron.schedule('0 1 * * *', async () => {
    try {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        
        const rejectedUsers = await User.find({ 
            role: 'mentor',
            status: 'rejected', 
            updatedAt: { $lt: thirtyDaysAgo },
            isBlacklisted: false
        });

        for (let user of rejectedUsers) {
            await MentorApplication.deleteMany({ mentorId: user._id });
            user.isBlacklisted = true;
            user.username = "Eradicated_User";
            user.otp = undefined;
            await user.save();
        }
        if (rejectedUsers.length > 0) {
            console.log(`[Cron] Eradicated ${rejectedUsers.length} rejected profiles.`);
        }
    } catch (err) {
        console.error('[Cron Error] Eradication Job:', err.message);
    }
});

cron.schedule('0 2 * * *', async () => {
    try {
        const oneMonthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const result = await User.updateMany(
            { lastActive: { $lt: oneMonthAgo } },
            { $inc: { tokenVersion: 1 } }
        );
        if (result.modifiedCount > 0) {
            console.log(`[Cron] Logged out ${result.modifiedCount} inactive users.`);
        }
    } catch (err) {
        console.error('[Cron Error] Auto-Logout Job:', err.message);
    }
});

const PORT = process.env.PORT || 5000;

mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        console.log('MongoDB Connected Successfully');
        server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
    })
    .catch(err => {
        console.log('Database connection error:', err.message);
    });