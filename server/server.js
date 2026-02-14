require("dotenv").config();

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");

const resumeRoutes = require("./routes/resumeRoutes");
const profileRoutes = require("./routes/profileRoutes");
const questionRoutes = require("./routes/questionRoutes");
const jobRoutes = require("./routes/jobRoutes");

const app = express();

app.use(cors());
app.use(express.json());

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => console.error("Error connecting to MongoDB:", err));

app.use("/api/resume", resumeRoutes);
app.use("/api/profiles", profileRoutes);
app.use("/api/questions", questionRoutes);
app.use("/api/jobs", jobRoutes);

const port = process.env.PORT || 5000;
app.listen(port, () => console.log(`Server is running on port ${port}`));
