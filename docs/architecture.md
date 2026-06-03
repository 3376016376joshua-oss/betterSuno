# Platform Architecture

## Why This Helps Remix

The remix feature is not a single model call. It needs source analysis, vocal or stem extraction, melody guidance, constrained lyric writing, user voice generation, mixing, quality scoring, storage, and rights checks. The platform should treat that as an asynchronous job pipeline with swappable music providers.

## Core Services

- Web studio: user-facing creation, voice selection, rights confirmation, generation status, playback, and export.
- Product API: authenticated endpoints, job creation, provider selection, and artifact metadata.
- Remix pipeline: source analysis, lyrics, vocal generation, mix, master, and quality scoring.
- Provider adapters: Mureka, Eleven Music, Stable Audio, self-hosted models, and a stub provider for local development.
- Storage: audio masters, vocals, stems, waveform data, quality reports, and source metadata.
- Ledger: credits, model multiplier, generation seconds, retry policy, and refunds.
- Rights layer: source confirmation, voice consent, policy flags, audit events, and takedown records.

## Remix Pipeline

1. Validate source rights and voice consent.
2. Analyze the source track for BPM, key, sections, and melody guide.
3. Separate stems when the provider or product flow requires it.
4. Generate lyrics constrained by syllables, stress, phrase boundaries, and language.
5. Generate or convert vocals into the approved user voice profile.
6. Mix vocals with the instrumental or regenerated backing.
7. Score melody similarity, lyric fit, voice similarity, and mix readiness.
8. Store artifacts and expose them through the job API.

## First Provider Strategy

Use the stub provider for UI and API development. Add Mureka first for remix-specific endpoints. Add Eleven Music or Stable Audio for broader music generation once the base creation flow is stable. Keep self-hosted models behind the same adapter interface for later cost reduction and differentiation.

## Current Scaffold

- `POST /v1/remix/jobs`: creates an in-memory remix job.
- `GET /v1/remix/jobs/:id`: checks job status and artifacts.
- `GET /health`: confirms API and provider status.

The in-memory job store is intentional for the scaffold. Replace it with PostgreSQL plus Redis or BullMQ before beta.
