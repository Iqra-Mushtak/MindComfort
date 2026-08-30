const User = require('../models/User');
const MentorProfile = require('../models/MentorProfile');
const MentorApplication = require('../models/MentorApplication');
const mongoose = require('mongoose'); 

exports.getAllMentors = async (req, res) => {
    try {
        const { search, status, page = 1, limit = 20 } = req.query;
        let filter = { role: 'mentor' };

        if (search) {
            if (mongoose.Types.ObjectId.isValid(search) && search.length === 24) {
                filter.$or = [
                    { username: { $regex: search, $options: 'i' } },
                    { email: { $regex: search, $options: 'i' } },
                    { _id: search } 
                ];
            } else {
                filter.$or = [
                    { username: { $regex: search, $options: 'i' } },
                    { email: { $regex: search, $options: 'i' } }
                ];
            }
        }

        if (status === 'active') {
            filter.isSuspended = false;
        } else if (status === 'suspended') {
            filter.isSuspended = true;
        }

        const skip = (page - 1) * limit;
        
        const mentorsList = await User.find(filter)
            .select('-password -otp')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit));

        const total = await User.countDocuments(filter);

        const formattedMentors = await Promise.all(
            mentorsList.map(async (mentorDoc) => {
                const mentor = mentorDoc.toObject();
                const application = await MentorApplication.findOne({ mentorId: mentor._id });
                
                if (!application) {
                    mentor.status = 'not_submitted';
                } else {
                    mentor.status = application.status;
                }
                return mentor;
            })
        );

        res.status(200).json({
            total,
            page: parseInt(page),
            limit: parseInt(limit),
            pages: Math.ceil(total / limit),
            mentors: formattedMentors
        });
    } catch (error) {
        console.error("Error in getAllMentors:", error);
        res.status(500).json({ message: 'Error fetching mentors', error: error.message });
    }
};

exports.getMentorDetails = async (req, res) => {
    try {
        const { mentorId } = req.params;

        const mentor = await User.findById(mentorId).select('-password -otp');
        if (!mentor || mentor.role !== 'mentor') {
            return res.status(404).json({ message: 'Mentor not found' });
        }

        const profile = await MentorProfile.findOne({ mentorId: mentorId }).select('-__v');

        const application = await MentorApplication.findOne({ mentorId: mentorId }).select('-__v');

        res.status(200).json({ 
            mentor, 
            profile,
            application
        });
    } catch (error) {
        console.error("Error in getMentorDetails:", error);
        res.status(500).json({ message: 'Error fetching mentor details', error: error.message });
    }
};

exports.getPendingApplications = async (req, res) => {
    try {
        const { search, page = 1, limit = 20 } = req.query;
        let filter = { status: 'pending' };

        if (search) {
            filter.$or = [
                { 'mentorId.username': { $regex: search, $options: 'i' } },
                { fullName: { $regex: search, $options: 'i' } }
            ];
        }

        const skip = (page - 1) * limit;
        const applications = await MentorApplication.find(filter)
            .populate('mentorId', 'username email fullName')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit));

        const total = await MentorApplication.countDocuments(filter);

        res.status(200).json({
            total,
            page: parseInt(page),
            limit: parseInt(limit),
            pages: Math.ceil(total / limit),
            applications
        });
    } catch (error) {
        console.error("Error in getPendingApplications:", error);
        res.status(500).json({ message: 'Error fetching applications', error: error.message });
    }
};

exports.approveMentorApplication = async (req, res) => {
    try {
        const { applicationId } = req.params;

        const application = await MentorApplication.findById(applicationId);
        
        if (!application) {
            return res.status(404).json({ message: 'Application not found' });
        }

        const mentorUserId = application.mentorId;
        await User.findByIdAndUpdate(mentorUserId, {
            role: 'mentor',
            status: 'approved',
        });

        application.status = 'approved';
        await application.save();

        await application.populate('mentorId', 'username email fullName');

        res.status(200).json({ message: 'Mentor approved successfully', application });
    } catch (error) {
        console.error("Error in approveMentorApplication:", error);
        res.status(500).json({ message: 'Error approving mentor', error: error.message });
    }
};

exports.rejectMentorApplication = async (req, res) => {
    try {
        const { applicationId } = req.params;
        const { reason } = req.body;

        const application = await MentorApplication.findById(applicationId);
        
        if (!application) {
            return res.status(404).json({ message: 'Application not found' });
        }

        const mentorUserId = application.mentorId;
        await User.findByIdAndUpdate(mentorUserId, { status: 'rejected', isBlacklisted: true });

        application.status = 'rejected';
        await application.save();

        await application.populate('mentorId', 'username email fullName');

        res.status(200).json({ message: 'Mentor rejected successfully', application });
    } catch (error) {
        console.error("Error in rejectMentorApplication:", error);
        res.status(500).json({ message: 'Error rejecting mentor', error: error.message });
    }
};

exports.suspendMentor = async (req, res) => {
    try {
        const { mentorId } = req.params;

        const mentor = await User.findByIdAndUpdate(
            mentorId,
            { isSuspended: true },
            { returnDocument: 'after' }
        ).select('-password -otp');

        if (!mentor) {
            return res.status(404).json({ message: 'Mentor not found' });
        }

        res.status(200).json({ message: 'Mentor suspended successfully', mentor });
    } catch (error) {
        console.error("Error in suspendMentor:", error);
        res.status(500).json({ message: 'Error suspending mentor', error: error.message });
    }
};

exports.unsuspendMentor = async (req, res) => {
    try {
        const { mentorId } = req.params;

        const mentor = await User.findByIdAndUpdate(
            mentorId,
            { isSuspended: false },
            { returnDocument: 'after' }
        ).select('-password -otp');

        if (!mentor) {
            return res.status(404).json({ message: 'Mentor not found' });
        }

        res.status(200).json({ message: 'Mentor unsuspended successfully', mentor });
    } catch (error) {
        console.error("Error in unsuspendMentor:", error);
        res.status(500).json({ message: 'Error unsuspending mentor', error: error.message });
    }
};

exports.getMentorStats = async (req, res) => {
    try {
        const stats = {
            totalMentors: await User.countDocuments({ role: 'mentor' }),
            activeMentors: await User.countDocuments({ role: 'mentor', isSuspended: false }),
            suspendedMentors: await User.countDocuments({ role: 'mentor', isSuspended: true }),
            pendingApplications: await MentorApplication.countDocuments({ status: 'pending' })
        };

        res.status(200).json({ stats });
    } catch (error) {
        console.error("Error in getMentorStats:", error);
        res.status(500).json({ message: 'Error fetching mentor stats', error: error.message });
    }
};

const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');

const s3Client = new S3Client({
  endpoint: process.env.B2_ENDPOINT,
  region: process.env.B2_REGION,
  credentials: {
    accessKeyId: process.env.B2_APPLICATION_KEY_ID,
    secretAccessKey: process.env.B2_APPLICATION_KEY,
  },
});

exports.getMentorDocumentProxy = async (req, res) => {
  try {
    const rawKey = req.query.key;
    if (!rawKey) {
      return res.status(400).json({ message: "Document key is required." });
    }

    const fileKey = rawKey.includes('file/documents-uploads/')
      ? rawKey.split('file/documents-uploads/')[1]
      : rawKey;

    const targetBucket = process.env.BACKBLAZE_DOCUMENTS_BUCKET_NAME || 'documents-uploads';

    const command = new GetObjectCommand({
      Bucket: targetBucket,
      Key: fileKey,
    });

    const response = await s3Client.send(command);

    res.setHeader('Content-Type', response.ContentType || 'application/pdf');
    res.setHeader('Content-Disposition', 'inline');

    response.Body.pipe(res);
  } catch (error) {
    console.error("Document proxy error:", error);
    res.status(500).json({ message: "Failed to stream document", error: error.message });
  }
};