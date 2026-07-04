const mongoose = require("mongoose");

const mentorApplicationSchema = new mongoose.Schema(
  {
    mentorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    fullName: {
      type: String,
      required: true,
    },
    qualification: {
      type: [String],
      required: true,
    },
    qualificationOther: {
      type: String,
      trim: true,
    },
    experience: {
      type: String,
      required: true,
    },
    expertise: {
      type: [String],
      required: true,
    },
    documents: {
      cnicDocument: {
        type: String,
        required: true,
      },
      educationDocument: {
        type: String,
        required: true,
      },
      coverLetter: {
        type: String,
      },
    },
    declaration: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: 'pending'
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("MentorApplication", mentorApplicationSchema);
