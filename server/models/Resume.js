const mongoose = require("mongoose");

const resumeSchema = new mongoose.Schema(
  {
    originalName: String,
    mimeType: { type: String, required: true },
    size: Number,
    text: { type: String, required: true },
    status: {
      type: String,
      enum: [
        "uploaded",
        "parsed",
        "validated",
        "questions_pending",
        "questions_ready"
      ],
      default: "uploaded",
      index: true
    },
    profileId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "UserProfile"
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Resume", resumeSchema);
