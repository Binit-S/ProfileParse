const express = require("express");
const {
  listJobs,
  getJob,
  claimJob,
  updateJob
} = require("../controllers/jobController");

const router = express.Router();

router.get("/", listJobs);
router.post("/claim", claimJob);
router.get("/:id", getJob);
router.patch("/:id", updateJob);

module.exports = router;
