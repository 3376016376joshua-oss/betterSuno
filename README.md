# BetterSuno

BetterSuno is a remix-first AI music platform scaffold. The product goal is to let a user create an authorized remix or cover that keeps the source melody recognizable, adapts the lyrics, and sings with the user's approved voice.

## Architecture

- `apps/web`: Next.js remix studio UI.
- `apps/api`: TypeScript API server and remix job pipeline.
- `services/worker`: Python Celery worker foundation for async remix jobs.
- `packages/shared`: Shared request, response, job, and provider types.
- `docs`: Product and technical notes for the remix MVP.

## MVP Principle

Start with an API-first pipeline and short clips:

1. Accept an authorized source track or a platform-provided licensed track.
2. Generate a 30-90 second remix draft.
3. Keep the melody guide stable while allowing lyric changes.
4. Use only a verified user voice profile.
5. Keep provider adapters swappable so Mureka, Eleven Music, Stable Audio, or self-hosted models can be added later.

## Local Setup

```bash
pnpm install
pnpm dev
```

The API defaults to `http://localhost:4000`. The web app defaults to `http://localhost:3000`.

Copy `.env.example` to `.env` before connecting real providers.

## Worker Foundation

Redis and Celery are scaffolded as an independent task layer. This does not yet connect to the API.

```bash
pnpm redis:up
cd services/worker
python3 -m venv .venv
source .venv/bin/activate
pip install -e .
celery -A better_suno_worker.celery_app:celery_app worker -Q remix.orchestrator,remix.analysis,remix.lyrics,remix.vocal,remix.mixing,remix.quality,remix.default --loglevel=INFO
```

In another terminal:

```bash
cd services/worker
source .venv/bin/activate
python -m better_suno_worker.submit_stub
```
