const User = require("../models/User");
const bcrypt = require("bcryptjs");
const sendEmail = require("../utils/sendEmail");
const MentorApplication = require("../models/MentorApplication");

exports.createAdmin = async (req, res) => {
  try {
    const { username, email, password } = req.body;

    const adminExists = await User.findOne({ role: "admin" });
    if (adminExists) {
      return res.status(400).json({ message: "Admin account already exists." });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const admin = new User({
      username,
      email,
      password: hashedPassword,
      role: "admin",
      isVerified: true,
      status: "approved",
    });

    await admin.save();
    res.status(201).json({ message: "Admin created successfully." });
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
      return res.status(400).json({ message: "User already exists." });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpires = Date.now() + 10 * 60 * 1000;

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new User({
      username,
      email,
      password: hashedPassword,
      role,
      otp,
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
        userId: newUser.userId,
      });
    } catch (emailError) {
      return res
        .status(500)
        .json({
          message: "User saved but email failed.",
          error: emailError.message,
        });
    }
  } catch (error) {
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};
exports.verifyOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    if (user.otp !== otp) {
      return res.status(400).json({ message: "Invalid OTP code." });
    }

    if (user.otpExpires < Date.now()) {
      return res.status(400).json({ message: "OTP has expired." });
    }

    user.isVerified = true;
    user.otp = undefined;
    user.otpExpires = undefined;
    await user.save();

    res
      .status(201)
      .json({ message: "Email verified successfully! You can now login." });
  } catch (error) {
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

exports.submitMentorApplication = async (req, res) => {
  try {
    const {
      mentorId,
      fullName,
      qualification,
      experience,
      expertise,
      documents,
      declaration,
    } = req.body;

    const Qualification = qualification?.toLowerCase().trim();

    const isEligible =
      Qualification === "masters in clinical psychology" ||
      Qualification === "adcp";

    if (!isEligible) {
      return res.status(400).json({
        message:
          "Eligibility Error: We only accept 'Masters in Clinical Psychology' or 'ADCP'.",
      });
    }

    if (!declaration) {
      return res
        .status(400)
        .json({ message: "You must agree to the declaration." });
    }
    const application = new MentorApplication({
      mentorId,
      fullName,
      qualification,
      experience,
      expertise,
      documents,
      declaration,
      status: "pending",
    });

    await application.save();

    res.status(201).json({
      message:
        "Application submitted successfully! Your account status is now 'Pending' for Admin review.",
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error submitting application", error: error.message });
  }
};
exports.adminReviewMentor = async (req, res) => {
  try {
    const { mentorId, decision } = req.body;

    if (!["approved", "rejected"].includes(decision)) {
      return res
        .status(400)
        .json({
          message: "Invalid decision. Must be 'approved' or 'rejected'.",
        });
    }

    const mentor = await User.findById(mentorId);
    if (!mentor)
      return res.status(404).json({ message: "Mentor user not found" });

    mentor.status = decision;
    await mentor.save();

    await MentorApplication.findOneAndUpdate({ mentorId }, { status: decision });
    
    res.status(200).json({
      message: `Mentor has been successfully ${decision}.`,
      status: mentor.status,
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Admin review failed.", error: error.message });
  }
};
