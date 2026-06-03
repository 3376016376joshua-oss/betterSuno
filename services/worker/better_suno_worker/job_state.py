import json
from datetime import UTC, datetime
from typing import Any

from redis import Redis

from .config import settings
from .schemas import JobStatus, RemixJobPayload

_state_client: Redis | None = None


def get_state_client() -> Redis:
    global _state_client
    if _state_client is None:
        _state_client = Redis.from_url(settings.redis_state_url, decode_responses=True)
    return _state_client


def utc_now() -> str:
    return datetime.now(tz=UTC).isoformat()


def job_key(job_id: str) -> str:
    return f"jobs:remix:{job_id}"


def job_events_key(job_id: str) -> str:
    return f"jobs:remix:{job_id}:events"


def encode_mapping(data: dict[str, Any]) -> dict[str, str]:
    encoded: dict[str, str] = {}
    for key, value in data.items():
        if isinstance(value, str):
            encoded[key] = value
        else:
            encoded[key] = json.dumps(value, ensure_ascii=True)
    return encoded


def create_job_state(job: RemixJobPayload, root_task_id: str | None = None) -> None:
    now = utc_now()
    payload = {
        "job_id": job.job_id,
        "status": "queued",
        "stage": "queued",
        "root_task_id": root_task_id,
        "request": job.model_dump(mode="json"),
        "created_at": now,
        "updated_at": now,
    }
    client = get_state_client()
    client.hset(job_key(job.job_id), mapping=encode_mapping(payload))
    client.expire(job_key(job.job_id), settings.job_state_ttl_seconds)
    append_job_event(job.job_id, "job.created", payload)


def update_job_status(
    job_id: str,
    status: JobStatus,
    stage: str,
    data: dict[str, Any] | None = None,
) -> None:
    now = utc_now()
    payload = {
        "status": status,
        "stage": stage,
        "updated_at": now,
        "data": data or {},
    }
    client = get_state_client()
    client.hset(job_key(job_id), mapping=encode_mapping(payload))
    client.expire(job_key(job_id), settings.job_state_ttl_seconds)
    append_job_event(job_id, f"job.{stage}", payload)


def append_job_event(job_id: str, event_type: str, payload: dict[str, Any]) -> None:
    client = get_state_client()
    event = {
        "type": event_type,
        "payload": json.dumps(payload, ensure_ascii=True),
        "created_at": utc_now(),
    }
    client.xadd(job_events_key(job_id), event, maxlen=100, approximate=True)
    client.expire(job_events_key(job_id), settings.job_state_ttl_seconds)
