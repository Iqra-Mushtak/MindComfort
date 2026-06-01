const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const cron = require('node-cron');
const http = require('http');
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
const initSocket = require('./utils/socketHandler');
const io = initSocket(server);

app.set('io', io)

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