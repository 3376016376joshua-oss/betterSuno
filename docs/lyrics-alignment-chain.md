# Lyrics / Phoneme Alignment Chain

This chain creates a source-vocal alignment artifact from separated vocals and,
when available, the original lyrics. It is independent from voice conversion and
from replacement-lyric slot fitting.

## Flow

With original lyrics:

```text
stems/vocals.wav + lyrics/original-lyrics.txt
 -> MFA align_one
 -> alignment/lyrics-alignment.json
 -> alignment/lyrics-alignment.TextGrid
```

Without original lyrics:

```text
stems/vocals.wav
 -> WhisperX ASR + word alignment
 -> optional MFA align_one using the ASR transcript
 -> alignment/lyrics-alignment.json
 -> alignment/lyrics-alignment.TextGrid
```

The implementation keeps provider details behind a small Python API:

- Python core: `services/worker/better_suno_worker/lyrics_alignment`
- Python CLI: `python -m better_suno_worker.lyrics_alignment.cli`
- Node wrapper: `scripts/lib/lyrics-alignment.js`
- V1 pipeline hook: `scripts/lib/remix-v1-vocals-pipeline.js`

MFA's single-file workflow is `mfa align_one SOUND_FILE_PATH TEXT_FILE_PATH
DICTIONARY_PATH ACOUSTIC_MODEL_PATH OUTPUT_PATH`, with output formats including
TextGrid, JSON, and CSV. WhisperX is used for missing-lyrics ASR and word-level
timestamps. For singing, both can drift and should be treated as alignment
candidates that may need correction.

References:

- [MFA align_one documentation](https://montreal-forced-aligner.readthedocs.io/en/stable/user_guide/workflows/alignment.html)
- [WhisperX command-line usage](https://github.com/m-bain/whisperx)

## Run Directly

Forced alignment with known original lyrics:

```bash
cd services/worker
python -m better_suno_worker.lyrics_alignment.cli \
  --vocals ../../storage/remix-v1-vocals/demo/stems/vocals.wav \
  --lyrics-file ../../storage/remix-v1-vocals/demo/lyrics/original-lyrics.txt \
  --provider mfa \
  --mfa-dictionary english_us_arpa \
  --mfa-acoustic-model english_us_arpa \
  --output ../../storage/remix-v1-vocals/demo/alignment/lyrics-alignment.json \
  --textgrid-output ../../storage/remix-v1-vocals/demo/alignment/lyrics-alignment.TextGrid \
  --pretty
```

ASR first, then MFA for phoneme timestamps:

```bash
cd services/worker
python -m better_suno_worker.lyrics_alignment.cli \
  --vocals ../../storage/remix-v1-vocals/demo/stems/vocals.wav \
  --provider whisperx-mfa \
  --mfa-dictionary english_us_arpa \
  --mfa-acoustic-model english_us_arpa \
  --whisperx-model large-v3 \
  --whisperx-device cpu \
  --output ../../storage/remix-v1-vocals/demo/alignment/lyrics-alignment.json \
  --textgrid-output ../../storage/remix-v1-vocals/demo/alignment/lyrics-alignment.TextGrid \
  --pretty
```

ASR-only fallback, useful when MFA resources are unavailable:

```bash
cd services/worker
python -m better_suno_worker.lyrics_alignment.cli \
  --vocals ../../storage/remix-v1-vocals/demo/stems/vocals.wav \
  --provider whisperx \
  --output ../../storage/remix-v1-vocals/demo/alignment/lyrics-alignment.json \
  --textgrid-output ../../storage/remix-v1-vocals/demo/alignment/lyrics-alignment.TextGrid \
  --pretty
```

The ASR-only path usually has `phones: []`; use `--require-phones` when the
downstream stage must have phoneme timestamps.

For mixed Chinese/English lyrics, the MFA adapter defaults to a lightweight
transcript normalization pass before writing the MFA transcript file: CJK
characters are spaced as individual tokens, Latin words are preserved, and
punctuation is dropped. Disable this with `--no-mfa-normalize-transcript` if a
custom dictionary expects a different tokenization.

## Run Through V1 Vocals

```bash
node scripts/remix-v1-vocals.js ./source.mp3 \
  --original-lyrics-file ./lyrics/original-lyrics.txt \
  --lyrics-alignment-provider mfa \
  --mfa-dictionary english_us_arpa \
  --mfa-acoustic-model english_us_arpa \
  --require-lyrics-alignment-phones \
  --converter-command-json '["python","infer.py","--input","{input}","--output","{output}"]'
```

When enabled, the pipeline writes:

```text
<out-dir>/alignment/lyrics-alignment.json
<out-dir>/alignment/lyrics-alignment.TextGrid
```

The API exposes these artifacts:

```text
lyrics-alignment
lyrics-alignment-textgrid
```

## JSON Contract

Top-level fields:

- `transcript`: original lyrics or ASR transcript used by the provider.
- `words`: word timestamps with optional confidence and nested phone spans.
- `phones`: flat phoneme timestamps with `wordId` links.
- `quality`: counts, booleans for word/phone timestamps, and warnings.
- `provider`: command/provider metadata so runs can be audited.

This artifact can feed the full remix chain's later lyric fitting stage by
providing source word and phone timing independent from melody/rhythm extraction.
