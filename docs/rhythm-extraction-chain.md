# Rhythm Extraction Chain

This chain writes an independent `rhythm.json` artifact for remix timing.

## Flow

```text
vocals.wav
 -> librosa beat tracker
 -> vocal tempo estimate / beat grid
 -> RMS energy envelope
 -> silence/phrase segmentation
 -> vocal onset detection
 -> syllable-duration candidates

optional instrumental.wav or source mix
 -> diagnostic/global beat grid when explicitly requested
```

The implementation is intentionally independent from vocal conversion and vocal
guide generation:

- Python core: `services/worker/better_suno_worker/rhythm`
- Python CLI: `python -m better_suno_worker.rhythm.cli`
- Node wrapper: `scripts/lib/rhythm.js`
- V1 pipeline hook: `scripts/lib/remix-v1-vocals-pipeline.js`

## Install Analysis Dependencies

```bash
cd services/worker
python -m pip install -e '.[analysis]'
```

## Run Directly

```bash
cd services/worker
python -m better_suno_worker.rhythm.cli \
  --vocals ../../storage/remix-v1-vocals/demo/stems/vocals.wav \
  --output ../../storage/remix-v1-vocals/demo/rhythm/rhythm.json \
  --pretty
```

## Run Through V1 Vocals

```bash
node scripts/remix-v1-vocals.js ./source.mp3 \
  --extract-rhythm \
  --converter-command-json '["python","infer.py","--input","{input}","--output","{output}"]'
```

When rhythm extraction is enabled, the pipeline writes:

```text
<out-dir>/rhythm/rhythm.json
```

The API exposes it as the `rhythm` artifact when a vocal remix job includes
`extractRhythm` or `rhythmPath`.

## JSON Contract

Top-level compatibility fields mirror the first consumer shape:

```json
{
  "tempoBpm": 92.0,
  "beats": [0.41, 1.06, 1.71],
  "phrases": [{ "start": 3.2, "end": 7.8 }],
  "vocalOnsets": [3.22, 3.78, 4.31]
}
```

Structured fields are also included:

- `beatGrid`: tempo, beat times, beat intervals, and source metadata.
- `vocal.phrases`: phrase boundaries, phrase onsets, and RMS summaries.
- `vocal.syllableCandidates`: approximate vocal syllable timing slots.
- `summary`: small artifact summary for remix reports and API job responses.

The canonical remix chain treats rhythm extraction as vocal analysis, so the
default beat source is `vocals`. Use `--beat-source instrumental`, `--beat-source
mix`, or `--beat-source auto` only when a separate global beat-grid reference is
needed for diagnostics or later arrangement work.
