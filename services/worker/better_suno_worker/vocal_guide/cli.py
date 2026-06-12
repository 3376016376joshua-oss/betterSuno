from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

from .analysis import VocalGuideConfig, generate_vocal_guide
from .exporters import (
    build_alignment_payload,
    build_syllable_map_payload,
    write_json,
    write_melody_midi,
    write_textgrid,
)


def _read_lyrics(args: argparse.Namespace) -> str:
    if args.lyrics_file:
        return Path(args.lyrics_file).expanduser().read_text(encoding="utf-8")

    return args.lyrics or ""


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Generate a BetterSuno vocal guide JSON file.")
    parser.add_argument("--vocals", required=True, help="Separated vocal stem audio file.")
    parser.add_argument("--output", required=True, help="Output vocal-guide JSON path.")
    parser.add_argument("--melody-midi-output", help="Optional melody MIDI output path.")
    parser.add_argument("--alignment-json-output", help="Optional alignment JSON output path.")
    parser.add_argument("--alignment-textgrid-output", help="Optional Praat TextGrid output path.")
    parser.add_argument("--syllable-map-output", help="Optional syllable map JSON output path.")
    parser.add_argument("--lyrics", help="Replacement lyric text to align against vocal slots.")
    parser.add_argument("--lyrics-file", help="UTF-8 text file containing replacement lyrics.")
    parser.add_argument("--language", default="auto", help="Lyric language hint. Defaults to auto.")
    parser.add_argument("--sample-rate", type=int, default=22050)
    parser.add_argument("--hop-length", type=int, default=256)
    parser.add_argument("--frame-length", type=int, default=2048)
    parser.add_argument("--fmin", default="C2")
    parser.add_argument("--fmax", default="C7")
    parser.add_argument("--energy-percentile", type=float, default=65.0)
    parser.add_argument("--phrase-gap-seconds", type=float, default=0.45)
    parser.add_argument("--min-phrase-duration-seconds", type=float, default=0.25)
    parser.add_argument("--min-slot-duration-seconds", type=float, default=0.08)
    parser.add_argument("--max-slot-duration-seconds", type=float, default=0.8)
    parser.add_argument("--slot-subdivision-seconds", type=float, default=0.34)
    parser.add_argument("--max-mismatch-ratio", type=float, default=0.2)
    parser.add_argument(
        "--require-match",
        action="store_true",
        help="Exit non-zero when lyric syllable count is outside the accepted mismatch ratio.",
    )
    parser.add_argument("--pretty", action="store_true", help="Pretty-print JSON output.")
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    config = VocalGuideConfig(
        sample_rate=args.sample_rate,
        hop_length=args.hop_length,
        frame_length=args.frame_length,
        fmin=args.fmin,
        fmax=args.fmax,
        energy_percentile=args.energy_percentile,
        phrase_gap_seconds=args.phrase_gap_seconds,
        min_phrase_duration_seconds=args.min_phrase_duration_seconds,
        min_slot_duration_seconds=args.min_slot_duration_seconds,
        max_slot_duration_seconds=args.max_slot_duration_seconds,
        slot_subdivision_seconds=args.slot_subdivision_seconds,
        max_mismatch_ratio=args.max_mismatch_ratio,
    )

    guide = generate_vocal_guide(
        args.vocals,
        lyrics_text=_read_lyrics(args),
        language=args.language,
        config=config,
    )

    output_path = write_json(args.output, guide, pretty=args.pretty)
    melody_midi_output = write_melody_midi(guide, args.melody_midi_output) if args.melody_midi_output else None
    alignment_json_output = (
        write_json(args.alignment_json_output, build_alignment_payload(guide), pretty=args.pretty)
        if args.alignment_json_output
        else None
    )
    alignment_textgrid_output = (
        write_textgrid(guide, args.alignment_textgrid_output) if args.alignment_textgrid_output else None
    )
    syllable_map_output = (
        write_json(args.syllable_map_output, build_syllable_map_payload(guide), pretty=args.pretty)
        if args.syllable_map_output
        else None
    )

    summary = {
        "output": output_path,
        "melodyMidiOutput": melody_midi_output,
        "alignmentJsonOutput": alignment_json_output,
        "alignmentTextGridOutput": alignment_textgrid_output,
        "syllableMapOutput": syllable_map_output,
        "phraseCount": len(guide["rhythm"]["phrases"]),
        "slotCount": len(guide["slots"]),
        "lyricSyllableCount": guide["lyrics"]["syllableCount"],
        "fit": guide["fit"]["status"],
        "isAcceptable": guide["fit"]["isAcceptable"],
    }
    print(json.dumps(summary, ensure_ascii=False))

    if args.require_match and not guide["fit"]["isAcceptable"]:
        return 2

    return 0


if __name__ == "__main__":
    sys.exit(main())
