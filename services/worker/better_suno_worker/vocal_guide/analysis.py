from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import UTC, datetime
import math
from pathlib import Path
from typing import Any

from .lyrics import LyricSyllable, split_lyric_syllables


@dataclass(frozen=True)
class VocalGuideConfig:
    sample_rate: int = 22050
    hop_length: int = 256
    frame_length: int = 2048
    fmin: str | float = "C2"
    fmax: str | float = "C7"
    energy_percentile: float = 65.0
    phrase_gap_seconds: float = 0.45
    min_phrase_duration_seconds: float = 0.25
    min_slot_duration_seconds: float = 0.08
    max_slot_duration_seconds: float = 0.8
    slot_subdivision_seconds: float = 0.34
    max_mismatch_ratio: float = 0.2


def _require_audio_stack():
    try:
        import librosa  # type: ignore
        import numpy as np  # type: ignore
    except ImportError as error:
        raise RuntimeError(
            "Missing vocal guide audio dependencies. Install the worker analysis extra with "
            "`cd services/worker && python -m pip install -e '.[analysis]'`."
        ) from error

    return librosa, np


def _resolve_frequency(value: str | float, librosa: Any) -> float:
    if isinstance(value, (float, int)):
        return float(value)

    try:
        return float(value)
    except ValueError:
        return float(librosa.note_to_hz(value))


def _round(value: Any, digits: int = 6) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None

    if not math.isfinite(number):
        return None

    return round(number, digits)


def _midi_from_hz(hz: float | None) -> float | None:
    if hz is None or hz <= 0:
        return None

    return round(69 + (12 * math.log2(hz / 440.0)), 3)


def _array_stats(values: Any, np: Any) -> dict[str, float | None]:
    finite = values[np.isfinite(values)]
    if finite.size == 0:
        return {"min": None, "median": None, "max": None}

    return {
        "min": _round(np.min(finite), 3),
        "median": _round(np.median(finite), 3),
        "max": _round(np.max(finite), 3),
    }


def _align_array(values: Any, length: int, fill_value: float | bool, np: Any) -> Any:
    if len(values) == length:
        return values

    if len(values) > length:
        return values[:length]

    padding = np.full(length - len(values), fill_value)
    return np.concatenate([values, padding])


def _active_intervals(
    active_mask: Any,
    times: Any,
    duration_seconds: float,
    frame_step_seconds: float,
    config: VocalGuideConfig,
) -> list[dict[str, float]]:
    intervals: list[dict[str, float]] = []
    start_index: int | None = None

    for index, is_active in enumerate(active_mask):
        if bool(is_active) and start_index is None:
            start_index = index
        elif not bool(is_active) and start_index is not None:
            end_index = max(start_index, index - 1)
            intervals.append(
                {
                    "start": float(times[start_index]),
                    "end": min(duration_seconds, float(times[end_index]) + frame_step_seconds),
                }
            )
            start_index = None

    if start_index is not None:
        intervals.append(
            {
                "start": float(times[start_index]),
                "end": min(duration_seconds, float(times[-1]) + frame_step_seconds),
            }
        )

    if not intervals and duration_seconds > 0:
        intervals = [{"start": 0.0, "end": duration_seconds}]

    merged: list[dict[str, float]] = []
    for interval in intervals:
        if not merged or interval["start"] - merged[-1]["end"] > config.phrase_gap_seconds:
            merged.append(interval)
        else:
            merged[-1]["end"] = max(merged[-1]["end"], interval["end"])

    filtered = [
        {
            "start": round(interval["start"], 4),
            "end": round(interval["end"], 4),
        }
        for interval in merged
        if interval["end"] - interval["start"] >= config.min_phrase_duration_seconds
    ]

    if not filtered and duration_seconds > 0:
        return [{"start": 0.0, "end": round(duration_seconds, 4)}]

    return filtered


def _slot_boundaries(
    phrase_start: float,
    phrase_end: float,
    onset_times: list[float],
    config: VocalGuideConfig,
) -> list[float]:
    min_slot = config.min_slot_duration_seconds
    points = [phrase_start]

    for onset_time in onset_times:
        if phrase_start + min_slot <= onset_time <= phrase_end - min_slot:
            points.append(onset_time)

    points.append(phrase_end)
    points = sorted(points)

    deduped = [points[0]]
    for point in points[1:]:
        if point - deduped[-1] >= min_slot:
            deduped.append(point)
        elif math.isclose(point, phrase_end):
            deduped[-1] = point

    if len(deduped) < 2:
        return [round(phrase_start, 4), round(phrase_end, 4)]

    subdivided = [deduped[0]]
    for point in deduped[1:]:
        previous = subdivided[-1]
        duration = point - previous
        if duration > config.max_slot_duration_seconds:
            pieces = max(2, math.ceil(duration / config.slot_subdivision_seconds))
            for piece_index in range(1, pieces):
                subdivided.append(previous + (duration * piece_index / pieces))
        subdivided.append(point)

    return [round(point, 4) for point in subdivided]


def _region_summary(
    start: float,
    end: float,
    times: Any,
    f0_hz: Any,
    voiced_mask: Any,
    rms: Any,
    np: Any,
) -> dict[str, float | None]:
    frame_mask = (times >= start) & (times < end)
    voiced_f0 = f0_hz[frame_mask & voiced_mask]
    finite_f0 = voiced_f0[np.isfinite(voiced_f0)]
    region_rms = rms[frame_mask]
    median_hz = _round(np.median(finite_f0), 3) if finite_f0.size else None

    return {
        "medianF0Hz": median_hz,
        "medianMidi": _midi_from_hz(median_hz),
        "meanRms": _round(np.mean(region_rms), 6) if region_rms.size else None,
        "peakRms": _round(np.max(region_rms), 6) if region_rms.size else None,
    }


def _build_fit(
    slot_count: int,
    lyric_syllable_count: int,
    max_mismatch_ratio: float,
) -> dict[str, Any]:
    if lyric_syllable_count == 0:
        return {
            "status": "no_lyrics",
            "isAcceptable": True,
            "slotCount": slot_count,
            "lyricSyllableCount": 0,
            "difference": -slot_count,
            "mismatchRatio": 0,
            "maxMismatchRatio": max_mismatch_ratio,
            "warnings": ["No replacement lyrics were provided; guide contains rhythm and melody only."],
        }

    difference = lyric_syllable_count - slot_count
    mismatch_ratio = abs(difference) / max(slot_count, 1)
    is_acceptable = abs(difference) <= 1 or mismatch_ratio <= max_mismatch_ratio

    if difference == 0:
        status = "match"
    elif is_acceptable:
        status = "near"
    elif difference > 0:
        status = "overfull"
    else:
        status = "underfull"

    warnings = []
    if not is_acceptable:
        warnings.append(
            f"Lyric syllable count differs from guide slots by {difference}; "
            f"target {slot_count}, got {lyric_syllable_count}."
        )

    return {
        "status": status,
        "isAcceptable": is_acceptable,
        "slotCount": slot_count,
        "lyricSyllableCount": lyric_syllable_count,
        "difference": difference,
        "mismatchRatio": round(mismatch_ratio, 4),
        "maxMismatchRatio": max_mismatch_ratio,
        "warnings": warnings,
    }


def _line_phrase_fit(
    syllables: list[LyricSyllable],
    phrases: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    line_counts: dict[int, int] = {}
    for syllable in syllables:
        line_counts[syllable.line_index] = line_counts.get(syllable.line_index, 0) + 1

    fits: list[dict[str, Any]] = []
    for index, phrase in enumerate(phrases):
        line_count = line_counts.get(index)
        if line_count is None:
            continue

        fits.append(
            {
                "lineIndex": index,
                "phraseId": phrase["id"],
                "phraseSlotCount": phrase["slotCount"],
                "lineSyllableCount": line_count,
                "difference": line_count - phrase["slotCount"],
            }
        )

    return fits


def generate_vocal_guide(
    vocals_path: str | Path,
    lyrics_text: str = "",
    language: str = "auto",
    config: VocalGuideConfig | None = None,
) -> dict[str, Any]:
    librosa, np = _require_audio_stack()
    config = config or VocalGuideConfig()
    input_path = Path(vocals_path).expanduser().resolve()

    if not input_path.is_file():
        raise FileNotFoundError(f"Vocals file not found: {input_path}")

    y, sample_rate = librosa.load(str(input_path), sr=config.sample_rate, mono=True)
    duration_seconds = float(librosa.get_duration(y=y, sr=sample_rate))

    if y.size == 0 or duration_seconds <= 0:
        raise ValueError(f"Vocals file is empty or unreadable: {input_path}")

    fmin_hz = _resolve_frequency(config.fmin, librosa)
    fmax_hz = _resolve_frequency(config.fmax, librosa)
    f0_hz, voiced_flag, voiced_probability = librosa.pyin(
        y,
        fmin=fmin_hz,
        fmax=fmax_hz,
        sr=sample_rate,
        frame_length=config.frame_length,
        hop_length=config.hop_length,
    )
    frame_count = len(f0_hz)
    times = librosa.frames_to_time(np.arange(frame_count), sr=sample_rate, hop_length=config.hop_length)
    frame_step_seconds = config.hop_length / sample_rate

    rms = librosa.feature.rms(
        y=y,
        frame_length=config.frame_length,
        hop_length=config.hop_length,
        center=True,
    )[0]
    rms = _align_array(rms, frame_count, 0.0, np)
    voiced_flag = _align_array(voiced_flag.astype(bool), frame_count, False, np)
    voiced_probability = _align_array(voiced_probability, frame_count, 0.0, np)

    positive_rms = rms[rms > 0]
    if positive_rms.size:
        percentile_floor = np.percentile(positive_rms, config.energy_percentile) * 0.35
        peak_floor = np.max(positive_rms) * 0.02
        energy_threshold = float(max(percentile_floor, peak_floor))
    else:
        energy_threshold = 0.0

    active_mask = voiced_flag | (rms >= energy_threshold)
    phrases = _active_intervals(active_mask, times, duration_seconds, frame_step_seconds, config)

    onset_envelope = librosa.onset.onset_strength(y=y, sr=sample_rate, hop_length=config.hop_length)
    onset_frames = librosa.onset.onset_detect(
        onset_envelope=onset_envelope,
        sr=sample_rate,
        hop_length=config.hop_length,
        units="frames",
        backtrack=True,
    )
    onset_times = [
        round(float(time), 4)
        for time in librosa.frames_to_time(onset_frames, sr=sample_rate, hop_length=config.hop_length)
        if 0 <= float(time) <= duration_seconds
    ]

    slots: list[dict[str, Any]] = []
    for phrase_index, phrase in enumerate(phrases):
        phrase_id = f"p{phrase_index + 1:03d}"
        phrase_onsets = [
            onset_time for onset_time in onset_times if phrase["start"] <= onset_time < phrase["end"]
        ]
        boundaries = _slot_boundaries(phrase["start"], phrase["end"], phrase_onsets, config)
        phrase_slot_ids: list[str] = []

        for boundary_index in range(len(boundaries) - 1):
            start = boundaries[boundary_index]
            end = boundaries[boundary_index + 1]
            if end <= start:
                continue

            slot_id = f"s{len(slots) + 1:04d}"
            phrase_slot_ids.append(slot_id)
            slots.append(
                {
                    "id": slot_id,
                    "phraseId": phrase_id,
                    "index": len(slots),
                    "start": start,
                    "end": end,
                    "duration": round(end - start, 4),
                    "onset": start,
                    **_region_summary(start, end, times, f0_hz, voiced_flag, rms, np),
                }
            )

        phrase.update(
            {
                "id": phrase_id,
                "index": phrase_index,
                "duration": round(phrase["end"] - phrase["start"], 4),
                "onsets": phrase_onsets,
                "slotIds": phrase_slot_ids,
                "slotCount": len(phrase_slot_ids),
                **_region_summary(phrase["start"], phrase["end"], times, f0_hz, voiced_flag, rms, np),
            }
        )

    syllables = split_lyric_syllables(lyrics_text, language=language) if lyrics_text else []
    syllable_payloads = [syllable.to_dict() for syllable in syllables]

    assignments: list[dict[str, Any]] = []
    for index, slot in enumerate(slots):
        syllable = syllable_payloads[index] if index < len(syllable_payloads) else None
        slot["lyric"] = syllable
        assignments.append(
            {
                "slotId": slot["id"],
                "phraseId": slot["phraseId"],
                "start": slot["start"],
                "end": slot["end"],
                "syllable": syllable,
                "medianF0Hz": slot["medianF0Hz"],
                "medianMidi": slot["medianMidi"],
            }
        )

    for phrase in phrases:
        phrase["lyricSyllables"] = [
            slot["lyric"]["text"]
            for slot in slots
            if slot["phraseId"] == phrase["id"] and slot.get("lyric")
        ]

    finite_f0 = f0_hz[np.isfinite(f0_hz)]
    voiced_frame_count = int(np.sum(voiced_flag))
    fit = _build_fit(len(slots), len(syllables), config.max_mismatch_ratio)
    line_phrase_fit = _line_phrase_fit(syllables, phrases)

    frames = []
    for index, time in enumerate(times):
        hz = _round(f0_hz[index], 3)
        voiced = bool(voiced_flag[index]) and hz is not None
        frames.append(
            {
                "time": _round(time, 4),
                "hz": hz if voiced else None,
                "midi": _midi_from_hz(hz) if voiced else None,
                "voiced": voiced,
                "confidence": _round(voiced_probability[index], 4),
            }
        )

    return {
        "schemaVersion": "better-suno.vocal-guide.v1",
        "createdAt": datetime.now(UTC).isoformat(),
        "source": {
            "vocalsPath": str(input_path),
            "sampleRate": int(sample_rate),
            "durationSeconds": round(duration_seconds, 4),
        },
        "params": asdict(config),
        "melody": {
            "extractor": "librosa.pyin",
            "fminHz": round(fmin_hz, 3),
            "fmaxHz": round(fmax_hz, 3),
            "frameCount": frame_count,
            "voicedFrameCount": voiced_frame_count,
            "voicedRatio": round(voiced_frame_count / max(frame_count, 1), 4),
            "f0Hz": _array_stats(finite_f0, np),
            "frames": frames,
        },
        "rhythm": {
            "energy": {
                "extractor": "librosa.feature.rms",
                "frameCount": frame_count,
                "threshold": _round(energy_threshold, 6),
                "rms": _array_stats(rms, np),
            },
            "onsets": onset_times,
            "phrases": phrases,
        },
        "slots": slots,
        "lyrics": {
            "text": lyrics_text,
            "language": language,
            "syllableCount": len(syllables),
            "syllables": syllable_payloads,
        },
        "fit": {
            **fit,
            "linePhraseFit": line_phrase_fit,
        },
        "guide": {
            "assignments": assignments,
            "extraLyrics": syllable_payloads[len(slots) :],
            "unfilledSlotIds": [slot["id"] for slot in slots[len(syllable_payloads) :]],
        },
    }
