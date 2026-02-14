# Resume MVP Backend

This repo contains a MERN backend for resume upload, AI parsing (queued), human validation, and question generation (queued). The AI parts are intentionally left as job stubs for another developer to implement.

## Quick Start

```powershell
cd server
node server.js
```

Server starts on `http://localhost:5000`.

## API Overview

- `POST /api/resume/upload` (multipart, field name `resume`)
- `GET /api/resume/:id` (use `?includeText=true` to include extracted text)
- `GET /api/profiles`
- `GET /api/profiles/:id`
- `PUT /api/profiles/:id`
- `POST /api/questions/:profileId/request`
- `GET /api/questions/:profileId`
- `GET /api/jobs`
- `GET /api/jobs/:id`
- `PATCH /api/jobs/:id`

## Test Flow (PowerShell)

1. Upload a resume

```powershell
curl -F "resume=@C:\path\to\resume.pdf" http://localhost:5000/api/resume/upload
```

Expected response includes:
- `resumeId`
- `profileId`
- `parseJobId`

2. Fetch resume

```powershell
curl http://localhost:5000/api/resume/<resumeId>
curl "http://localhost:5000/api/resume/<resumeId>?includeText=true"
```

3. Fetch profile

```powershell
curl http://localhost:5000/api/profiles/<profileId>
```

4. Update and validate profile

```powershell
curl -X PUT http://localhost:5000/api/profiles/<profileId> `
  -H "Content-Type: application/json" `
  -d '{"skills":["Node","Mongo"],"experience":["Built APIs"],"status":"validated","validatedBy":"admin"}'
```

5. Request questions (queues job)

```powershell
curl -X POST http://localhost:5000/api/questions/<profileId>/request
```

6. Check jobs

```powershell
curl http://localhost:5000/api/jobs
curl http://localhost:5000/api/jobs/<jobId>
```

## MongoDB Collections

- `resumes`
- `userprofiles`
- `processingjobs`
- `questionsets`

## Notes For AI Developer

- Resume text can be retrieved via `GET /api/resume/:id?includeText=true`.
- Parsed profile should be written via `PUT /api/profiles/:id`.
- Question results should populate `questionsets` and update the job status via `PATCH /api/jobs/:id`.
