const ProcessingJob = require("../models/ProcessingJob");

const VALID_STATUSES = new Set([
  "queued",
  "in_progress",
  "completed",
  "failed"
]);

const listJobs = async (req, res) => {
  try {
    const query = {};

    if (req.query.status) {
      query.status = req.query.status;
    }

    if (req.query.type) {
      query.type = req.query.type;
    }

    if (req.query.profileId) {
      query.profileId = req.query.profileId;
    }

    if (req.query.resumeId) {
      query.resumeId = req.query.resumeId;
    }

    const jobs = await ProcessingJob.find(query).lean();
    res.json(jobs);
  } catch (err) {
    res.status(500).json({
      error: "Server error",
      details: err.message
    });
  }
};

const getJob = async (req, res) => {
  try {
    const job = await ProcessingJob.findById(req.params.id).lean();
    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }

    res.json(job);
  } catch (err) {
    res.status(500).json({
      error: "Server error",
      details: err.message
    });
  }
};

const claimJob = async (req, res) => {
  try {
    const { types, workerId } = req.body;

    if (!Array.isArray(types) || types.length === 0) {
      return res
        .status(400)
        .json({ error: "types must be a non-empty array" });
    }

    const invalidTypes = types.filter(
      (type) => type !== "parse_resume" && type !== "generate_questions"
    );
    if (invalidTypes.length > 0) {
      return res.status(400).json({ error: "Invalid job type in types array" });
    }

    if (!workerId || typeof workerId !== "string") {
      return res.status(400).json({ error: "workerId is required" });
    }

    // Atomic claim to prevent two workers from processing the same queued job.
    const claimed = await ProcessingJob.findOneAndUpdate(
      { status: "queued", type: { $in: types } },
      {
        $set: {
          status: "in_progress",
          lockedBy: workerId,
          lockedAt: new Date(),
          startedAt: new Date()
        },
        $inc: { attempts: 1 }
      },
      { returnDocument: "after", sort: { createdAt: 1 } }
    ).lean();

    if (!claimed) {
      return res.status(204).send();
    }

    res.json(claimed);
  } catch (err) {
    res.status(500).json({
      error: "Server error",
      details: err.message
    });
  }
};

const updateJob = async (req, res) => {
  try {
    const { status, lastError, attempts, lockedBy, lockedAt } = req.body;

    if (status && !VALID_STATUSES.has(status)) {
      return res.status(400).json({ error: "Invalid status value" });
    }

    if (attempts !== undefined && typeof attempts !== "number") {
      return res.status(400).json({ error: "attempts must be a number" });
    }

    const updates = {};
    if (status !== undefined) updates.status = status;
    if (lastError !== undefined) updates.lastError = lastError;
    if (attempts !== undefined) updates.attempts = attempts;
    if (lockedBy !== undefined) updates.lockedBy = lockedBy;
    if (lockedAt !== undefined) updates.lockedAt = lockedAt;

    if (status === "completed") {
      updates.completedAt = new Date();
      updates.lockedBy = null;
      updates.lockedAt = null;
    }

    if (status === "failed" || status === "queued") {
      updates.lockedBy = null;
      updates.lockedAt = null;
    }

    const updated = await ProcessingJob.findByIdAndUpdate(
      req.params.id,
      updates,
      { returnDocument: "after" }
    );

    if (!updated) {
      return res.status(404).json({ error: "Job not found" });
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
  listJobs,
  getJob,
  claimJob,
  updateJob
};
