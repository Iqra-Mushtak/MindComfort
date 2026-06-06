const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const cron = require('node-cron');
const http = require('http');
const {v4: uuidv4 } = require('uuid');
require('dotenv').config();
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

const app = express();
const server = http.createServer(app);
const initSocket = require('./utils/socketHandler');
const io = initSocket(server);

app.set('io', io)

app.use(cors({
    origin: process.env.CLIENT_URL || 'http://localhost:3000',
    credentials: true
}));
app.use(express.json()); 
app.use(sanitize); 

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

app.use((err, req, res, next) => {
    console.error(err.stack); 
    res.status(500).json({ message: 'An internal error occurred.' }); 
});

cron.schedule('0 * * * *', async () => {
    console.log(`Cleaning up stale live podcast sessions}`);
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