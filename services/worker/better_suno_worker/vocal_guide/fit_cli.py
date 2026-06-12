from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

from .exporters import build_alignment_payload, build_syllable_map_payload, write_json, write_textgrid
from .fitting import fit_lyrics_to_guide


def _read_lyrics(args: argparse.Namespace) -> str:
    if args.lyrics_file:
        return Path(args.lyrics_file).expanduser().read_text(encoding="utf-8")

    return args.lyrics or ""


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Fit replacement lyrics onto an existing vocal guide.")
    parser.add_argument("--guide", required=True, help="Existing vocal-guide JSON path from analyze-vocals.")
    parser.add_argument("--lyrics", help="Replacement lyric text to align against vocal slots.")
    parser.add_argument("--lyrics-file", help="UTF-8 text file containing replacement lyrics.")
    parser.add_argument("--output", help="Optional fitted vocal-guide JSON path.")
    parser.add_argument("--syllable-map-output", required=True, help="Output syllable map JSON path.")
    parser.add_argument("--alignment-json-output", help="Optional fitted alignment JSON output path.")
    parser.add_argument("--alignment-textgrid-output", help="Optional fitted Praat TextGrid output path.")
    parser.add_argument("--language", default="auto", help="Lyric language hint. Defaults to auto.")
    parser.add_argument("--max-mismatch-ratio", type=float, default=0.2)
    parser.add_argument(
        "--require-match",
        action="store_true",
        help="Exit non-zero when lyric syllable count is outside the accepted mismatch ratio.",
    )
    parser.add_argument("--pretty", action="store_true", help="Pretty-print JSON outputs.")
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    guide = json.loads(Path(args.guide).expanduser().read_text(encoding="utf-8"))
    fitted = fit_lyrics_to_guide(
        guide,
        lyrics_text=_read_lyrics(args),
        language=args.language,
        max_mismatch_ratio=args.max_mismatch_ratio,
    )

    fitted_guide_output = write_json(args.output, fitted, pretty=args.pretty) if args.output else None
    syllable_map_output = write_json(
        args.syllable_map_output,
        build_syllable_map_payload(fitted),
        pretty=args.pretty,
    )
    alignment_json_output = (
        write_json(args.alignment_json_output, build_alignment_payload(fitted), pretty=args.pretty)
        if args.alignment_json_output
        else None
    )
    alignment_textgrid_output = (
        write_textgrid(fitted, args.alignment_textgrid_output) if args.alignment_textgrid_output else None
    )
    summary = {
        "fittedGuideOutput": fitted_guide_output,
        "syllableMapOutput": syllable_map_output,
        "alignmentJsonOutput": alignment_json_output,
        "alignmentTextGridOutput": alignment_textgrid_output,
        "slotCount": len(fitted["slots"]),
        "lyricSyllableCount": fitted["lyrics"]["syllableCount"],
        "fit": fitted["fit"]["status"],
        "isAcceptable": fitted["fit"]["isAcceptable"],
    }
    print(json.dumps(summary, ensure_ascii=False))

    if args.require_match and not fitted["fit"]["isAcceptable"]:
        return 2

    return 0


if __name__ == "__main__":
    sys.exit(main())
