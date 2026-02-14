const pdfParse = require("pdf-parse");
const mammoth = require("mammoth");

const Resume = require("../models/Resume");
const UserProfile = require("../models/UserProfile");
const ProcessingJob = require("../models/ProcessingJob");

const SUPPORTED_MIME_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
]);

async function extractTextFromFile(file) {
  if (file.mimetype === "application/pdf") {
    const data = await pdfParse(file.buffer);
    return data.text || "";
  }

  if (
    file.mimetype ===
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    const result = await mammoth.extractRawText({ buffer: file.buffer });
    return result.value || "";
  }

  return "";
}

const uploadResume = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "File missing" });
    }

    if (!SUPPORTED_MIME_TYPES.has(req.file.mimetype)) {
      return res.status(400).json({ error: "Unsupported file type" });
    }

    const text = (await extractTextFromFile(req.file)).trim();

    if (!text || text.length < 50) {
      return res.status(400).json({ error: "Extraction failed" });
    }

    const resume = await Resume.create({
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
      text,
      status: "uploaded"
    });

    const profile = await UserProfile.create({
      resumeId: resume._id,
      skills: [],
      projects: [],
      experience: [],
      status: "draft",
      source: "manual"
    });

    resume.profileId = profile._id;
    await resume.save();

    const parseJob = await ProcessingJob.create({
      type: "parse_resume",
      status: "queued",
      resumeId: resume._id,
      profileId: profile._id
    });

    res.status(201).json({
      message: "Resume uploaded",
      resumeId: resume._id,
      profileId: profile._id,
      parseJobId: parseJob._id
    });
  } catch (err) {
    console.error("FULL ERROR:", err);
    res.status(500).json({
      error: "Server error",
      details: err.message
    });
  }
};

const getResume = async (req, res) => {
  try {
    const includeText =
      req.query.includeText === "1" || req.query.includeText === "true";

    const resume = await Resume.findById(req.params.id).lean();
    if (!resume) {
      return res.status(404).json({ error: "Resume not found" });
    }

    if (!includeText) {
      delete resume.text;
    }

    res.json(resume);
  } catch (err) {
    res.status(500).json({
      error: "Server error",
      details: err.message
    });
  }
};

module.exports = {
  uploadResume,
  getResume
};
