
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const cron = require('node-cron');
const http = require('http');
const path = require('path');
const fs = require('fs');
const {v4: uuidv4 } = require('uuid');
require('dotenv').config();
const redisClient = require('./config/redis');
const validateEnv = require('./utils/validateEnv');
validateEnv();

const User = require('./models/User');
const MentorApplication = require('./models/MentorApplication');
const MentorProfile = require('./models/MentorProfile');
const Chatroom = require('./models/Chatroom');
const ChatMessage = require('./models/ChatMessage');
const ChatReport = require('./models/ChatReports');
const ClientAnonymousSession = require('./models/ClientAnonymousSession');
const Podcast = require('./models/Podcast');
const PodcastComment = require('./models/PodcastComment');
const sanitize = require('./middleware/sanitize');
const Subscription = require('./models/Subscription');

const app = express();
const server = http.createServer(app);
const initSocket = require('./utils/socketHandler');
const io = initSocket(server);

app.set('io', io);
global.io = io;

const allowedOrigins = [
    process.env.CLIENT_URL,
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:5174',
    'http://127.0.0.1:5174',
    'http://0.0.0.0:5174'
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

app.use(cors({
    origin: (origin, callback) => {
        if (isAllowedOrigin(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true
}));

const webhookRoutes = require('./routes/webhookRoutes');
app.use('/api/webhooks', webhookRoutes);

app.use(express.json());
app.use(sanitize);

const uploadsPath = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsPath)) {
  fs.mkdirSync(uploadsPath, { recursive: true });
}
app.use('/uploads', express.static(uploadsPath));

const authRoutes = require('./routes/authRoutes');
const profileRoutes = require('./routes/profileRoutes');
const chatRoutes = require('./routes/chatRoutes');
const podcastRoutes = require('./routes/podcastRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const adminRoutes = require('./routes/adminRoutes');
const moderatorRoutes = require('./routes/moderatorRoutes');
const subscriptionRoutes = require('./routes/subscriptionRoutes');
const adminSubscriptionRoutes = require('./routes/adminSubscriptionRoutes');
const planRoutes = require('./routes/planRoutes');

app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/podcasts', podcastRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/plans', planRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/admin/subscriptions', adminSubscriptionRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/moderator', moderatorRoutes);

app.get('/', (req, res) => {
    res.send("The MindComfort Backend is officially running!");
});

app.use((err, req, res, next) => {
    console.error(err.stack); 
    res.status(500).json({ message: 'An internal error occurred.' }); 
});

cron.schedule('0 * * * *', async () => {
    console.log(`Cleaning up stale live podcast sessions`);
    try {
        const cutoff = new Date(Date.now() - 6 * 60 * 60 * 1000);

        const stalePodcasts = await Podcast.find({ 
            streamStatus: 'live', 
            updatedAt: { $lt: cutoff } 
        });
        for (const podcast of stalePodcasts) {
            podcast.streamStatus = 'ended';
            await podcast.save();
            console.log(`Ended stale podcast session: ${podcast._id}`);
        }
    } catch (err) {
        console.error('Error during stale podcast cleanup:', err.message);
    }
});

cron.schedule('0 0 * * *', async () => {
    await Subscription.updateMany(
        { endDate: { $lt: new Date() }, status: 'active' },
        { status: 'expired' }
    );
});

cron.schedule('0 0 * * *', async () => {
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
            user.username = `Eradicated_User_${user._id.toString().substring(0, 8)}`;
            user.email = `eradicated_${user._id.toString().substring(0, 8)}@mindcomfort.com`;
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

cron.schedule('0 1 * * *', async () => {
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