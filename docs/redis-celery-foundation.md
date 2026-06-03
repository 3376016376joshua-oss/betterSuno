# Redis and Celery Foundation

## Goal

Build an async execution layer before wiring it into the current API. The worker layer should be able to accept a remix payload, fan it through staged queues, update job state in Redis, and return artifacts and quality data when real providers are added.

## Redis Layout

- `redis://localhost:6379/0`: Celery broker messages.
- `redis://localhost:6379/1`: Celery result backend.
- `redis://localhost:6379/2`: job state, event streams, and workflow metadata.
- `redis://localhost:6379/3`: locks, rate limits, and short-lived cache.

Keep these DBs separate so broker churn does not mix with product job state.

## Queues

- `remix.orchestrator`: schedules the workflow chain.
- `remix.analysis`: source BPM, key, section, and melody extraction.
- `remix.lyrics`: constrained lyrics and syllable maps.
- `remix.vocal`: user voice generation or voice conversion.
- `remix.mixing`: mix, master, and artifact assembly.
- `remix.quality`: melody, lyric, voice, and mix scoring.
- `remix.default`: fallback route.

## Job State Keys

- `jobs:remix:{job_id}`: Redis hash with status, stage, request, updated timestamp, and latest stage data.
- `jobs:remix:{job_id}:events`: Redis stream with append-only job events for UI progress and debugging.

State is currently kept for seven days via TTL. Long-term product history should live in PostgreSQL once the API is wired in.

## Reliability Defaults

- JSON-only task payloads.
- `task_acks_late=True` so a task is acknowledged after work completes.
- `task_reject_on_worker_lost=True` so lost workers do not silently drop work.
- `worker_prefetch_multiplier=1` to avoid one worker reserving too many long-running jobs.
- Redis visibility timeout defaults to one hour.
- Task soft time limit defaults to five minutes; hard time limit defaults to six minutes.

## Future API Integration

The API should not run remix work inline. It should:

1. Validate rights, user, credits, and payload shape.
2. Write durable job metadata to PostgreSQL.
3. Submit `better_suno.remix.enqueue_pipeline` to `remix.orchestrator`.
4. Read progress from Redis for realtime UI updates.
5. Persist final artifacts from Redis/Celery back into PostgreSQL and object storage metadata.

## Local Commands

```bash
pnpm redis:up
cd services/worker
python3 -m venv .venv
source .venv/bin/activate
pip install -e .
celery -A better_suno_worker.celery_app:celery_app worker -Q remix.orchestrator,remix.analysis,remix.lyrics,remix.vocal,remix.mixing,remix.quality,remix.default --loglevel=INFO
```

Submit a stub workflow:

```bash
python -m better_suno_worker.submit_stub
```
