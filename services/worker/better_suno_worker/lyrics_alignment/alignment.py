from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
import json
import math
import shutil
import subprocess
import tempfile
import wave
from typing import Any

from .textgrid import parse_textgrid


@dataclass(frozen=True)
class LyricsAlignmentConfig:
    provider: str = "auto"
    language: str = "auto"
    work_dir: str | None = None
    keep_work_dir: bool = False
    mfa_bin: str = "mfa"
    mfa_dictionary: str | None = None
    mfa_acoustic_model: str | None = None
    mfa_output_format: str = "long_textgrid"
    mfa_normalize_transcript: bool = True
    mfa_extra_args: list[str] = field(default_factory=list)
    whisperx_bin: str = "whisperx"
    whisperx_model: str = "large-v3"
    whisperx_device: str = "cpu"
    whisperx_compute_type: str = "int8"
    whisperx_batch_size: int | None = None
    whisperx_align_model: str | None = None
    whisperx_extra_args: list[str] = field(default_factory=list)


def _round_time(value: Any, digits: int = 4) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None

    if not math.isfinite(number):
        return None

    return round(number, digits)


def _duration_seconds(path: Path) -> float | None:
    try:
        with wave.open(str(path), "rb") as audio:
            rate = audio.getframerate()
            frames = audio.getnframes()
            return round(frames / rate, 4) if rate else None
    except (wave.Error, OSError, EOFError):
        return None


def _read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def _write_text(path: Path, text: str) -> str:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text.strip() + "\n", encoding="utf-8")
    return str(path)


def _is_cjk_character(character: str) -> bool:
    codepoint = ord(character)
    return (
        0x3400 <= codepoint <= 0x4DBF
        or 0x4E00 <= codepoint <= 0x9FFF
        or 0xF900 <= codepoint <= 0xFAFF
    )


def _normalize_mfa_transcript(text: str) -> str:
    normalized_lines: list[str] = []

    for line in text.splitlines():
        tokens: list[str] = []
        current = []

        def flush_current() -> None:
            if current:
                tokens.append("".join(current))
                current.clear()

        for character in line:
            if _is_cjk_character(character):
                flush_current()
                tokens.append(character)
            elif character.isalnum() or character in {"'", "-"}:
                current.append(character)
            else:
                flush_current()

        flush_current()
        normalized_lines.append(" ".join(tokens))

    return "\n".join(line for line in normalized_lines if line.strip())


def _run_command(command: str, args: list[str], label: str, cwd: Path | None = None) -> dict[str, Any]:
    command_path = shutil.which(command) if not Path(command).is_file() else command
    if not command_path:
        raise RuntimeError(
            f"{label} command not found: {command}. Install it or pass the matching binary option."
        )

    completed = subprocess.run(
        [command, *args],
        cwd=str(cwd) if cwd else None,
        check=False,
        capture_output=True,
        text=True,
    )
    result = {
        "command": command,
        "args": args,
        "returnCode": completed.returncode,
        "stdout": completed.stdout.strip(),
        "stderr": completed.stderr.strip(),
    }

    if completed.returncode != 0:
        details = completed.stderr.strip() or completed.stdout.strip()
        raise RuntimeError(
            f"{label} failed with exit code {completed.returncode}"
            f"{': ' + details if details else ''}"
        )

    return result


def _clean_label(value: Any) -> str:
    return str(value or "").strip()


def _is_empty_word(label: str) -> bool:
    normalized = label.strip().lower()
    return normalized in {"", "<eps>", "<epsilon>", "sil", "sp", "spn"}


def _is_empty_phone(label: str) -> bool:
    normalized = label.strip().lower()
    return normalized in {"", "<eps>", "<epsilon>", "sil", "sp", "spn"}


def _select_tier(tiers: list[dict[str, Any]], names: set[str], fallback_index: int) -> dict[str, Any] | None:
    for tier in tiers:
        tier_name = str(tier.get("name") or "").strip().lower()
        if tier_name in names or any(name in tier_name for name in names):
            return tier

    if len(tiers) > fallback_index:
        return tiers[fallback_index]

    return None


def _overlap_seconds(left: dict[str, Any], right: dict[str, Any]) -> float:
    start = max(float(left["start"]), float(right["start"]))
    end = min(float(left["end"]), float(right["end"]))
    return max(0.0, end - start)


def _assign_phone_to_word(phone: dict[str, Any], words: list[dict[str, Any]]) -> str | None:
    if not words:
        return None

    best_word = max(words, key=lambda word: _overlap_seconds(phone, word))
    if _overlap_seconds(phone, best_word) > 0:
        return str(best_word["id"])

    center = (float(phone["start"]) + float(phone["end"])) / 2
    for word in words:
        if float(word["start"]) <= center <= float(word["end"]):
            return str(word["id"])

    return None


def _build_words_and_phones_from_tiers(tiers: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    word_tier = _select_tier(tiers, {"word", "words"}, 0)
    phone_tier = _select_tier(tiers, {"phone", "phones"}, 1)
    words: list[dict[str, Any]] = []
    phones: list[dict[str, Any]] = []

    for interval in (word_tier or {}).get("intervals", []):
        text = _clean_label(interval.get("text"))
        start = _round_time(interval.get("start"))
        end = _round_time(interval.get("end"))
        if _is_empty_word(text) or start is None or end is None or end <= start:
            continue

        word = {
            "id": f"w{len(words) + 1:04d}",
            "index": len(words),
            "text": text,
            "start": start,
            "end": end,
            "duration": round(end - start, 4),
            "confidence": None,
            "phones": [],
        }
        words.append(word)

    for interval in (phone_tier or {}).get("intervals", []):
        label = _clean_label(interval.get("text"))
        start = _round_time(interval.get("start"))
        end = _round_time(interval.get("end"))
        if _is_empty_phone(label) or start is None or end is None or end <= start:
            continue

        phone = {
            "id": f"ph{len(phones) + 1:05d}",
            "index": len(phones),
            "wordId": None,
            "phone": label,
            "start": start,
            "end": end,
            "duration": round(end - start, 4),
            "confidence": None,
        }
        phone["wordId"] = _assign_phone_to_word(phone, words)
        phones.append(phone)

    phone_by_word: dict[str, list[dict[str, Any]]] = {}
    for phone in phones:
        word_id = phone.get("wordId")
        if not word_id:
            continue
        phone_by_word.setdefault(str(word_id), []).append(
            {
                "id": phone["id"],
                "phone": phone["phone"],
                "start": phone["start"],
                "end": phone["end"],
                "duration": phone["duration"],
                "confidence": phone["confidence"],
            }
        )

    for word in words:
        word["phones"] = phone_by_word.get(str(word["id"]), [])

    return words, phones


def _alignment_payload(
    vocals_path: Path,
    lyrics_text: str,
    transcript_source: str,
    provider: dict[str, Any],
    words: list[dict[str, Any]],
    phones: list[dict[str, Any]],
    config: LyricsAlignmentConfig,
    warnings: list[str] | None = None,
    intermediate_artifacts: dict[str, Any] | None = None,
) -> dict[str, Any]:
    duration = _duration_seconds(vocals_path)
    max_end = max(
        [float(item["end"]) for item in [*words, *phones] if item.get("end") is not None],
        default=0.0,
    )
    if duration is None and max_end > 0:
        duration = round(max_end, 4)

    payload_warnings = list(warnings or [])
    if not phones:
        payload_warnings.append(
            "No phoneme timestamps were produced. Use MFA or a provider that exposes phone tiers for phoneme-level alignment."
        )

    return {
        "schemaVersion": "better-suno.lyrics-alignment.v1",
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "source": {
            "vocalsPath": str(vocals_path),
            "durationSeconds": duration,
            "hasProvidedLyrics": bool(lyrics_text.strip()) and transcript_source == "provided_lyrics",
        },
        "params": {
            **asdict(config),
            "mfaExtraArgs": config.mfa_extra_args,
            "whisperxExtraArgs": config.whisperx_extra_args,
        },
        "transcript": {
            "source": transcript_source,
            "language": config.language,
            "text": lyrics_text.strip(),
        },
        "provider": provider,
        "words": words,
        "phones": phones,
        "quality": {
            "wordCount": len(words),
            "phoneCount": len(phones),
            "hasWordTimestamps": bool(words),
            "hasPhoneTimestamps": bool(phones),
            "warnings": payload_warnings,
        },
        "intermediateArtifacts": intermediate_artifacts or {},
    }


def _run_mfa_alignment(
    vocals_path: Path,
    lyrics_text: str,
    config: LyricsAlignmentConfig,
    work_dir: Path,
    transcript_source: str = "provided_lyrics",
) -> dict[str, Any]:
    if not lyrics_text.strip():
        raise ValueError("MFA alignment requires original lyrics or an ASR transcript.")
    if not config.mfa_dictionary or not config.mfa_acoustic_model:
        raise ValueError("MFA alignment requires --mfa-dictionary and --mfa-acoustic-model.")
    if "textgrid" not in config.mfa_output_format.lower():
        raise ValueError("MFA provider currently requires a TextGrid output format for phone parsing.")

    transcript_path = work_dir / "mfa-transcript.txt"
    textgrid_path = work_dir / "mfa-alignment.TextGrid"
    mfa_transcript = (
        _normalize_mfa_transcript(lyrics_text) if config.mfa_normalize_transcript else lyrics_text
    )
    _write_text(transcript_path, mfa_transcript)

    args = [
        "align_one",
        str(vocals_path),
        str(transcript_path),
        config.mfa_dictionary,
        config.mfa_acoustic_model,
        str(textgrid_path),
        "--output_format",
        config.mfa_output_format,
        *config.mfa_extra_args,
    ]
    command = _run_command(config.mfa_bin, args, "MFA align_one")

    if not textgrid_path.is_file():
        candidates = sorted(work_dir.glob("*.TextGrid")) + sorted(work_dir.glob("*.Textgrid"))
        if not candidates:
            raise RuntimeError(f"MFA did not write a TextGrid output in {work_dir}.")
        textgrid_path = candidates[0]

    parsed = parse_textgrid(textgrid_path)
    words, phones = _build_words_and_phones_from_tiers(parsed["tiers"])
    return _alignment_payload(
        vocals_path,
        lyrics_text,
        transcript_source,
        provider={
            "name": "mfa",
            "aligner": "Montreal Forced Aligner",
            "dictionary": config.mfa_dictionary,
            "acousticModel": config.mfa_acoustic_model,
            "commands": [command],
        },
        words=words,
        phones=phones,
        config=config,
        intermediate_artifacts={
            "transcriptPath": str(transcript_path),
            "normalizedTranscript": mfa_transcript,
            "mfaTextGridPath": str(textgrid_path),
        },
    )


def _find_whisperx_json(output_dir: Path, vocals_path: Path) -> Path:
    preferred = output_dir / f"{vocals_path.stem}.json"
    if preferred.is_file():
        return preferred

    candidates = sorted(output_dir.glob("*.json"), key=lambda item: item.stat().st_mtime, reverse=True)
    if not candidates:
        raise RuntimeError(f"WhisperX did not write a JSON output in {output_dir}.")

    return candidates[0]


def _extract_whisperx_words(data: Any) -> tuple[str, list[dict[str, Any]]]:
    segments = data.get("segments") if isinstance(data, dict) else []
    word_segments = data.get("word_segments") if isinstance(data, dict) else None
    raw_words = word_segments if isinstance(word_segments, list) and word_segments else []

    if not raw_words:
        for segment in segments if isinstance(segments, list) else []:
            words = segment.get("words") if isinstance(segment, dict) else None
            if isinstance(words, list):
                raw_words.extend(words)

    transcript_parts = []
    if isinstance(segments, list):
        transcript_parts = [
            str(segment.get("text") or "").strip()
            for segment in segments
            if isinstance(segment, dict) and str(segment.get("text") or "").strip()
        ]

    words: list[dict[str, Any]] = []
    for raw_word in raw_words:
        if not isinstance(raw_word, dict):
            continue

        text = _clean_label(raw_word.get("word") or raw_word.get("text"))
        start = _round_time(raw_word.get("start"))
        end = _round_time(raw_word.get("end"))
        if _is_empty_word(text) or start is None or end is None or end <= start:
            continue

        confidence = raw_word.get("score", raw_word.get("confidence"))
        words.append(
            {
                "id": f"w{len(words) + 1:04d}",
                "index": len(words),
                "text": text,
                "start": start,
                "end": end,
                "duration": round(end - start, 4),
                "confidence": _round_time(confidence, 4),
                "phones": [],
            }
        )

    transcript = " ".join(transcript_parts).strip()
    if not transcript and words:
        transcript = " ".join(word["text"] for word in words)

    return transcript, words


def _run_whisperx_alignment(
    vocals_path: Path,
    config: LyricsAlignmentConfig,
    work_dir: Path,
) -> dict[str, Any]:
    output_dir = work_dir / "whisperx"
    output_dir.mkdir(parents=True, exist_ok=True)
    args = [
        str(vocals_path),
        "--model",
        config.whisperx_model,
        "--device",
        config.whisperx_device,
        "--compute_type",
        config.whisperx_compute_type,
        "--output_dir",
        str(output_dir),
        "--output_format",
        "json",
    ]

    if config.language and config.language != "auto":
        args.extend(["--language", config.language])
    if config.whisperx_batch_size:
        args.extend(["--batch_size", str(config.whisperx_batch_size)])
    if config.whisperx_align_model:
        args.extend(["--align_model", config.whisperx_align_model])
    args.extend(config.whisperx_extra_args)

    command = _run_command(config.whisperx_bin, args, "WhisperX alignment")
    json_path = _find_whisperx_json(output_dir, vocals_path)
    data = _read_json(json_path)
    transcript, words = _extract_whisperx_words(data)
    return _alignment_payload(
        vocals_path,
        transcript,
        "whisperx_asr",
        provider={
            "name": "whisperx",
            "aligner": "WhisperX",
            "model": config.whisperx_model,
            "device": config.whisperx_device,
            "commands": [command],
        },
        words=words,
        phones=[],
        config=config,
        warnings=[
            "WhisperX output is treated as word-level ASR alignment. Run whisperx-mfa when phoneme timestamps are required."
        ],
        intermediate_artifacts={"whisperxJsonPath": str(json_path)},
    )


def _run_whisperx_mfa_alignment(
    vocals_path: Path,
    config: LyricsAlignmentConfig,
    work_dir: Path,
) -> dict[str, Any]:
    whisperx_payload = _run_whisperx_alignment(vocals_path, config, work_dir)
    transcript = whisperx_payload.get("transcript", {}).get("text") or ""
    mfa_payload = _run_mfa_alignment(
        vocals_path,
        transcript,
        config,
        work_dir / "mfa",
        transcript_source="whisperx_asr",
    )
    mfa_payload["provider"] = {
        "name": "whisperx-mfa",
        "asr": whisperx_payload["provider"],
        "aligner": mfa_payload["provider"],
    }
    mfa_payload["intermediateArtifacts"] = {
        **whisperx_payload.get("intermediateArtifacts", {}),
        **mfa_payload.get("intermediateArtifacts", {}),
    }
    return mfa_payload


def _choose_provider(lyrics_text: str, config: LyricsAlignmentConfig) -> str:
    provider = config.provider.strip().lower()
    if provider != "auto":
        return provider

    has_lyrics = bool(lyrics_text.strip())
    has_mfa_resources = bool(config.mfa_dictionary and config.mfa_acoustic_model)

    if has_lyrics and has_mfa_resources:
        return "mfa"
    if not has_lyrics and has_mfa_resources:
        return "whisperx-mfa"
    if not has_lyrics:
        return "whisperx"

    raise ValueError(
        "Provider auto could not choose an aligner. Provided lyrics require MFA resources "
        "(--mfa-dictionary and --mfa-acoustic-model), or choose another provider explicitly."
    )


def align_lyrics_to_vocals(
    vocals_path: str | Path,
    lyrics_text: str = "",
    config: LyricsAlignmentConfig | None = None,
) -> dict[str, Any]:
    config = config or LyricsAlignmentConfig()
    input_path = Path(vocals_path).expanduser().resolve()

    if not input_path.is_file():
        raise FileNotFoundError(f"Vocals file not found: {input_path}")

    provider = _choose_provider(lyrics_text, config)
    explicit_work_dir = Path(config.work_dir).expanduser().resolve() if config.work_dir else None

    if explicit_work_dir:
        explicit_work_dir.mkdir(parents=True, exist_ok=True)
        work_dir = explicit_work_dir
        cleanup = None
    else:
        cleanup = tempfile.TemporaryDirectory(prefix="better-suno-align-")
        work_dir = Path(cleanup.name)

    try:
        if provider == "mfa":
            payload = _run_mfa_alignment(input_path, lyrics_text, config, work_dir)
        elif provider == "whisperx":
            if lyrics_text.strip():
                raise ValueError("WhisperX provider ignores provided lyrics; use MFA for forced alignment.")
            payload = _run_whisperx_alignment(input_path, config, work_dir)
        elif provider in {"whisperx-mfa", "whisperx_mfa"}:
            if lyrics_text.strip():
                raise ValueError("whisperx-mfa is for missing-lyrics ASR; use MFA when lyrics are provided.")
            payload = _run_whisperx_mfa_alignment(input_path, config, work_dir)
        else:
            raise ValueError(f"Unknown lyrics alignment provider: {config.provider}")

        payload["params"]["provider"] = provider
        return payload
    finally:
        if cleanup and not config.keep_work_dir:
            cleanup.cleanup()
