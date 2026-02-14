const mongoose = require("mongoose");

const questionSchema = new mongoose.Schema(
  {
    // Section links each question back to source profile area.
    section: {
      type: String,
      enum: ["skills", "projects", "experience"],
      required: true
    },
    question: { type: String, required: true },
    answer: { type: String, required: true },
    difficulty: String,
    tags: [String]
  },
  { _id: false }
);

const questionSetSchema = new mongoose.Schema(
  {
    profileId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "UserProfile",
      required: true,
      index: true
    },
    questions: [questionSchema],
    status: {
      type: String,
      enum: ["pending", "ready", "failed"],
      default: "pending",
      index: true
    },
    promptVersion: String
  },
  { timestamps: true }
);

module.exports = mongoose.model("QuestionSet", questionSetSchema);
