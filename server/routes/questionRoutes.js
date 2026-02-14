const express = require("express");
const {
  getQuestions,
  requestQuestions,
  saveQuestions
} = require("../controllers/questionController");

const router = express.Router();

router.get("/:profileId", getQuestions);
router.put("/:profileId", saveQuestions);
router.post("/:profileId/request", requestQuestions);

module.exports = router;
