# AI Integration Change Log

Date: 2026-02-13

## Completed Changes

### Backend APIs

- Added `POST /api/jobs/claim` for atomic worker job claiming.
- Added `PUT /api/questions/:profileId` for AI worker question writeback.
- Kept existing worker dependency endpoints:
  - `GET /api/resume/:id?includeText=true`
  - `GET /api/profiles/:id`
  - `PUT /api/profiles/:id`
  - `PATCH /api/jobs/:id`

### Backend Models

- Updated `server/models/QuestionSet.js`:
  - Question shape now stores:
    - `section`
    - `question`
    - `answer`
    - `difficulty`
    - `tags`
- Updated `server/models/ProcessingJob.js`:
  - Added lock and timing metadata:
    - `lockedBy`
    - `lockedAt`
    - `startedAt`
    - `completedAt`

### Backend Controllers

- Updated `server/controllers/jobController.js`:
  - Added `claimJob` with atomic `findOneAndUpdate`.
  - Extended `updateJob` to handle lifecycle/lock metadata.
- Updated `server/controllers/questionController.js`:
  - Added `saveQuestions`.
  - Added compatibility normalization for old question docs.
  - Resume status now updates to `questions_ready` on successful AI question writeback.
- Updated `server/controllers/profileController.js`:
  - Allows `source` updates (`manual|ai`) for AI parse writes.

### Backend Routes

- Updated `server/routes/jobRoutes.js`:
  - Added `router.post("/claim", claimJob)`.
- Updated `server/routes/questionRoutes.js`:
  - Added `router.put("/:profileId", saveQuestions)`.

### Python Worker

- Replaced ambiguous agent files with one canonical worker:
  - Added `server/ai_worker.py`.
  - Removed `server/agent.py` (empty).
  - Removed `server/agent (1).py`.
- Worker capabilities:
  - Poll/claim queued jobs.
  - Parse resumes via ADK and update profile to `parsed`.
  - Generate questions via ADK and save Q+A via API.
  - Retry failed jobs with backoff (10s, 30s, 60s) up to 3 attempts.

### Worker Configuration

- Added `server/requirements-ai.txt`.
- Added `server/.env.ai.example`.

## Pending Follow-Ups

- Install Python dependency: `google-adk`.
- Set `GOOGLE_API_KEY` in worker environment.
- Start backend and worker together for end-to-end test.
- Optional: add auth/token for worker API calls in production.
