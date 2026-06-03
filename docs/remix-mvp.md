# Remix MVP Plan

## MVP Scope

- Authorized source tracks only.
- User-owned or explicitly approved voice profiles only.
- 30-90 second clips.
- Melody-stable covers or variants.
- Export master audio and quality report.

## Build Order

1. Scaffold the web studio and API job flow.
2. Add auth and user identity.
3. Add object storage for source audio and generated artifacts.
4. Add the first real provider adapter.
5. Add voice profile onboarding and consent records.
6. Add quality scoring and block low-quality output.
7. Add credit accounting.
8. Add share/export only after rights gates are reliable.

## Acceptance Targets

- Job creation succeeds with a valid rights confirmation.
- A 60 second remix completes within the provider SLA.
- Melody similarity score is high enough to recognize the source.
- Lyric fit avoids obvious overstuffing or broken phrasing.
- Voice similarity is recognizable without impersonating unapproved speakers.
- Failed jobs expose a useful status and do not charge the user.

## Main Risks

- Copyright licensing for source music.
- Voice consent and anti-impersonation controls.
- Lyric-to-melody alignment quality.
- Provider cost, latency, and rate limits.
- Full-song consistency after the clip MVP.
