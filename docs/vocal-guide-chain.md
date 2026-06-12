# Vocal Guide Chain

This chain turns a separated vocal stem plus replacement lyrics into a reusable
`vocal-guide.json` artifact. It is not the same as source lyric / phoneme
forced alignment. For original-lyrics timestamps, use
`docs/lyrics-alignment-chain.md`.

For full-song BPM and beat-grid extraction, use the independent rhythm chain in
`docs/rhythm-extraction-chain.md`. The vocal guide keeps its own vocal onsets
and lyric slots, while `rhythm.json` is the plug-in artifact for remix timing.

## Flow

```text
vocals.wav
 -> pYIN F0 extraction
 -> RMS energy + onset extraction
 -> phrase detection
 -> syllable slot segmentation
 -> vocal-guide.json + melody.mid + alignment.base.json/TextGrid
replacement lyrics + vocal-guide.json
 -> replacement lyric syllable estimate
 -> syllable/slot fit check
 -> syllable-map.json + alignment.fitted.json/TextGrid
original lyrics + vocals.wav
 -> source forced alignment
 -> lyrics-alignment.json + lyrics-alignment.TextGrid
```

The implementation is independent from the converter:

- Python core: `services/worker/better_suno_worker/vocal_guide`
- Python CLI: `python -m better_suno_worker.vocal_guide.cli`
- Node wrapper: `scripts/lib/vocal-guide.js`
- V1 pipeline hook: `scripts/lib/remix-v1-vocals-pipeline.js`

The source lyric / phoneme alignment stage is separate:

- Python core: `services/worker/better_suno_worker/lyrics_alignment`
- Node wrapper: `scripts/lib/lyrics-alignment.js`
- Docs: `docs/lyrics-alignment-chain.md`

## Install Analysis Dependencies

```bash
cd services/worker
python -m pip install -e '.[analysis]'
```

## Run Directly

Analyze vocals once and cache the reusable guide artifacts:

```bash
cd services/worker
python -m better_suno_worker.vocal_guide.cli \
  --vocals ../../storage/remix-v1-vocals/demo/stems/vocals.wav \
  --output ../../storage/remix-v1-vocals/demo/guide/vocal-guide.json \
  --melody-midi-output ../../storage/remix-v1-vocals/demo/guide/melody.mid \
  --alignment-json-output ../../storage/remix-v1-vocals/demo/guide/alignment.base.json \
  --alignment-textgrid-output ../../storage/remix-v1-vocals/demo/guide/alignment.base.TextGrid \
  --pretty
```

Fit replacement lyrics without rerunning pYIN:

```bash
cd services/worker
python -m better_suno_worker.vocal_guide.fit_cli \
  --guide ../../storage/remix-v1-vocals/demo/guide/vocal-guide.json \
  --lyrics "new words for the same melodic rhythm" \
  --output ../../storage/remix-v1-vocals/demo/guide/vocal-guide.fitted.json \
  --syllable-map-output ../../storage/remix-v1-vocals/demo/guide/syllable-map.json \
  --alignment-json-output ../../storage/remix-v1-vocals/demo/guide/alignment.fitted.json \
  --alignment-textgrid-output ../../storage/remix-v1-vocals/demo/guide/alignment.fitted.TextGrid \
  --pretty
```

## Run Through V1 Vocals

```bash
node scripts/remix-v1-vocals.js ./source.mp3 \
  --guide-lyrics "new words for the same melodic rhythm" \
  --vocal-guide-max-mismatch-ratio 0.2 \
  --converter-command-json '["python","infer.py","--input","{input}","--output","{output}"]'
```

When guide generation is enabled, the pipeline writes:

```text
<out-dir>/guide/vocal-guide.json
<out-dir>/guide/melody.mid
<out-dir>/guide/alignment.json
<out-dir>/guide/alignment.TextGrid
<out-dir>/guide/syllable-map.json
```

The API exposes these artifacts when a vocal remix job includes `guideLyrics`,
`guideLyricsPath`, or `generateVocalGuide`:

```text
vocal-guide
melody-midi
alignment-json
alignment-textgrid
syllable-map
```

## JSON Contract

Top-level fields:

- `melody`: pYIN F0 frame contour and summary stats.
- `rhythm`: RMS energy summary, onset times, and detected phrases.
- `slots`: simple syllable slots derived from phrase boundaries and onsets.
- `lyrics`: replacement lyric syllables from the lightweight tokenizer.
- `fit`: slot count versus lyric syllable count, including `isAcceptable`.
- `guide.assignments`: slot-to-syllable mapping with pitch summaries.

Additional artifacts:

- `melody.mid`: monophonic slot-level MIDI derived from each slot's median pitch.
- `alignment.*`: phrase and replacement-syllable intervals for singing generation.
- `syllable-map.json`: compact lyric-to-slot assignment contract.

Do not treat `alignment.*` from this vocal guide chain as phoneme-level source
lyrics alignment. It is a slot map for replacement lyrics. The phoneme-aware
source artifact is `lyrics-alignment.json`.

The slot tokenizer is deliberately simple. It treats CJK characters as one
syllable each and estimates Latin word syllables from vowel groups. Replace
`split_lyric_syllables` when a stronger language-specific tokenizer is ready.
