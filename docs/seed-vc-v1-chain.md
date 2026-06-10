# Seed-VC V1 Converter Chain

Seed-VC V1 is the recommended no-training converter path for validating the BetterSuno V1 vocal remix chain. It is not the final trained voice-profile strategy, but it lets the product pipeline run with a real voice conversion model before SVC/RVC adapter training is ready.

## What This Chain Does

```text
source audio
 -> BetterSuno separates vocals and instrumental
 -> Seed-VC converts the separated vocal stem with a target reference voice
 -> BetterSuno stores converted-vocals.wav as the vocal remix artifact
```

Seed-VC writes generated audio into an output directory. BetterSuno expects a converter command to write exactly to `{output}`, so this repo provides a wrapper:

```text
scripts/converters/seed-vc-v1-wrapper.js
```

The wrapper runs Seed-VC, finds the newest generated audio file, and copies it to `{output}`.

## Prepare Seed-VC

Clone and install Seed-VC outside this repo:

```bash
git clone https://github.com/Plachtaa/seed-vc.git /path/to/seed-vc
cd /path/to/seed-vc
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Use a clean, authorized target reference recording. For singing conversion, the reference should preferably include singing rather than only speech.

## Voice Profile Layout

Create a local profile:

```text
storage/voice-profiles/seed-vc-demo/
  profile.json
  reference.wav
```

Example `profile.json`:

```json
{
  "id": "seed-vc-demo",
  "displayName": "Seed-VC Demo",
  "converterMode": "custom",
  "modelPath": "reference.wav",
  "converterCommandJson": "[\"node\",\"scripts/converters/seed-vc-v1-wrapper.js\",\"--seed-vc-dir\",\"/path/to/seed-vc\",\"--python\",\"/path/to/seed-vc/.venv/bin/python\",\"--target\",\"{voiceModel}\",\"--input\",\"{input}\",\"--output\",\"{output}\",\"--diffusion-steps\",\"30\",\"--f0-condition\",\"True\"]"
}
```

`modelPath` points to the target reference audio because Seed-VC is zero-shot. The BetterSuno `{voiceModel}` placeholder becomes that reference file path.

## Direct Script Test

Run the V1 vocals script against a real source song:

```bash
node scripts/remix-v1-vocals.js ./source.mp3 \
  --voice-profile seed-vc-demo \
  --voice-model ./storage/voice-profiles/seed-vc-demo/reference.wav \
  --converter-command-json '["node","scripts/converters/seed-vc-v1-wrapper.js","--seed-vc-dir","/path/to/seed-vc","--python","/path/to/seed-vc/.venv/bin/python","--target","{voiceModel}","--input","{input}","--output","{output}","--diffusion-steps","30","--f0-condition","True"]'
```

Expected outputs:

```text
storage/remix-v1-vocals/<source-name>/stems/vocals.wav
storage/remix-v1-vocals/<source-name>/stems/instrumental.wav
storage/remix-v1-vocals/<source-name>/conversion/converted-vocals.wav
```

## API E2E Test

After the profile exists, run:

```bash
node scripts/test-v1-vocals-e2e.js ./source.mp3 \
  --voice-profile seed-vc-demo \
  --converter-mode custom
```

The API should return a completed job with these artifacts:

```text
vocals
instrumental
converted-vocals
```

## Notes

- This validates a real converter path, but it does not replace trained SVC/RVC adapters for production voice profiles.
- If Seed-VC changes CLI flags, keep the wrapper stable and pass new flags through repeated `--extra-arg` values.
- The current API chain stops at `converted-vocals.wav`; final `master.wav` mixing belongs to the next implementation step.
