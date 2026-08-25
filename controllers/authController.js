const User = require("../models/User");
const passwordSchema = require('../utils/passwordValidator');
const bcrypt = require("bcryptjs");
const sendEmail = require("../utils/sendEmail");
const MentorApplication = require("../models/MentorApplication");
const NotificationService = require('../Services/NotificationService');
const MentorProfile = require("../models/MentorProfile");
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { uploadToB2, getB2FileUrl } = require('../config/b2');

exports.createAdmin = async (req, res) => {
  try {
    const { username, email, password } = req.body;

    const adminExists = await User.findOne({ role: "admin" });
    if (adminExists) {
      return res.status(400).json({ message: "Admin account already exists." });
    }

    const validationErrors = passwordSchema.validate(password, { list: true });

    if (validationErrors.length > 0) {
      return res.status(400).json({ 
        message: "Password is too weak.", 
        failedRules: validationErrors 
      });
    }
    const hashedPassword = await bcrypt.hash(password, 10);

    const otp = crypto.randomInt(100000, 999999).toString();
    const otpHash = await bcrypt.hash(otp, 10);
    const otpExpires = Date.now() + 10 * 60 * 1000;

    const admin = new User({
      username,
      email,
      password: hashedPassword,
      role: "admin",
      isVerified: false,
      status: "approved",
      otp: otpHash,
      otpExpires
    });
      await admin.save();
    try {
      await sendEmail({
        email: admin.email,
        subject: "Admin Account Setup Verification Code",
        message: `Your admin verification code is: ${otp}. Expires in 10 minutes.`,
      });

      res.status(201).json({ 
        message: "Admin account initialized. Please check your email for the verification code." });
    } catch (emailError) {
      return res.status(500).json({ 
        message: "Failed to send verification email. Admin not created." });
    }
  } catch (error) {
    res
      .status(500)
      .json({ message: "Admin creation failed.", error: error.message });
  }
};

exports.createModerator = async (req, res) => {
  try {
    const { username, email, password } = req.body;

    const userExists = await User.findOne({ email });
    if (userExists)
      return res.status(400).json({ message: "Email already exists." });

    const validationErrors = passwordSchema.validate(password, { list: true });

    if (validationErrors.length > 0) {
      return res.status(400).json({ 
        message: "Password is too weak.", 
        failedRules: validationErrors 
      });
    }
    const hashedPassword = await bcrypt.hash(password, 10);

    const moderator = new User({
      username,
      email,
      password: hashedPassword,
      role: "moderator",
      isVerified: true,
      status: "approved",
    });

    await moderator.save();
    res
      .status(201)
      .json({ message: "Moderator account created successfully." });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Moderator creation failed.", error: error.message });
  }
};

exports.register = async (req, res) => {
  try {
    const { username, email, password, role } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      if (existingUser.role === 'mentor' && existingUser.status === 'pending') {
        return res.status(400).json({ 
          message: "Account already exists. Please log in or complete your mentor application.",
          status: 'mentor_pending_application',
          email: existingUser.email
        });
      }
      return res.status(400).json({ message: "Email already registered. Please log in." });
    }
    const existingUsername = await User.findOne({ username });
    if (existingUsername) {
      return res.status(400).json({ message: "Username is already taken." });
    }

    let assignedRole = 'client';
    if (role === 'mentor') {
      assignedRole = 'mentor';
    } else if (role && role !== 'client') {
      return res.status(400).json({ message: "Invalid role specified." });
    }
    const otp = crypto.randomInt(100000, 999999).toString();
    const otpHash = await bcrypt.hash(otp, 10);
    const otpExpires = Date.now() + 10 * 60 * 1000;

    const validationErrors = passwordSchema.validate(password, { list: true });

    if (validationErrors.length > 0) {
      return res.status(400).json({ 
        message: "Password is too weak.", 
        failedRules: validationErrors 
      });
    }
    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new User({
      username,
      email,
      password: hashedPassword,
      role: assignedRole,
      otp: otpHash,
      otpExpires,
    });

    await newUser.save();
    try {
      await sendEmail({
        email: newUser.email,
        subject: "Your MindComfort Verification Code",
        message: `Welcome to MindComfort! Your verification code is: ${otp}. It expires in 10 minutes.`,
      });

      res.status(201).json({
        message: "OTP sent to email. Please verify your account.",
      });
    } catch (emailError) {
      return res.status(500).json({
        message: "User saved but email failed.",
        error: emailError.message,
      });
    }
  } catch (error) {
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};
exports.verifyRegisterOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;
    const normalizedEmail = email?.toLowerCase();

    const user = await User.findOne({ email: normalizedEmail }).select('+otp');

    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    if (!user.otpExpires || Date.now() > user.otpExpires) {
      return res.status(400).json({ message: "OTP has expired." });
    }

    const isMatch = await bcrypt.compare(otp, user.otp);
    if (!isMatch) {
      return res.status(400).json({message: "Invalid OTP."})
    }

    user.isVerified = true;
    user.otp = undefined;
    user.otpExpires = undefined;
    await user.save();

    const token = jwt.sign(
      { id: user._id, role: user.role, tokenVersion: user.tokenVersion },
      process.env.JWT_SECRET
    );

    let customMessage = "Email verified successfully!";

    if (user.role === "mentor") {
      customMessage +=
        " Please complete your application to proceed for admin review.";
    } else {
      customMessage += " You can now login.";
    }

    res
      .status(201)
      .json({ message: customMessage, role: user.role, id: user._id, token });
  } catch (error) {
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

exports.resendOTP = async (req, res) => {
  try {
    const { email } = req.body;
    const normalizedEmail = email?.toLowerCase();

    const user = await User.findOne({ email: normalizedEmail });

    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    if (user.isVerified) {
      if (user.role === 'mentor' && user.status === 'pending') {
        return res.status(400).json({ 
          message: "Account already verified. Submit application for admin review." 
        });
      }
      return res.status(400).json({ message: "Account already verified. You can login." });
    }

    const otp = crypto.randomInt(100000, 999999).toString();
    const otpHash = await bcrypt.hash(otp,10);
    const otpExpires = Date.now() + 10 * 60 * 1000;

    user.otp = otpHash;
    user.otpExpires = otpExpires;
    await user.save();

    try {
      await sendEmail({
        email: user.email,
        subject: "Your New MindComfort Verification Code",
        message: `Your new verification code is: ${otp}. It expires in 10 minutes.`,
      });

      res.status(200).json({
        message: "A new OTP has been sent to your email.",
      });
    } catch (emailError) {
      return res.status(500).json({
        message: "OTP generated in system, but email failed to send.",
        error: emailError.message,
      });
    }
  } catch (error) {
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

exports.submitMentorApplication = async (req, res) => {
  try {
    const {
      fullName,
      qualification,
      qualificationOther,
      experience,
      expertise,
      declaration,
    } = req.body;

    const coverLetterText = typeof req.body.coverLetterText === 'string' ? req.body.coverLetterText : '';
    const user = req.user; 

    if (user.role === 'mentor' && user.status === 'approved') {
      return res.status(400).json({ message: "Your account is already an approved mentor account." });
    }

    if (user.isBlacklisted) {
      return res.status(403).json({ message: "You are ineligible to apply." });
    }
    
    const existingApplication = await MentorApplication.findOne({ 
      mentorId: user._id, 
      status: 'pending' 
    });
    if (existingApplication) {
      return res.status(400).json({ message: "You already have a pending application. Please wait for admin review." });
    }

    if (!req.file) {
      return res.status(400).json({ message: 'Required document file missing.' });
    }

    if (!declaration || declaration === 'false' || declaration === false) {
      return res.status(400).json({ message: "You must agree to the declaration to submit your application." });
    }

    let qualifications = [];
    if (Array.isArray(qualification)) {
      qualifications = qualification;
    } else if (typeof qualification === 'string' && qualification.length) {
      try {
        const parsed = JSON.parse(qualification);
        if (Array.isArray(parsed)) qualifications = parsed;
        else qualifications = [qualification];
      } catch (e) {
        qualifications = [qualification];
      }
    }

    if (qualifications.length === 0 && !qualificationOther) {
      return res.status(400).json({ message: 'You must provide at least one qualification.' });
    }

    const coverLetterWordCount = coverLetterText.trim().split(/\s+/).filter(Boolean).length;
    if (coverLetterWordCount > 4000) {
      return res.status(400).json({ message: 'Cover letter should not exceed 4000 words.' });
    }

    const targetBucket = process.env.BACKBLAZE_DOCUMENTS_BUCKET_NAME || 'documents-uploads';
    if (!req.file) {
      return res.status(400).json({ message: 'Document file is required.' });
    }

    const documentKey = `mentor-documents/${user._id}-${Date.now()}-${req.file.originalname}`;
    await uploadToB2(documentKey, req.file.buffer, req.file.mimetype, targetBucket);
    const documentUrl = getB2FileUrl(documentKey, targetBucket);

    const application = new MentorApplication({
      mentorId: user._id,
      fullName,
      qualification: qualifications,
      qualificationOther: qualificationOther || '',
      experience,
      expertise: Array.isArray(expertise) ? expertise : (typeof expertise === 'string' ? expertise.split(',').map(e => e.trim()) : []),
      documents: {
        document: documentUrl,
        coverLetter: coverLetterText.trim() ? coverLetterText.trim() : undefined,
      },
      declaration,
      status: "pending",
    });
    user.role = 'mentor';
    user.status = 'pending';
    await user.save();

    await application.save();

    const admins = await User.find({ role: 'admin' }).select('_id');
    if (admins.length > 0) {
      const adminIds = admins.map(admin => admin._id);
      await NotificationService.sendBulkNotifications({
        recipientIds: adminIds,
        type: 'mentor_application_submitted',
        message: `New mentor application from ${fullName}. Expertise: ${Array.isArray(expertise) ? expertise.join(', ') : expertise}`,
        link: `/admin/mentor-applications/${application._id}`,
        channels: ['in-app']
      });
    }

    res.status(201).json({
      message: "Application submitted successfully! Your application is now pending Admin review.",
    });
  } catch (error) {
    res.status(500).json({ message: "Error submitting application", error: error.message });
  }
};

exports.adminReviewMentor = async (req, res) => {
  try {
    const { mentorId, decision, reason } = req.body;
    if (!["approved", "rejected"].includes(decision)) {
      return res.status(400).json({
        message: "Invalid decision. Must be 'approved' or 'rejected'.",
      });
    }

    const mentor = await User.findById(mentorId);
    if (!mentor)
      return res.status(404).json({ message: "Mentor user not found" });

    if (decision === 'approved') {
      mentor.role = 'mentor';
      mentor.status = 'approved';
    } else {
      mentor.status = 'rejected';
    }
    
    await mentor.save();

    const mentorApplication = await MentorApplication.findOne({ mentorId, status: 'pending' });

    if (decision === "approved" && mentorApplication) {
    const existingProfile = await MentorProfile.findOne({ mentorId });
    if (!existingProfile) {
      const newMentorProfile = new MentorProfile({
        mentorId: mentor._id,
        fullName: mentorApplication.fullName,
        qualification: Array.isArray(mentorApplication.qualification) ? mentorApplication.qualification.join(', ') : mentorApplication.qualification,
        experience: mentorApplication.experience,
        expertise: Array.isArray(mentorApplication.expertise) ? mentorApplication.expertise.join(', ') : mentorApplication.expertise,
      });
      await newMentorProfile.save();
    } 
  }
       if (mentorApplication){
        mentorApplication.status = decision;
        await mentorApplication.save();
      } else {
        await MentorApplication.updateMany(
          { mentorId },
          { status: decision }
        );
      }

    const subject =
      decision === "approved"
        ? "Welcome to MindComfort! Your Profile is Live."
        : "Update on your MindComfort Application";

    const htmlContent =
      decision === "approved"
        ? `<h2>Congratulations, ${mentor.username}!</h2>
         <p>After the interview, we are excited to approve your profile.</p>
         <p>You can now log in and start your practice.</p>
         <p>Regards</p>
         <p>Team MindComfort</p>`
        : `<h2>Application Update</h2>
         <p>Hi ${mentor.username},</p>
          <p>Thank you for your interest in joining MindComfort as a mentor.</p>
          <p>After a careful review of your application, we regret to inform you that we are not moving forward with your profile at this time.</p>
          ${
            reason
              ? `<p><b>Reason:</b> ${reason}</p>
          <p>We wish you all the best in your future professional endeavors.</p>
          <p>Regards</p>
         <p>Team MindComfort</p>`
              : ""
          }`;

    await sendEmail({
      email: mentor.email,
      subject: subject,
      message: `Your application has been ${decision}.`,
      html: htmlContent,
    });

    await NotificationService.sendNotification({
      recipientId: mentor._id,
      type: decision === 'approved' ? 'mentor_approved' : 'mentor_rejected',
      message: decision === 'approved'
        ? 'Congratulations! Your mentor application has been approved.'
        : 'Your mentor application has been reviewed and rejected.',
      link: '/mentor/dashboard',
      channels: ['in-app']
    });

    res.status(200).json({
      message: `Mentor has been successfully ${decision}.`,
      status: mentor.status,
    });
  } catch (error) {
    console.error("DEBUG ERROR:", error);
    res.status(500).json({ message: "Admin review failed.", error: error.message });
  }
};

exports.getAllApplications = async (req, res) => {
  try {
    const applications = await MentorApplication.find()
      .populate('mentorId', 'username email status');

    res.status(200).json(applications);
  } catch (error) {
    console.error("DEBUG ERROR:", error);
    res.status(500).json({ message: "Failed to fetch applications", error: error.message });
  }
};

exports.getApplicationById = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "Invalid ID format. Please check the Application ID." });
    }
    const application = await MentorApplication.findById(req.params.id)
      .populate('mentorId', 'username email status');

    if (!application) return res.status(404).json({ message: "Application not found" });

    res.status(200).json(application);
  } catch (error) {
    console.error("DEBUG ERROR:", error);
    res.status(500).json({ message: "Error fetching application", error: error.message });
  }
};

exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = await User.findOne({ email }).select('+password');
        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(400).json({ message: "Invalid Email or Password" });
        }

        if (!user.isVerified) {
            return res.status(401).json({ message: "Please verify your email first." });
        }

        if (user.isBlacklisted) {
            return res.status(403).json({ message: "Your account has been blacklisted." });
        }
        
        if(user.isSuspended) {
            return res.status(403).json({ message: "Your account is currently suspended." });
        }

        if (user.role === 'mentor' && user.status !== 'approved') {
            const statusMsgs = {
                pending: "Your application is under review by the admin.",
                rejected: "Your application was not approved."
            };
            return res.status(403).json({ message: statusMsgs[user.status] || "Access Denied" });
        }

        const token = jwt.sign(
            { id: user._id, role: user.role, tokenVersion: user.tokenVersion },
            process.env.JWT_SECRET,
            { expiresIn: '365d' } 
        );

        res.status(200).json({
            message: "Login Successful!",
            token,
            user: {
                id: user._id,
                username: user.username,
                role: user.role,
                status: user.status,
                isSubscribed: user.isSubscribed,
                subscriptionStatus: user.isSubscribed ? 'active' : 'inactive'
            }
        });

        } catch (error) {
        res.status(500).json({ message: "Server Error", error: error.message });
    }
};

exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "User with this email does not exist." });
    }

    const otp = crypto.randomInt(100000, 999999).toString();
    const otpHash = await bcrypt.hash(otp, 10);
    const otpExpires = Date.now() + 10 * 60 * 1000;
    

    user.otp = otpHash;
    user.otpExpires = otpExpires;
    await user.save();

    try {
      await sendEmail({
        email: user.email,
        subject: "MindComfort Password Reset Code",
        message: `You requested a password reset. Your verification code is: ${otp}. It expires in 10 minutes.`,
      });

      res.status(200).json({ message: "OTP sent to email. Use it to verify your identity." });
    } catch (emailError) {
      return res.status(500).json({
        message: "Failed to send reset email.",
        error: emailError.message,
      });
    }
  } catch (error) {
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

exports.resendResetOTP = async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    const otp = crypto.randomInt(100000, 999999).toString();
    const otpHash = await bcrypt.hash(otp, 10);
    const otpExpires = Date.now() + 10 * 60 * 1000;

    user.otp = otpHash;
    user.otpExpires = otpExpires;
    await user.save();

    await sendEmail({
      email: user.email,
      subject: "MindComfort Password Reset Code (Resent)",
      message: `Your new verification code is: ${otp}. It expires in 10 minutes.`,
    });

    res.status(200).json({ message: "New OTP has been sent to your email." });
  } catch (error) {
    res.status(500).json({ message: "Error resending OTP", error: error.message });
  }
};

exports.verifyResetOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;

    const user = await User.findOne({ email }).select('+otp +otpExpires');

    if (!user) {
      return res.status(400).json({ message: "User not found." });
    }

    if (!user.otp) {
      return res.status(400).json({ message: "No active OTP found. Please request a new one." });
    }

    if (!user.otpExpires || Date.now() > user.otpExpires) {
      return res.status(400).json({ message: "OTP has expired." });
    }

    const isMatch = await bcrypt.compare(otp, user.otp);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid OTP code." });
    }
    const resetToken = jwt.sign(
      { id: user._id }, 
      process.env.JWT_SECRET, 
      { expiresIn: "10m" }
    );

    user.resetPasswordToken = resetToken;
    user.otp = undefined;
    user.otpExpires = undefined;
    await user.save();

    res.status(200).json({ 
      message: "OTP verified. You may now reset your password.", 
      resetToken 
    });

  } catch (error) {
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const { resetToken, newPassword, confirmPassword } = req.body;

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ message: "Passwords do not match." });
    }
    const decoded = jwt.verify(resetToken, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('+password');
    if (!user) return res.status(400).json({ message: "Invalid token." });

    const validationErrors = passwordSchema.validate(newPassword, { list: true });
    if (validationErrors.length > 0) {
      return res.status(400).json({ 
        message: "New password is too weak.", 
        failedRules: validationErrors 
      });
    }
    const isSameAsOld = await bcrypt.compare(newPassword, user.password);
    if (isSameAsOld) {
      return res.status(400).json({ message: "New password cannot be the same as the old one." });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    
    await user.save();

    res.status(200).json({ message: "Password updated successfully!" });
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: "Reset token has expired." });
    }
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

exports.logout = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('+tokenVersion');
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    user.tokenVersion += 1;
    await user.save();

    res.clearCookie('token');

    res.status(200).json({ message: "Logged out successfully" });
  } catch (error) {
    res.status(500).json({ message: "Logout failed", error: error.message });
  }
};