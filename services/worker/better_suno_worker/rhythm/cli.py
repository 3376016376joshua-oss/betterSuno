from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

from .analysis import RhythmExtractionConfig, extract_rhythm


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Extract BetterSuno rhythm JSON from remix stems.")
    parser.add_argument("--vocals", required=True, help="Separated vocal stem audio file.")
    parser.add_argument("--instrumental", help="Separated instrumental stem for song beat grid.")
    parser.add_argument("--mix", help="Original mix fallback for song beat grid.")
    parser.add_argument("--output", required=True, help="Output rhythm JSON path.")
    parser.add_argument("--sample-rate", type=int, default=22050)
    parser.add_argument("--hop-length", type=int, default=512)
    parser.add_argument("--frame-length", type=int, default=2048)
    parser.add_argument(
        "--beat-source",
        choices=["vocals", "instrumental", "mix", "auto"],
        default="vocals",
        help="Audio source for beat grid estimation. Defaults to vocals for the canonical vocal analysis chain.",
    )
    parser.add_argument("--beat-tightness", type=float, default=100.0)
    parser.add_argument("--beat-trim", action="store_true")
    parser.add_argument("--start-bpm", type=float)
    parser.add_argument("--energy-percentile", type=float, default=65.0)
    parser.add_argument("--phrase-gap-seconds", type=float, default=0.45)
    parser.add_argument("--min-phrase-duration-seconds", type=float, default=0.25)
    parser.add_argument("--min-syllable-duration-seconds", type=float, default=0.06)
    parser.add_argument("--onset-delta", type=float, default=0.07)
    parser.add_argument("--onset-wait", type=int, default=1)
    parser.add_argument("--pretty", action="store_true", help="Pretty-print JSON output.")
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    config = RhythmExtractionConfig(
        sample_rate=args.sample_rate,
        hop_length=args.hop_length,
        frame_length=args.frame_length,
        beat_source=args.beat_source,
        beat_tightness=args.beat_tightness,
        beat_trim=args.beat_trim,
        start_bpm=args.start_bpm,
        energy_percentile=args.energy_percentile,
        phrase_gap_seconds=args.phrase_gap_seconds,
        min_phrase_duration_seconds=args.min_phrase_duration_seconds,
        min_syllable_duration_seconds=args.min_syllable_duration_seconds,
        onset_delta=args.onset_delta,
        onset_wait=args.onset_wait,
    )

    rhythm = extract_rhythm(
        args.vocals,
        instrumental_path=args.instrumental,
        mix_path=args.mix,
        config=config,
    )

    output_path = Path(args.output).expanduser().resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(rhythm, ensure_ascii=False, indent=2 if args.pretty else None) + "\n",
        encoding="utf-8",
    )

    summary = {
        "output": str(output_path),
        **rhythm["summary"],
    }
    print(json.dumps(summary, ensure_ascii=False))

    return 0


if __name__ == "__main__":
    sys.exit(main())
