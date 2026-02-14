import asyncio
import json
import logging
import os
import socket
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from typing import Any
import inspect

try:
    from google.adk.agents import Agent
    from google.adk.runners import Runner
    from google.adk.sessions import InMemorySessionService
    from google.genai import types as genai_types
except ImportError as import_error:
    raise RuntimeError(
        "google.adk is required. Install dependencies from requirements-ai.txt."
    ) from import_error


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s"
)

from dotenv import load_dotenv
load_dotenv()


API_BASE_URL = os.getenv("AI_API_BASE_URL", "http://localhost:5000/api").rstrip("/")
WORKER_ID = os.getenv("AI_WORKER_ID", f"ai-worker-{socket.gethostname()}")
POLL_INTERVAL_MS = int(os.getenv("AI_POLL_INTERVAL_MS", "3000"))
AI_MODEL = os.getenv("AI_MODEL", "gemini-2.5-flash")
MAX_ATTEMPTS = int(os.getenv("AI_MAX_ATTEMPTS", "3"))
BACKOFF_SECONDS = {1: 10, 2: 30, 3: 60}


if not os.getenv("GOOGLE_API_KEY"):
    raise EnvironmentError("Missing GOOGLE_API_KEY for ADK/Gemini calls.")


def _build_url(path: str) -> str:
    return f"{API_BASE_URL}{path}"


def _http_request(
    method: str,
    path: str,
    payload: Any | None = None,
    expected_statuses: tuple[int, ...] = (200,)
) -> Any:
    data = None
    headers = {"Content-Type": "application/json"}
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")

    request = urllib.request.Request(
        _build_url(path),
        data=data,
        headers=headers,
        method=method
    )

    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            status_code = response.status
            body = response.read().decode("utf-8").strip()

        if status_code not in expected_statuses:
            raise RuntimeError(
                f"Unexpected status {status_code} for {method} {path}: {body}"
            )

        if status_code == 204 or not body:
            return None

        return json.loads(body)
    except urllib.error.HTTPError as error:
        error_body = error.read().decode("utf-8", errors="ignore")
        raise RuntimeError(
            f"HTTP {error.code} for {method} {path}: {error_body}"
        ) from error


def claim_job(job_types: list[str]) -> dict | None:
    return _http_request(
        "POST",
        "/jobs/claim",
        {"types": job_types, "workerId": WORKER_ID},
        expected_statuses=(200, 204)
    )


def fetch_resume(resume_id: str) -> dict:
    encoded = urllib.parse.quote(resume_id)
    return _http_request("GET", f"/resume/{encoded}?includeText=true")


def fetch_profile(profile_id: str) -> dict:
    encoded = urllib.parse.quote(profile_id)
    return _http_request("GET", f"/profiles/{encoded}")


def update_profile(profile_id: str, payload: dict) -> dict:
    encoded = urllib.parse.quote(profile_id)
    return _http_request("PUT", f"/profiles/{encoded}", payload)


def save_questions(profile_id: str, payload: dict) -> dict:
    encoded = urllib.parse.quote(profile_id)
    return _http_request("PUT", f"/questions/{encoded}", payload)


def update_job(job_id: str, payload: dict) -> dict:
    encoded = urllib.parse.quote(job_id)
    return _http_request("PATCH", f"/jobs/{encoded}", payload)


def _extract_json_blob(text: str) -> str:
    trimmed = text.strip()
    if trimmed.startswith("```"):
        lines = trimmed.splitlines()
        lines = [line for line in lines if not line.startswith("```")]
        trimmed = "\n".join(lines).strip()

    start = trimmed.find("{")
    end = trimmed.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise ValueError("Model response does not contain valid JSON object.")

    return trimmed[start : end + 1]


def _parse_json_response(text: str) -> dict:
    return json.loads(_extract_json_blob(text))


def _flatten_to_strings(values: Any) -> list[str]:
    if not isinstance(values, list):
        return []

    flattened: list[str] = []
    for item in values:
        if isinstance(item, str):
            cleaned = item.strip()
            if cleaned:
                flattened.append(cleaned)
            continue

        if isinstance(item, dict):
            # Join key/value pairs into one deterministic line for UI editing.
            line = " | ".join(
                f"{key}: {value}"
                for key, value in item.items()
                if value not in (None, "", [], {})
            ).strip()
            if line:
                flattened.append(line)
            continue

        cleaned = str(item).strip()
        if cleaned:
            flattened.append(cleaned)

    return flattened


async def _run_model_prompt(prompt: str) -> str:
    session_service = InMemorySessionService()
    session = await session_service.create_session(
        app_name="resume_ai_worker",
        user_id=WORKER_ID,
        session_id=f"session_{uuid.uuid4().hex}"
    )

    agent = Agent(
        name="resume_ai_worker_agent",
        model=AI_MODEL,
        instruction=(
            "You are a backend service agent. "
            "Return only JSON output that exactly follows the requested schema."
        )
    )

    runner = Runner(
        agent=agent,
        app_name="resume_ai_worker",
        session_service=session_service
    )

    # ADK runner expects a structured message object in some versions.
    message = genai_types.Content(
        role="user",
        parts=[genai_types.Part(text=prompt)]
    )

    events = runner.run(
        user_id=session.user_id,
        session_id=session.id,
        new_message=message
    )

    final_text = ""
    # ADK may return either an async iterator or a sync generator depending on version.
    if inspect.isasyncgen(events) or hasattr(events, "__aiter__"):
        async for event in events:
            if event.content and event.content.parts:
                for part in event.content.parts:
                    if getattr(part, "text", None):
                        final_text = part.text
    else:
        for event in events:
            if event.content and event.content.parts:
                for part in event.content.parts:
                    if getattr(part, "text", None):
                        final_text = part.text

    if not final_text:
        raise ValueError("Empty model response.")

    return final_text


def parse_resume_with_adk(resume_text: str) -> dict:
    prompt = (
        "Parse the resume text into JSON with this exact shape:\n"
        "{\n"
        '  "skills": [string],\n'
        '  "projects": [string],\n'
        '  "experience": [string]\n'
        "}\n"
        "Rules:\n"
        "- No markdown.\n"
        "- No extra keys.\n"
        "- Keep values concise and factual.\n\n"
        f"Resume text:\n{resume_text}"
    )

    model_output = asyncio.run(_run_model_prompt(prompt))
    parsed = _parse_json_response(model_output)

    return {
        "skills": _flatten_to_strings(parsed.get("skills", [])),
        "projects": _flatten_to_strings(parsed.get("projects", [])),
        "experience": _flatten_to_strings(parsed.get("experience", []))
    }


def generate_questions_with_adk(profile: dict) -> list[dict]:
    prompt = (
        "Generate interview Q&A from this validated profile JSON.\n"
        "Return JSON with shape:\n"
        "{\n"
        '  "questions": [\n'
        "    {\n"
        '      "section": "skills|projects|experience",\n'
        '      "question": string,\n'
        '      "answer": string,\n'
        '      "difficulty": string,\n'
        '      "tags": [string]\n'
        "    }\n"
        "  ]\n"
        "}\n"
        "Generate around 10 items unless the profile is very sparse.\n"
        "Return JSON only.\n\n"
        f"Profile JSON:\n{json.dumps(profile, ensure_ascii=True)}"
    )

    model_output = asyncio.run(_run_model_prompt(prompt))
    parsed = _parse_json_response(model_output)
    questions = parsed.get("questions", [])
    if not isinstance(questions, list):
        return []

    normalized: list[dict] = []
    for raw in questions:
        if not isinstance(raw, dict):
            continue

        section = str(raw.get("section", "experience")).strip().lower()
        if section not in {"skills", "projects", "experience"}:
            section = "experience"

        question = str(raw.get("question", "")).strip()
        answer = str(raw.get("answer", "")).strip()
        if not question:
            continue
        if not answer:
            answer = "Candidate should explain this based on their profile."

        difficulty = str(raw.get("difficulty", "mixed")).strip()
        tags = raw.get("tags", [])
        if not isinstance(tags, list):
            tags = []

        normalized.append(
            {
                "section": section,
                "question": question,
                "answer": answer,
                "difficulty": difficulty,
                "tags": [str(tag).strip() for tag in tags if str(tag).strip()]
            }
        )

    return normalized


def _mark_job_completed(job_id: str) -> None:
    update_job(job_id, {"status": "completed", "lastError": ""})


def _handle_job_failure(job: dict, error: Exception) -> None:
    attempts = int(job.get("attempts", 1))
    error_message = str(error)

    if attempts < MAX_ATTEMPTS:
        delay = BACKOFF_SECONDS.get(attempts, BACKOFF_SECONDS[max(BACKOFF_SECONDS)])
        logging.warning(
            "job_failed_retrying jobId=%s type=%s attempts=%s delay=%ss error=%s",
            job.get("_id"),
            job.get("type"),
            attempts,
            delay,
            error_message
        )
        update_job(job["_id"], {"status": "queued", "lastError": error_message})
        time.sleep(delay)
        return

    logging.error(
        "job_failed_final jobId=%s type=%s attempts=%s error=%s",
        job.get("_id"),
        job.get("type"),
        attempts,
        error_message
    )
    update_job(job["_id"], {"status": "failed", "lastError": error_message})


def _process_parse_resume(job: dict) -> None:
    resume_id = str(job.get("resumeId", "")).strip()
    profile_id = str(job.get("profileId", "")).strip()
    if not resume_id or not profile_id:
        raise ValueError("parse_resume job missing resumeId or profileId")

    resume = fetch_resume(resume_id)
    resume_text = str(resume.get("text", "")).strip()
    if not resume_text:
        raise ValueError("Resume text is empty.")

    parsed = parse_resume_with_adk(resume_text)
    update_profile(
        profile_id,
        {
            "skills": parsed["skills"],
            "projects": parsed["projects"],
            "experience": parsed["experience"],
            "status": "parsed",
            "source": "ai"
        }
    )

    _mark_job_completed(job["_id"])
    logging.info("parse_resume_completed jobId=%s profileId=%s", job["_id"], profile_id)


def _process_generate_questions(job: dict) -> None:
    profile_id = str(job.get("profileId", "")).strip()
    if not profile_id:
        raise ValueError("generate_questions job missing profileId")

    profile = fetch_profile(profile_id)
    if profile.get("status") != "validated":
        raise ValueError("Profile must be validated before question generation.")

    normalized_profile = {
        "skills": profile.get("skills", []),
        "projects": profile.get("projects", []),
        "experience": profile.get("experience", [])
    }
    questions = generate_questions_with_adk(normalized_profile)

    save_questions(
        profile_id,
        {
            "questions": questions,
            "status": "ready",
            "promptVersion": f"adk:{AI_MODEL}"
        }
    )

    _mark_job_completed(job["_id"])
    logging.info(
        "generate_questions_completed jobId=%s profileId=%s count=%s",
        job["_id"],
        profile_id,
        len(questions)
    )


def run_worker_forever() -> None:
    logging.info("worker_started workerId=%s baseUrl=%s", WORKER_ID, API_BASE_URL)

    while True:
        job = claim_job(["parse_resume", "generate_questions"])
        if not job:
            time.sleep(POLL_INTERVAL_MS / 1000)
            continue

        logging.info(
            "job_claimed jobId=%s type=%s attempts=%s",
            job.get("_id"),
            job.get("type"),
            job.get("attempts")
        )

        try:
            if job.get("type") == "parse_resume":
                _process_parse_resume(job)
            elif job.get("type") == "generate_questions":
                _process_generate_questions(job)
            else:
                raise ValueError(f"Unsupported job type: {job.get('type')}")
        except Exception as processing_error:
            _handle_job_failure(job, processing_error)


if __name__ == "__main__":
    run_worker_forever()
