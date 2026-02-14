const express = require("express");
const {
  listProfiles,
  getProfile,
  updateProfile
} = require("../controllers/profileController");

const router = express.Router();

router.get("/", listProfiles);
router.get("/:id", getProfile);
router.put("/:id", updateProfile);

module.exports = router;
