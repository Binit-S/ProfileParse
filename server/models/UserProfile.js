const mongoose = require("mongoose");

const userProfileSchema = new mongoose.Schema(
  {
    resumeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Resume",
      required: true,
      index: true
    },
    skills: [String],
    projects: [String],
    experience: [String],
    status: {
      type: String,
      enum: ["draft", "parsed", "validated"],
      default: "draft",
      index: true
    },
    source: {
      type: String,
      enum: ["manual", "ai"],
      default: "manual"
    },
    validatedAt: Date
  },
  { timestamps: true }
);

module.exports = mongoose.model("UserProfile", userProfileSchema);
