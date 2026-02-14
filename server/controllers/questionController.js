const ProcessingJob = require("../models/ProcessingJob");
const QuestionSet = require("../models/QuestionSet");
const Resume = require("../models/Resume");
const UserProfile = require("../models/UserProfile");

function normalizeQuestion(question) {
  // Backward compatibility for older question docs that used { text, category }.
  if (question.question) {
    return question;
  }

  return {
    section: question.category || "experience",
    question: question.text || "",
    answer: question.answer || "",
    difficulty: question.difficulty || "",
    tags: question.tags || []
  };
}

const getQuestions = async (req, res) => {
  try {
    const questionSet = await QuestionSet.findOne({
      profileId: req.params.profileId
    }).lean();

    if (!questionSet) {
      return res.status(404).json({ error: "Question set not found" });
    }

    res.json({
      ...questionSet,
      questions: (questionSet.questions || []).map(normalizeQuestion)
    });
  } catch (err) {
    res.status(500).json({
      error: "Server error",
      details: err.message
    });
  }
};

const saveQuestions = async (req, res) => {
  try {
    const { profileId } = req.params;
    const { questions, status, promptVersion } = req.body;

    if (!Array.isArray(questions)) {
      return res.status(400).json({ error: "questions must be an array" });
    }

    const invalidQuestion = questions.find(
      (q) =>
        !q ||
        typeof q.question !== "string" ||
        typeof q.answer !== "string" ||
        !["skills", "projects", "experience"].includes(q.section)
    );

    if (invalidQuestion) {
      return res.status(400).json({
        error:
          "Each question must include section(skills|projects|experience), question, and answer"
      });
    }

    if (status && !["pending", "ready", "failed"].includes(status)) {
      return res.status(400).json({ error: "Invalid question set status" });
    }

    const profile = await UserProfile.findById(profileId).lean();
    if (!profile) {
      return res.status(404).json({ error: "Profile not found" });
    }

    const updated = await QuestionSet.findOneAndUpdate(
      { profileId },
      {
        $set: {
          questions,
          status: status || "ready",
          promptVersion: promptVersion || "v1"
        }
      },
      {
        returnDocument: "after",
        upsert: true,
        setDefaultsOnInsert: true
      }
    );

    if (profile.resumeId) {
      await Resume.findByIdAndUpdate(profile.resumeId, {
        status: status === "failed" ? "validated" : "questions_ready"
      });
    }

    res.json(updated);
  } catch (err) {
    res.status(500).json({
      error: "Server error",
      details: err.message
    });
  }
};

const requestQuestions = async (req, res) => {
  try {
    const { profileId } = req.params;

    const profile = await UserProfile.findById(profileId);
    if (!profile) {
      return res.status(404).json({ error: "Profile not found" });
    }

    if (profile.status !== "validated") {
      return res.status(400).json({
        error: "Profile must be validated before generating questions"
      });
    }

    let questionSet = await QuestionSet.findOne({ profileId });
    if (!questionSet) {
      questionSet = await QuestionSet.create({
        profileId,
        status: "pending",
        questions: []
      });
    }

    if (questionSet.status === "ready") {
      return res.status(200).json({
        message: "Questions already available",
        questionSetId: questionSet._id,
        status: questionSet.status
      });
    }

    const existingJob = await ProcessingJob.findOne({
      type: "generate_questions",
      profileId,
      status: { $in: ["queued", "in_progress"] }
    });

    if (existingJob) {
      return res.status(202).json({
        message: "Question generation already queued",
        questionSetId: questionSet._id,
        jobId: existingJob._id,
        status: questionSet.status
      });
    }

    const job = await ProcessingJob.create({
      type: "generate_questions",
      status: "queued",
      profileId,
      questionSetId: questionSet._id
    });

    if (profile.resumeId) {
      await Resume.findByIdAndUpdate(profile.resumeId, {
        status: "questions_pending"
      });
    }

    res.status(202).json({
      message: "Question generation queued",
      questionSetId: questionSet._id,
      jobId: job._id,
      status: questionSet.status
    });
  } catch (err) {
    res.status(500).json({
      error: "Server error",
      details: err.message
    });
  }
};

module.exports = {
  getQuestions,
  requestQuestions,
  saveQuestions
};
