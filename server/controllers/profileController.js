const Resume = require("../models/Resume");
const UserProfile = require("../models/UserProfile");

const VALID_STATUSES = new Set(["draft", "parsed", "validated"]);
const VALID_SOURCES = new Set(["manual", "ai"]);

const listProfiles = async (req, res) => {
  try {
    const query = {};

    if (req.query.status) {
      query.status = req.query.status;
    }

    if (req.query.resumeId) {
      query.resumeId = req.query.resumeId;
    }

    const profiles = await UserProfile.find(query).lean();
    res.json(profiles);
  } catch (err) {
    res.status(500).json({
      error: "Server error",
      details: err.message
    });
  }
};

const getProfile = async (req, res) => {
  try {
    const profile = await UserProfile.findById(req.params.id).lean();
    if (!profile) {
      return res.status(404).json({ error: "Profile not found" });
    }

    res.json(profile);
  } catch (err) {
    res.status(500).json({
      error: "Server error",
      details: err.message
    });
  }
};

const updateProfile = async (req, res) => {
  try {
    const { skills, projects, experience, status, source } = req.body;

    if (skills && !Array.isArray(skills)) {
      return res.status(400).json({ error: "skills must be an array" });
    }

    if (projects && !Array.isArray(projects)) {
      return res.status(400).json({ error: "projects must be an array" });
    }

    if (experience && !Array.isArray(experience)) {
      return res.status(400).json({ error: "experience must be an array" });
    }

    if (status && !VALID_STATUSES.has(status)) {
      return res.status(400).json({ error: "Invalid status value" });
    }

    if (source && !VALID_SOURCES.has(source)) {
      return res.status(400).json({ error: "Invalid source value" });
    }

    const updates = {};

    if (skills !== undefined) updates.skills = skills;
    if (projects !== undefined) updates.projects = projects;
    if (experience !== undefined) updates.experience = experience;
    if (status !== undefined) updates.status = status;
    if (source !== undefined) updates.source = source;

    if (status === "validated") {
      updates.validatedAt = new Date();
    }

    const updated = await UserProfile.findByIdAndUpdate(req.params.id, updates, {
      returnDocument: "after"
    });

    if (!updated) {
      return res.status(404).json({ error: "Profile not found" });
    }

    if (updated.resumeId) {
      if (updated.status === "validated") {
        await Resume.findByIdAndUpdate(updated.resumeId, {
          status: "validated"
        });
      } else if (updated.status === "parsed") {
        await Resume.findByIdAndUpdate(updated.resumeId, { status: "parsed" });
      }
    }

    res.json(updated);
  } catch (err) {
    res.status(500).json({
      error: "Server error",
      details: err.message
    });
  }
};

module.exports = {
  listProfiles,
  getProfile,
  updateProfile
};
