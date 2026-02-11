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
      return res.status(500).json({
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

    let customMessage = "Email verified successfully!";

    if (user.role === "mentor") {
      customMessage +=
        " Please complete your application to proceed for admin review.";
    } else {
      customMessage += " You can now login.";
    }

    res
      .status(201)
      .json({ message: customMessage, role: user.role, userId: user.userId });
  } catch (error) {
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

exports.resendOTP = async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    if (user.isVerified) {
      return res
        .status(400)
        .json({ message: "Account already verified. You can login." });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpires = Date.now() + 10 * 60 * 1000;

    user.otp = otp;
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
        userId: user.userId,
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
      mentorId,
      fullName,
      qualification,
      experience,
      expertise,
      documents,
      declaration,
    } = req.body;

    const Qualification = qualification?.toLowerCase().trim();

    const QualificationMasters = Qualification.includes(
      "masters in psychology",
    );
    const QualificationADCP = Qualification.includes("adcp");

    if (QualificationMasters && QualificationADCP) {
      return res.status(400).json({
        message:
          "Eligibility Error: You must have a 'Masters in Psychology' or 'ADCP'.",
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
    const { mentorId, decision, reason } = req.body;

    if (!["approved", "rejected"].includes(decision)) {
      return res.status(400).json({
        message: "Invalid decision. Must be 'approved' or 'rejected'.",
      });
    }

    const mentor = await User.findById(mentorId);
    if (!mentor)
      return res.status(404).json({ message: "Mentor user not found" });

    mentor.status = decision;
    await mentor.save();

    await MentorApplication.findOneAndUpdate(
      { mentorId },
      { status: decision },
    );

    const subject =
      decision === "approved"
        ? "Welcome to MindComfort! Your Profile is Live."
        : "Update on your MindComfort Application";

    const htmlContent =
      decision === "approved"
        ? `<h2>Congratulations, ${mentor.username}!</h2>
         <p>After our interview, we are excited to approve your profile.</p>
         <p>Your Mentor ID is: <b>${mentor.userId}</b></p>
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
