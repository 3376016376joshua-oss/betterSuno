# BetterSuno Project Context

## Product Goal

BetterSuno is building a controllable remix pipeline. The target workflow is not just
voice conversion. The product goal is:

1. Take an original song.
2. Separate it into original vocals and original instrumental.
3. Extract the original vocal performance guide: melody, rhythm, phrasing, syllable
   timing, and optionally phoneme/lyric alignment.
4. Accept user-controlled lyrics.
5. Generate a new vocal that sings the user lyrics while following the original
   song's melody, rhythm, and phrasing as closely as possible.
6. Convert that generated vocal into a target voice/timbre using Seed-VC/RVC/SVC.
7. Mix the converted vocal with the original instrumental.
8. Produce the final remix master and a report of artifacts/quality checks.

## Canonical Remix Chain

```text
original song
-> separation
   -> vocals.wav
   -> instrumental.wav
-> vocal analysis
   -> melody / pitch contour
   -> rhythm / phrase timing
   -> syllable timing
   -> optional lyric / phoneme alignment
-> user lyrics
-> lyrics fitting
   -> split lines
   -> syllable / phoneme mapping
   -> fit to original melody and rhythm
-> singing vocal generation
   -> new-vocal-guide.wav
-> Seed-VC / RVC / SVC voice conversion
   -> converted-vocals.wav
-> mix converted-vocals.wav with instrumental.wav
-> final master.wav
```

## Important Distinction

`vocals.wav` contains melody, rhythm, phonemes, lyrics, and singing style as audio,
but it is not yet a structured control representation. For the full remix goal, it
must be analyzed into a structured performance guide before user lyrics can be
matched to it.

There are two different uses of `vocals.wav`:

- Timbre-only conversion: `vocals.wav` is the source vocal passed directly to
  Seed-VC/RVC/SVC. This preserves the original lyrics, melody, rhythm, and phrasing,
  and only changes the voice/timbre.
- Full lyrics-and-timbre remix: `vocals.wav` is an analysis source. The system
  extracts melody/rhythm/phrasing from it, but cannot directly reuse its phonemes
  because those phonemes belong to the original lyrics.

## Seed-VC Role

Seed-VC is a voice conversion component, not a lyric generator, singing synthesizer,
or full remix engine.

Its role is:

```text
source vocal performance + target voice reference -> converted vocal in target timbre
```

In the current local V1 converter chain, BetterSuno uses Seed-VC as:

```text
separated vocals.wav
+ voice profile reference.wav
-> converted-vocals.wav
```

That proves the real converter integration, but it does not change lyrics. If the
source vocal and target reference are the same audio, the output is effectively a
self-reference conversion and can sound worse than the separated vocals because the
audio is re-synthesized.

For the final product chain, Seed-VC should run after the system has already
generated a new vocal guide that sings the user lyrics:

```text
new-vocal-guide.wav
+ target voice reference
-> converted-vocals.wav
```

## Current Implementation Status

Already validated locally:

- Original audio can be separated into `vocals.wav` and `instrumental.wav`.
- A real Seed-VC E2E conversion can run from the BetterSuno converter wrapper.
- `converted-vocals.wav` can be produced by the current V1 vocal conversion chain.

Still missing for the complete remix product:

- A vocal analysis stage that outputs a structured `vocal-guide.json`.
- Lyrics fitting from user-provided lyrics to the original vocal guide.
- A singing vocal generation stage that produces `new-vocal-guide.wav` for the new
  lyrics.
- A final API-integrated path that mixes `converted-vocals.wav` with
  `instrumental.wav` into `master.wav` and records a remix report.

## Recommended Artifact Model

The full chain should preserve intermediate artifacts so every stage can be debugged:

```text
stems/vocals.wav
stems/instrumental.wav
analysis/vocal-guide.json
analysis/melody.mid
analysis/alignment.TextGrid or alignment.json
lyrics/user-lyrics.txt
lyrics/fitted-lyrics.json
generation/new-vocal-guide.wav
conversion/converted-vocals.wav
mix/master.wav
report.json
```

## Implementation Guidance

When adding new remix functionality:

- Keep the separation, vocal analysis, lyric fitting, vocal generation, voice
  conversion, and mixing stages explicit. Do not collapse them into a single opaque
  step.
- Treat Seed-VC/RVC/SVC as the voice conversion stage only.
- Do not expect Seed-VC to generate new lyrics or create a new sung performance from
  text.
- If the request is "same lyrics, new timbre", the current vocal conversion chain is
  the right path.
- If the request is "new lyrics, same original rhythm/melody, target timbre", route
  through vocal analysis, lyric fitting, singing vocal generation, then Seed-VC.
- Prefer storing structured guide outputs (`vocal-guide.json`, fitted lyric maps,
  note events, alignment files) so the chain can be inspected and improved.

## Collaborative Development Guidelines

When changing the project, keep the codebase easy for multiple contributors to
extend, test, and replace in parts:

- Build stages as independent modules with explicit inputs and outputs. A stage
  should be runnable and testable without requiring the full remix pipeline.
- Prefer clear contracts over hidden coupling. Share data through typed config,
  schemas, artifact files, or well-named DTOs instead of importing internal state
  from another stage.
- Keep provider-specific integrations behind small adapters. Seed-VC, RVC, SVC,
  separation models, vocal analysis tools, and singing generation engines should be
  swappable without rewriting pipeline orchestration.
- Avoid hard-coded local paths, model names, ports, credentials, and machine-specific
  assumptions. Put environment-specific values in config files or environment
  variables, and document required defaults.
- Preserve backward-compatible artifact formats where practical. If a schema must
  change, version it and add a migration or compatibility reader.
- Make changes small and cohesive. Do not mix unrelated refactors with feature work,
  model integration, UI changes, or artifact format changes in the same patch.
- Keep side effects local to the owning stage. A module should not write into another
  stage's output directory except through the pipeline contract.
- Add focused tests or smoke checks for new behavior, especially around artifact
  creation, schema parsing, path handling, and external tool adapters.
- Document new commands, required models, expected artifacts, and failure modes near
  the code that introduces them. Future contributors should not have to reverse
  engineer a stage from logs.
- Prefer deterministic, inspectable outputs for development flows. When a model call
  is nondeterministic or expensive, provide a fixture, dry run, or cached artifact
  path for local testing.
- Keep public APIs and CLI commands stable. If a breaking change is necessary, name
  it clearly in the PR or change note and update all callers in the same change.
- Treat generated media and large artifacts as pipeline outputs, not source code.
  Store only small fixtures or metadata in git unless the repository explicitly
  defines a larger asset policy.
