# Resume MVP Deep Workflow and Integration Guide

## 1) System Purpose

This system implements an end-to-end resume intelligence pipeline:

1. User uploads resume (`pdf`/`docx`).
2. Backend extracts raw text and creates an async parse job.
3. Python AI worker claims parse job, calls Gemini (Google ADK), and writes parsed profile fields.
4. User reviews/edit parsed fields and validates profile.
5. Backend creates async question-generation job.
6. Python AI worker claims question job, generates interview Q&A, and stores results.

The architecture is asynchronous and job-driven so AI processing does not block user-facing API calls.

## 2) Current Components

## Backend (Node + Express + MongoDB)

- Entry: `server/server.js`
- Routes:
  - `server/routes/resumeRoutes.js`
  - `server/routes/profileRoutes.js`
  - `server/routes/questionRoutes.js`
  - `server/routes/jobRoutes.js`
- Controllers:
  - `server/controllers/resumeController.js`
  - `server/controllers/profileController.js`
  - `server/controllers/questionController.js`
  - `server/controllers/jobController.js`
- Models:
  - `server/models/Resume.js`
  - `server/models/UserProfile.js`
  - `server/models/ProcessingJob.js`
  - `server/models/QuestionSet.js`

## AI Worker (Python + Google ADK)

- Worker: `server/ai_worker.py`
- Config template: `server/.env.ai.example`
- Python deps: `server/requirements-ai.txt`

## Frontend (React)

- Main file: `client/src/App.js`
- Talks directly to backend API.

## 3) Data Model Contracts

## `Resume` collection

Document purpose:
- Keep uploaded resume metadata and extracted plain text.

Key fields:
- `originalName`
- `mimeType`
- `size`
- `text`
- `status`: `uploaded | parsed | validated | questions_pending | questions_ready`
- `profileId`

State transitions:
- Upload: `uploaded`
- Parse done: `parsed`
- User validation done: `validated`
- Questions requested: `questions_pending`
- Questions ready: `questions_ready`

## `UserProfile` collection

Document purpose:
- Stores user-editable, normalized profile fields.

Key fields:
- `resumeId`
- `skills: string[]`
- `projects: string[]`
- `experience: string[]`
- `status: draft | parsed | validated`
- `source: manual | ai`
- `validatedAt`

Ownership:
- AI writes initial parsed values (`status=parsed`, `source=ai`).
- User can edit and validate (`status=validated`).

## `ProcessingJob` collection

Document purpose:
- Queue for async work.

Key fields:
- `type: parse_resume | generate_questions`
- `status: queued | in_progress | completed | failed`
- `resumeId`
- `profileId`
- `questionSetId`
- `attempts`
- `lastError`
- `lockedBy`
- `lockedAt`
- `startedAt`
- `completedAt`

Concurrency mechanism:
- Worker claims jobs atomically via `POST /api/jobs/claim` (internally `findOneAndUpdate`).
- Prevents multiple workers from processing the same job.

## `QuestionSet` collection

Document purpose:
- Stores generated Q&A linked to profile.

Key fields:
- `profileId`
- `questions[]`:
  - `section: skills | projects | experience`
  - `question`
  - `answer`
  - `difficulty`
  - `tags`
- `status: pending | ready | failed`
- `promptVersion`

## 4) API Reference (Full Flow)

## Resume Upload APIs

### `POST /api/resume/upload`

Request:
- `multipart/form-data`
- field name: `resume`

Behavior:
1. Validates file/mime type.
2. Extracts text using `pdf-parse` or `mammoth`.
3. Creates `Resume`.
4. Creates `UserProfile` in `draft`.
5. Creates `ProcessingJob` type `parse_resume` in `queued`.

Response:
```json
{
  "message": "Resume uploaded",
  "resumeId": "....",
  "profileId": "....",
  "parseJobId": "...."
}
```

### `GET /api/resume/:id?includeText=true`

Purpose:
- Worker fetches raw resume text for parsing.

## Profile APIs

### `GET /api/profiles/:id`

Purpose:
- Frontend and worker fetch parsed/validated profile.

### `PUT /api/profiles/:id`

Purpose:
- Worker writes parsed fields.
- Frontend saves validated fields.

Accepted payload keys:
- `skills: string[]`
- `projects: string[]`
- `experience: string[]`
- `status: draft|parsed|validated`
- `source: manual|ai`

## Question APIs

### `POST /api/questions/:profileId/request`

Purpose:
- Trigger async question generation.

Behavior:
1. Ensures profile is `validated`.
2. Creates/gets `QuestionSet`.
3. Creates `generate_questions` job.
4. Sets resume status to `questions_pending`.

### `PUT /api/questions/:profileId`

Purpose:
- Worker writes generated questions.

Payload:
```json
{
  "questions": [
    {
      "section": "projects",
      "question": "What architecture did you choose?",
      "answer": "I split API and worker...",
      "difficulty": "medium",
      "tags": ["architecture"]
    }
  ],
  "status": "ready",
  "promptVersion": "adk:gemini-2.5-flash"
}
```

Behavior:
- Upserts `QuestionSet`.
- Updates `Resume.status` to `questions_ready` (unless failed).

### `GET /api/questions/:profileId`

Purpose:
- Frontend fetches generated questions.

## Job APIs

### `POST /api/jobs/claim`

Purpose:
- Worker atomically claims one queued job.

Payload:
```json
{
  "types": ["parse_resume", "generate_questions"],
  "workerId": "ai-worker-1"
}
```

Response:
- `200` + claimed job object, or
- `204` when no queued jobs.

### `PATCH /api/jobs/:id`

Purpose:
- Worker updates status/error.

Common updates:
- `{"status":"completed","lastError":""}`
- `{"status":"queued","lastError":"..."}`
- `{"status":"failed","lastError":"..."}`

### `GET /api/jobs`, `GET /api/jobs/:id`

Purpose:
- Debug and operational monitoring.

## 5) Worker Internals (`server/ai_worker.py`)

## Poll/claim loop

Main loop:
1. `POST /jobs/claim`
2. If no job: sleep (`AI_POLL_INTERVAL_MS`)
3. If job:
   - parse route for `parse_resume`
   - question route for `generate_questions`

## Parse job execution

1. Fetch resume text (`GET /resume/:id?includeText=true`)
2. Prompt Gemini for strict JSON:
   - `skills`
   - `projects`
   - `experience`
3. Normalize response into `string[]`
4. Update profile:
   - `status=parsed`
   - `source=ai`
5. Mark job completed.

## Question job execution

1. Fetch profile (`GET /profiles/:id`)
2. Require `profile.status == validated`
3. Prompt Gemini for Q&A JSON list
4. Normalize items (`section/question/answer`)
5. Save via `PUT /questions/:profileId`
6. Mark job completed.

## Retry/failure behavior

- Retries up to `AI_MAX_ATTEMPTS` (default 3).
- Backoff:
  - attempt 1 -> 10s
  - attempt 2 -> 30s
  - attempt 3 -> 60s
- Final failure -> `status=failed` + `lastError`.

## 6) How Everything Is Connected End-to-End

Sequence after upload:

1. Frontend uploads file.
2. Backend immediately returns IDs.
3. Worker claims parse job and writes profile.
4. Frontend polls profile and shows parsed data.
5. User edits + validates.
6. Frontend requests question generation.
7. Backend queues question job.
8. Worker claims question job and writes `QuestionSet`.
9. Frontend fetches questions and displays.

Critical design point:
- Frontend does **not** call AI directly.
- Worker does **not** write to Mongo directly (in this design); it writes through backend APIs.
- API layer remains source of truth and enforces state rules.

## 7) Integrating This into Another Project

If you want to keep this backend+worker and replace frontend with another project frontend:

## Option A (recommended): Reuse this backend as a separate service

Your other frontend calls this service’s APIs directly.

What to change:
1. Configure CORS in this backend to allow the other frontend origin.
2. In other frontend, create an API client pointing to this service base URL.
3. Implement UI flow using these endpoints:
   - upload -> profile fetch/edit/save -> generate -> questions fetch
4. Ensure worker is deployed/running alongside backend.

Pros:
- Minimal backend rewrite.
- Faster integration.

## Option B: Merge APIs into existing backend project

What to migrate:
1. Copy models + controllers + routes into target backend.
2. Add route mounts in target server bootstrap.
3. Ensure Mongo schemas and indexes exist.
4. Keep `ai_worker.py`, update `AI_API_BASE_URL` to target backend URL.
5. Move env variables and secrets into target project config.

Pros:
- Single backend deployment.

Tradeoff:
- Higher merge complexity and regression risk.

## Frontend migration contract (minimum)

Your replacement frontend must support:
1. Upload (`POST /resume/upload`).
2. Profile polling/read (`GET /profiles/:id`).
3. Editable form with:
   - skills
   - projects
   - experience
4. Save validate (`PUT /profiles/:id`, `status=validated`).
5. Trigger questions (`POST /questions/:profileId/request`).
6. Read questions (`GET /questions/:profileId`).

## 8) Environment and Deployment Requirements

Backend:
- `MONGO_URI`

Worker:
- `GOOGLE_API_KEY`
- `AI_API_BASE_URL`
- `AI_WORKER_ID`
- `AI_POLL_INTERVAL_MS`
- `AI_MODEL`
- `AI_MAX_ATTEMPTS`

Runtime:
- Backend and worker both must be up.
- If worker is down, jobs stay queued and no parsing/generation happens.

## 9) Observability and Debugging

Check worker logs:
- `job_claimed`
- `parse_resume_completed`
- `generate_questions_completed`
- `job_failed_retrying`
- `job_failed_final`

Check DB collections:
- `processingjobs`
- `userprofiles`
- `questionsets`
- `resumes`

Useful checks:
- many `failed` parse jobs -> AI provider/config issue.
- jobs stay `queued` -> worker not running or cannot reach API.
- jobs stuck `in_progress` -> worker crashed mid-job (needs requeue policy).

## 10) Known Failure Modes

1. `API_KEY_INVALID`:
   - wrong or disabled Gemini key.
2. ADK runtime schema mismatch:
   - fixed by structured message object in worker.
3. Invalid model JSON response:
   - worker parser/normalizer handles partial cleanup, but can still fail.
4. Profile not validated for question generation:
   - backend intentionally blocks question job request.

## 11) Immediate Next Improvements (recommended)

1. Add worker auth token to `/jobs/claim`, `/jobs/:id`, `/questions/:profileId`, `/profiles/:id`.
2. Add dead-letter/requeue endpoint for stale `in_progress` jobs.
3. Add integration tests for parse and question paths.
4. Add dashboard endpoint summarizing queue health.
