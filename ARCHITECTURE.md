# Resume MVP Architecture

## Intended Target

The product is user-owned end-to-end:

1. User uploads resume.
2. Backend stores resume text and queues parse job.
3. AI worker parses and updates profile as `parsed`.
4. User sees parsed `skills`, `projects`, and `experience`.
5. User edits (optional) and clicks save/confirm.
6. Backend marks profile as `validated`.
7. User requests question generation.
8. AI worker generates questions.

No reviewer queue, no moderator role, no `validatedBy` dependency.

## Backend Structure

```txt
server/
  server.js                      # App bootstrap + Mongo connection + route mounts
  middlewares/upload.js          # Multer memory upload
  models/Resume.js               # Uploaded resume text + lifecycle state
  models/UserProfile.js          # Structured profile fields for user validation
  models/ProcessingJob.js        # Queue-like records for async AI work
  models/QuestionSet.js          # Generated interview questions
  controllers/resumeController.js
  controllers/profileController.js
  controllers/questionController.js
  controllers/jobController.js
  routes/resumeRoutes.js
  routes/profileRoutes.js
  routes/questionRoutes.js
  routes/jobRoutes.js
```

## Data Contracts

### `UserProfile` (validated by end user)

```json
{
  "resumeId": "ObjectId",
  "skills": ["string"],
  "projects": ["string"],
  "experience": ["string"],
  "status": "draft | parsed | validated",
  "source": "manual | ai",
  "validatedAt": "Date"
}
```

### `ProcessingJob` (for AI worker)

```json
{
  "type": "parse_resume | generate_questions",
  "status": "queued | in_progress | completed | failed",
  "resumeId": "ObjectId",
  "profileId": "ObjectId",
  "questionSetId": "ObjectId",
  "lockedBy": "string",
  "lockedAt": "Date",
  "startedAt": "Date",
  "completedAt": "Date",
  "attempts": 0,
  "lastError": "string"
}
```

### `QuestionSet` question item

```json
{
  "section": "skills | projects | experience",
  "question": "string",
  "answer": "string",
  "difficulty": "string",
  "tags": ["string"]
}
```

## API Workflow

### 1) Upload Resume

```http
POST /api/resume/upload
Content-Type: multipart/form-data
field: resume=<file>
```

Response:

```json
{
  "message": "Resume uploaded",
  "resumeId": "...",
  "profileId": "...",
  "parseJobId": "..."
}
```

What happens internally:

- Extract text from `pdf` or `docx`.
- Save `Resume`.
- Create draft `UserProfile`.
- Create `parse_resume` job in `ProcessingJob`.

### 2) AI Parse Worker Updates Profile

Worker reads:

```http
GET /api/resume/:resumeId?includeText=true
```

Worker writes:

```http
PUT /api/profiles/:profileId
Content-Type: application/json
```

```json
{
  "skills": ["..."],
  "projects": ["..."],
  "experience": ["..."],
  "status": "parsed"
}
```

Worker updates job:

```http
PATCH /api/jobs/:jobId
```

```json
{
  "status": "completed"
}
```

Worker claims jobs atomically:

```http
POST /api/jobs/claim
Content-Type: application/json
```

```json
{
  "types": ["parse_resume", "generate_questions"],
  "workerId": "ai-worker-1"
}
```

### 3) User Validation

Frontend fetches parsed profile:

```http
GET /api/profiles/:profileId
```

Frontend saves user-confirmed profile:

```http
PUT /api/profiles/:profileId
Content-Type: application/json
```

```json
{
  "skills": ["..."],
  "projects": ["..."],
  "experience": ["..."],
  "status": "validated"
}
```

### 4) Generate Questions

```http
POST /api/questions/:profileId/request
```

Rules:

- Profile must already be `validated`.
- Backend creates/uses `QuestionSet`.
- Backend queues `generate_questions` job.

Worker writes generated results into `questionsets` and marks job as `completed`.
Writeback API:

```http
PUT /api/questions/:profileId
Content-Type: application/json
```

```json
{
  "questions": [
    {
      "section": "projects",
      "question": "What architecture choices did you make?",
      "answer": "I separated upload, parse, and generation jobs.",
      "difficulty": "medium",
      "tags": ["architecture", "backend"]
    }
  ],
  "status": "ready",
  "promptVersion": "adk:gemini-2.5-flash"
}
```

## Frontend Flow (`client/src/App.js`)

- Upload button sends file to `/api/resume/upload`.
- Stores `profileId` and `parseJobId` from response.
- Polls `/api/profiles/:profileId` every 5s to load parsed content.
- Shows editable textareas for:
  - `skills`
  - `projects`
  - `experience`
- `Save` converts textarea lines into arrays and sends `status: validated`.
- `Generate Questions` calls `/api/questions/:profileId/request` (enabled only when profile is validated).

## AI Developer Notes

1. Poll jobs by `status=queued` and claim them atomically by setting `in_progress`.
2. For `parse_resume`:
   - Read resume text.
   - Produce deterministic JSON arrays (`skills`, `projects`, `experience`).
   - Update profile with `status=parsed` and `source=ai`.
3. For `generate_questions`:
   - Ensure profile status is `validated`.
   - Create a question list and update `QuestionSet.status=ready`.
4. On failures:
   - Increment `attempts`.
   - Store `lastError`.
   - Set `status=failed` after retry limit.
5. Keep processing idempotent:
   - If profile already parsed, skip reparse.
   - If question set already ready, skip regeneration unless explicitly forced.

## Canonical Worker Files

- `server/ai_worker.py`
- `server/requirements-ai.txt`
- `server/.env.ai.example`
