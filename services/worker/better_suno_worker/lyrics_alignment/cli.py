from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

from .alignment import LyricsAlignmentConfig, align_lyrics_to_vocals
from .textgrid import write_alignment_textgrid


def _read_lyrics(args: argparse.Namespace) -> str:
    if args.lyrics_file:
        return Path(args.lyrics_file).expanduser().read_text(encoding="utf-8")

    return args.lyrics or ""


def _write_json(path: str | Path, payload: dict, pretty: bool = False) -> str:
    output_path = Path(path).expanduser().resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2 if pretty else None) + "\n",
        encoding="utf-8",
    )
    return str(output_path)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Align original lyrics or ASR transcript to a separated vocal stem."
    )
    parser.add_argument("--vocals", required=True, help="Separated vocal stem audio file.")
    parser.add_argument("--output", required=True, help="Output lyrics-alignment JSON path.")
    parser.add_argument("--textgrid-output", help="Optional normalized Praat TextGrid output path.")
    parser.add_argument("--lyrics", help="Original lyric transcript for forced alignment.")
    parser.add_argument("--lyrics-file", help="UTF-8 original lyric transcript file.")
    parser.add_argument(
        "--provider",
        choices=["auto", "mfa", "whisperx", "whisperx-mfa"],
        default="auto",
        help="Alignment provider. Auto picks MFA when lyrics and MFA resources are present.",
    )
    parser.add_argument("--language", default="auto", help="Language hint for ASR/alignment.")
    parser.add_argument(
        "--work-dir",
        help="Directory for provider intermediate files. Defaults to a hidden folder next to --output.",
    )
    parser.add_argument("--keep-work-dir", action="store_true", help="Keep temporary provider files.")

    parser.add_argument("--mfa-bin", default="mfa", help="Montreal Forced Aligner executable.")
    parser.add_argument("--mfa-dictionary", help="MFA dictionary path or installed dictionary name.")
    parser.add_argument("--mfa-acoustic-model", help="MFA acoustic model path or installed model name.")
    parser.add_argument(
        "--mfa-output-format",
        default="long_textgrid",
        help="MFA align_one output format. TextGrid formats are required for phone parsing.",
    )
    parser.add_argument(
        "--no-mfa-normalize-transcript",
        action="store_true",
        help="Disable lightweight CJK/Latin transcript spacing before MFA.",
    )
    parser.add_argument("--mfa-extra-arg", action="append", default=[], help="Extra argument for MFA align_one.")

    parser.add_argument("--whisperx-bin", default="whisperx", help="WhisperX executable.")
    parser.add_argument("--whisperx-model", default="large-v3", help="WhisperX ASR model.")
    parser.add_argument("--whisperx-device", default="cpu", help="WhisperX device, e.g. cpu or cuda.")
    parser.add_argument("--whisperx-compute-type", default="int8", help="WhisperX compute type.")
    parser.add_argument("--whisperx-batch-size", type=int, help="WhisperX batch size.")
    parser.add_argument("--whisperx-align-model", help="WhisperX alignment model override.")
    parser.add_argument(
        "--whisperx-extra-arg",
        action="append",
        default=[],
        help="Extra argument for the WhisperX command.",
    )

    parser.add_argument(
        "--require-phones",
        action="store_true",
        help="Exit non-zero if the selected provider does not produce phoneme timestamps.",
    )
    parser.add_argument("--pretty", action="store_true", help="Pretty-print JSON output.")
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    output_path = Path(args.output).expanduser().resolve()
    work_dir = args.work_dir or str(output_path.parent / ".lyrics-alignment-work")

    config = LyricsAlignmentConfig(
        provider=args.provider,
        language=args.language,
        work_dir=work_dir,
        keep_work_dir=args.keep_work_dir,
        mfa_bin=args.mfa_bin,
        mfa_dictionary=args.mfa_dictionary,
        mfa_acoustic_model=args.mfa_acoustic_model,
        mfa_output_format=args.mfa_output_format,
        mfa_normalize_transcript=not args.no_mfa_normalize_transcript,
        mfa_extra_args=args.mfa_extra_arg,
        whisperx_bin=args.whisperx_bin,
        whisperx_model=args.whisperx_model,
        whisperx_device=args.whisperx_device,
        whisperx_compute_type=args.whisperx_compute_type,
        whisperx_batch_size=args.whisperx_batch_size,
        whisperx_align_model=args.whisperx_align_model,
        whisperx_extra_args=args.whisperx_extra_arg,
    )
    try:
        alignment = align_lyrics_to_vocals(args.vocals, lyrics_text=_read_lyrics(args), config=config)
    except Exception as error:
        print(
            json.dumps({"error": str(error), "provider": args.provider}, ensure_ascii=False),
            file=sys.stderr,
        )
        return 1

    output = _write_json(output_path, alignment, pretty=args.pretty)
    textgrid_output = (
        write_alignment_textgrid(alignment, args.textgrid_output) if args.textgrid_output else None
    )
    summary = {
        "output": output,
        "textGridOutput": textgrid_output,
        "provider": alignment.get("provider", {}).get("name"),
        "transcriptSource": alignment.get("transcript", {}).get("source"),
        "wordCount": alignment.get("quality", {}).get("wordCount", 0),
        "phoneCount": alignment.get("quality", {}).get("phoneCount", 0),
        "hasPhoneTimestamps": alignment.get("quality", {}).get("hasPhoneTimestamps", False),
        "warnings": alignment.get("quality", {}).get("warnings", []),
    }
    print(json.dumps(summary, ensure_ascii=False))

    if args.require_phones and not summary["hasPhoneTimestamps"]:
        return 2

    return 0


if __name__ == "__main__":
    sys.exit(main())
