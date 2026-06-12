# BetterSuno Worker

This worker is the Redis and Celery foundation for long-running music jobs. It is intentionally independent from the current API layer.

## Redis DB Layout

- DB 0: Celery broker.
- DB 1: Celery result backend.
- DB 2: durable-ish job state and event streams.
- DB 3: short-lived locks, rate limits, and cache entries.

## Queues

- `remix.orchestrator`: schedules a full remix workflow.
- `remix.analysis`: source BPM, key, section, and melody analysis.
- `remix.lyrics`: constrained lyric generation.
- `remix.vocal`: user voice generation or conversion.
- `remix.mixing`: mix and artifact preparation.
- `remix.quality`: quality scoring and final status.
- `remix.default`: fallback queue.

## Local Run

From the repo root:

```bash
pnpm redis:up
```

From this directory:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -e .
celery -A better_suno_worker.celery_app:celery_app worker -Q remix.orchestrator,remix.analysis,remix.lyrics,remix.vocal,remix.mixing,remix.quality,remix.default --loglevel=INFO
```

Submit a stub workflow:

```bash
python -m better_suno_worker.submit_stub
```

## Analysis CLIs

Independent analysis stages can also be run without Celery:

```bash
python -m better_suno_worker.rhythm.cli --help
python -m better_suno_worker.vocal_guide.cli --help
python -m better_suno_worker.lyrics_alignment.cli --help
```

Lyrics alignment shells out to MFA and/or WhisperX when those providers are
selected; they are intentionally optional external tools rather than baseline
worker dependencies.
