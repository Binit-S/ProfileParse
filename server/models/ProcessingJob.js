const mongoose = require("mongoose");

const processingJobSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["parse_resume", "generate_questions"],
      required: true,
      index: true
    },
    status: {
      type: String,
      enum: ["queued", "in_progress", "completed", "failed"],
      default: "queued",
      index: true
    },
    resumeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Resume"
    },
    profileId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "UserProfile"
    },
    questionSetId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "QuestionSet"
    },
    // Lock metadata enables safe multi-worker processing.
    lockedBy: String,
    lockedAt: Date,
    startedAt: Date,
    completedAt: Date,
    attempts: { type: Number, default: 0 },
    lastError: String
  },
  { timestamps: true }
);

module.exports = mongoose.model("ProcessingJob", processingJobSchema);
