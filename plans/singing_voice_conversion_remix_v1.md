# Singing Voice Conversion Remix V1

## V1 Goal

V1 is not a full generative music remix system. The target is a minimal-change singing voice conversion remix:

```text
Keep the original instrumental
Keep the original lyrics
Keep the original melody, rhythm, pauses, and phrasing as much as possible
Only replace the original singer timbre with the selected sampled voice
```

In practical terms, this is a singing voice conversion pipeline, not a text-to-music or song-remix pipeline.

## Core Pipeline

Use the existing `scripts/separate-audio.js` flow to separate the source song:

```text
source.mp3
 -> vocals.wav
 -> instrumental.wav
```

Only send `vocals.wav` into the voice conversion model:

```text
vocals.wav
 -> SVC/RVC/voice conversion model
 -> converted-vocals.wav
```

The final step is mixing, not concatenation:

```text
instrumental.wav + converted-vocals.wav
 -> master.wav
```

The instrumental should never be sent into the voice conversion model. It is only used at the final mixing stage.

## Model Responsibility

The model should not generate accompaniment, rewrite the song, or perform music remix generation. It has one job:

```text
Preserve the source vocals' content, F0, rhythm, and timing
Replace the timbre with the target voice adapter
```

Conceptually:

```text
source vocals = what to sing and how to phrase it
target adapter = who is singing
```

The output should be:

```text
the original vocal performance rendered in the selected sampled voice
```

## SFT Positioning

SFT should not train a general "remix model". It should train a voice-specific adapter.

The service architecture should look like:

```text
base_svc_model
  + user_a_adapter
  + user_b_adapter
  + user_c_adapter
```

Each selected voice has its own adapter or voice profile. The base model is shared.

During adapter training:

```text
target user's dry singing voice
 -> extract content + F0
 -> reconstruct the same target voice
 -> update the adapter
```

During inference:

```text
source song vocals
 -> extract content + F0
 -> load selected target voice adapter
 -> output converted vocals
```

The adapter should learn the target singer's timbre, vocal color, resonance, and singing-voice characteristics. It should not learn a specific source song.

## Sampling Data

The target user should sing, not only read text aloud.

Recommended data mix:

```text
70%-90% singing
10%-30% reading or speaking
```

Speaking data can help with speaker identity and pronunciation, but it cannot replace singing data. Singing data is needed for pitch range, sustained vowels, vibrato, breath, transitions, and high/low register behavior.

The target user does not need to sing the exact source song. The original lyrics, melody, rhythm, and phrasing come from the separated source vocals at inference time.

Good sampling material includes:

- Dry vocal recordings without accompaniment bleed.
- Scales and simple melodic phrases.
- Sustained vowels.
- Low, middle, and high notes.
- Natural singing phrases.
- Fast lyric passages for articulation.
- Optional reading samples for extra phoneme coverage.

Avoid training on full mixed songs, heavy reverb, autotune, compression, background vocals, or clips with strong instrumental leakage.

## Adapter Storage

Adapters should not live in user browser memory or user device memory. They should be treated as model artifacts and stored centrally.

Recommended production layout:

```text
Object storage:
  adapter files
  feature index
  config
  quality report

Database:
  voice_profile_id
  owner_user_id
  base_model_version
  adapter_uri
  index_uri
  config_uri
  status
  checksum
  consent status
  quality score

GPU worker:
  download adapter on demand
  cache locally or in GPU memory only while useful
```

Example artifact layout:

```text
s3://better-suno/voice-profiles/user_123/profile_abc/v1/adapter.safetensors
s3://better-suno/voice-profiles/user_123/profile_abc/v1/index.faiss
s3://better-suno/voice-profiles/user_123/profile_abc/v1/config.json
s3://better-suno/voice-profiles/user_123/profile_abc/v1/quality_report.json
```

In local development, this can start as:

```text
storage/voice-profiles/profile_abc/
  adapter.safetensors
  index.faiss
  config.json
  quality_report.json
```

Adapters should be treated as sensitive data because they represent a person's voice identity.

## Training Infrastructure

GPU platforms such as AutoDL should act as backend training workers. Users should not upload data directly to the GPU platform.

Recommended flow:

```text
User uploads voice samples
 -> API stores samples in object storage
 -> API creates a training job
 -> GPU worker pulls input data
 -> GPU worker trains the adapter
 -> GPU worker uploads adapter artifacts
 -> API marks the voice profile as ready
```

The base model should not be uploaded for every training job. It should be preloaded through one of these approaches:

- Baked into the training image.
- Stored on a persistent GPU-platform disk.
- Stored in object storage and downloaded/cached by the worker.

For V1, the simplest approach is to keep one long-running GPU training instance with the base model already cached, then run a worker process that polls training jobs.

Later, this can evolve into ephemeral GPU jobs:

```text
create GPU instance
 -> run bootstrap script
 -> train adapter
 -> upload artifacts
 -> shut down or release instance
```

## Compute Cost Strategy

Training one adapter per user has real compute and waiting-time costs, but the cost is per voice profile, not per remix.

Correct usage model:

```text
Create voice profile once
 -> train adapter once
 -> reuse adapter for many remix jobs
```

Future product strategy can use a hybrid flow:

```text
zero-shot conversion = fast preview
adapter SFT = higher-quality background training
```

This keeps the user experience responsive while still allowing higher-quality voice profiles.

## Agentic RL Role

Agentic RL should not be used first to train the audio model directly. It is better suited as a pipeline optimizer and candidate selector.

The agent can choose and tune:

- Separation model or separation parameters.
- Vocal cleanup strength.
- F0 extractor.
- SVC inference parameters.
- Checkpoint or adapter version.
- Vocal gain.
- EQ/compression/limiter settings.
- Final mix balance.

Each episode can run:

```text
choose parameters
 -> separate
 -> convert vocals
 -> mix
 -> score result
 -> update policy or choose next attempt
```

Possible reward signals:

- Speaker similarity to the selected target voice.
- F0 similarity to the source vocals.
- Timing and duration similarity.
- Lyric intelligibility.
- Low accompaniment leakage in `converted-vocals.wav`.
- Low clipping/noise.
- Good vocal-to-instrumental balance.

In short:

```text
SFT trains the voice
Agentic RL trains the selection and orchestration strategy
```

## Recommended Implementation Order

1. Use `scripts/separate-audio.js` to produce `vocals.wav` and `instrumental.wav`.
2. Connect one existing SVC/RVC inference engine.
3. Feed `vocals.wav` into the model and produce `converted-vocals.wav`.
4. Use FFmpeg or an equivalent audio mixer to combine `instrumental.wav` and `converted-vocals.wav`.
5. Add basic quality checks:
   - Output exists and is non-empty.
   - Duration drift is within tolerance.
   - No obvious clipping.
   - `converted-vocals.wav` has low accompaniment leakage.
6. Train the first sampled-voice adapter using clean singing data.
7. Add voice profile storage and adapter metadata.
8. Add asynchronous training jobs through a GPU worker.
9. Add adapter loading and caching during inference.
10. Add agentic parameter search only after the deterministic pipeline works.

## One-Sentence Summary

V1 should separate the source song, send only the vocal stem into a singing voice conversion model, use SFT to train one adapter per selected voice, store adapters centrally as voice-profile artifacts, and mix the converted dry vocal back with the original instrumental.
