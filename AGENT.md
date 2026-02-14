# AGENT Context

## Current System State

- Backend stack: Node.js + Express + MongoDB (`server/`).
- Frontend stack: React (`client/`).
- Workflow:
  1. Resume upload creates `Resume`, `UserProfile(draft)`, and `parse_resume` job.
  2. Python worker claims queued jobs and runs AI.
  3. Worker updates `UserProfile` (`parsed`) with `skills/projects/experience`.
  4. User edits and validates profile (`validated`).
  5. Question generation request creates `generate_questions` job.
  6. Worker writes Q+A and marks question set as ready.

## Canonical AI Worker

- File: `server/ai_worker.py`
- Inputs:
  - `POST /api/jobs/claim`
  - `GET /api/resume/:id?includeText=true`
  - `GET /api/profiles/:id`
- Outputs:
  - `PUT /api/profiles/:id`
  - `PUT /api/questions/:profileId`
  - `PATCH /api/jobs/:id`

## Data Contracts (Active)

- `UserProfile` fields used by AI:
  - `skills: string[]`
  - `projects: string[]`
  - `experience: string[]`
  - `status: draft|parsed|validated`
  - `source: manual|ai`
- `QuestionSet.questions` fields:
  - `section: skills|projects|experience`
  - `question: string`
  - `answer: string`
  - `difficulty?: string`
  - `tags?: string[]`

## Next Operations

1. Environment setup
   - Create worker env from `server/.env.ai.example`.
   - Ensure `GOOGLE_API_KEY` is set.
   - Install worker dependency:
     - `pip install -r server/requirements-ai.txt`

2. Run services
   - Start backend:
     - `cd server && node server.js`
   - Start worker (separate terminal):
     - `python server/ai_worker.py`

3. End-to-end verification
   - Upload resume via frontend.
   - Confirm `parse_resume` job moves: `queued -> in_progress -> completed`.
   - Confirm profile fields are populated and status becomes `parsed`.
   - Validate profile in UI.
   - Request questions and confirm `QuestionSet.status = ready`.

4. Production hardening (next milestone)
   - Add worker authentication token on backend endpoints.
   - Add structured tracing (request/job correlation IDs).
   - Add automated tests for:
     - job claim atomicity
     - parse writeback contract
     - question writeback contract

## Known Constraints

- Worker assumes Node API is reachable at `AI_API_BASE_URL`.
- Worker currently uses polling, not push/queue broker.
- `google-adk` must be installed in the Python runtime.
