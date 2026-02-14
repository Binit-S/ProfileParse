const express = require("express");
const upload = require("../middlewares/upload");
const {
  uploadResume,
  getResume
} = require("../controllers/resumeController");

const router = express.Router();

router.post(
  "/upload",
  upload.single("resume"),
  uploadResume
);

router.get("/:id", getResume);

module.exports = router;
