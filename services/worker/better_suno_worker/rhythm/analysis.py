from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import UTC, datetime
import math
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class RhythmExtractionConfig:
    sample_rate: int = 22050
    hop_length: int = 512
    frame_length: int = 2048
    beat_source: str = "vocals"
    beat_tightness: float = 100.0
    beat_trim: bool = False
    start_bpm: float | None = None
    energy_percentile: float = 65.0
    phrase_gap_seconds: float = 0.45
    min_phrase_duration_seconds: float = 0.25
    min_syllable_duration_seconds: float = 0.06
    onset_delta: float = 0.07
    onset_wait: int = 1


def _require_audio_stack():
    try:
        import librosa  # type: ignore
        import numpy as np  # type: ignore
    except ImportError as error:
        raise RuntimeError(
            "Missing rhythm audio dependencies. Install the worker analysis extra with "
            "`cd services/worker && python -m pip install -e '.[analysis]'`."
        ) from error

    return librosa, np


def _round(value: Any, digits: int = 6) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None

    if not math.isfinite(number):
        return None

    return round(number, digits)


def _scalar(value: Any, np: Any, digits: int = 6) -> float | None:
    try:
        array = np.asarray(value, dtype=float).reshape(-1)
    except (TypeError, ValueError):
        return _round(value, digits)

    if array.size == 0:
        return None

    return _round(array[0], digits)


def _array_stats(values: Any, np: Any) -> dict[str, float | None]:
    finite = values[np.isfinite(values)]
    if finite.size == 0:
        return {"min": None, "median": None, "max": None}

    return {
        "min": _round(np.min(finite), 6),
        "median": _round(np.median(finite), 6),
        "max": _round(np.max(finite), 6),
    }


def _align_array(values: Any, length: int, fill_value: float | bool, np: Any) -> Any:
    if len(values) == length:
        return values

    if len(values) > length:
        return values[:length]

    padding = np.full(length - len(values), fill_value)
    return np.concatenate([values, padding])


def _resolve_audio_path(file_path: str | Path | None) -> Path | None:
    if file_path is None:
        return None

    resolved = Path(file_path).expanduser().resolve()
    if not resolved.is_file():
        raise FileNotFoundError(f"Audio file not found: {resolved}")

    return resolved


def _load_audio(file_path: Path, sample_rate: int, librosa: Any) -> tuple[Any, int, float]:
    y, loaded_sample_rate = librosa.load(str(file_path), sr=sample_rate, mono=True)
    duration_seconds = float(librosa.get_duration(y=y, sr=loaded_sample_rate))

    if y.size == 0 or duration_seconds <= 0:
        raise ValueError(f"Audio file is empty or unreadable: {file_path}")

    return y, loaded_sample_rate, duration_seconds


def _dedupe_times(times: list[float], min_gap_seconds: float, max_time: float) -> list[float]:
    deduped: list[float] = []
    for time in sorted(times):
        if time < 0 or time > max_time:
            continue

        if not deduped or time - deduped[-1] >= min_gap_seconds:
            deduped.append(time)

    return [round(time, 4) for time in deduped]


def _active_intervals(
    active_mask: Any,
    times: Any,
    duration_seconds: float,
    frame_step_seconds: float,
    config: RhythmExtractionConfig,
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


def _region_rms_summary(start: float, end: float, times: Any, rms: Any, np: Any) -> dict[str, float | None]:
    frame_mask = (times >= start) & (times < end)
    region_rms = rms[frame_mask]

    return {
        "meanRms": _round(np.mean(region_rms), 6) if region_rms.size else None,
        "peakRms": _round(np.max(region_rms), 6) if region_rms.size else None,
    }


def _syllable_boundaries(
    phrase_start: float,
    phrase_end: float,
    onset_times: list[float],
    config: RhythmExtractionConfig,
) -> list[float]:
    min_duration = config.min_syllable_duration_seconds
    points = [phrase_start]

    for onset_time in onset_times:
        if phrase_start + min_duration <= onset_time <= phrase_end - min_duration:
            points.append(onset_time)

    points.append(phrase_end)
    points = sorted(points)

    deduped = [points[0]]
    for point in points[1:]:
        if point - deduped[-1] >= min_duration:
            deduped.append(point)
        elif math.isclose(point, phrase_end):
            deduped[-1] = point

    if len(deduped) < 2:
        return [round(phrase_start, 4), round(phrase_end, 4)]

    return [round(point, 4) for point in deduped]


def _extract_beat_grid(
    y: Any,
    sample_rate: int,
    duration_seconds: float,
    source_kind: str,
    source_path: Path,
    config: RhythmExtractionConfig,
    librosa: Any,
    np: Any,
) -> dict[str, Any]:
    onset_envelope = librosa.onset.onset_strength(y=y, sr=sample_rate, hop_length=config.hop_length)
    beat_kwargs: dict[str, Any] = {
        "onset_envelope": onset_envelope,
        "sr": sample_rate,
        "hop_length": config.hop_length,
        "tightness": config.beat_tightness,
        "trim": config.beat_trim,
    }
    if config.start_bpm is not None:
        beat_kwargs["start_bpm"] = config.start_bpm

    tempo, beat_frames = librosa.beat.beat_track(**beat_kwargs)
    beats = _dedupe_times(
        [float(time) for time in librosa.frames_to_time(beat_frames, sr=sample_rate, hop_length=config.hop_length)],
        min_gap_seconds=0.01,
        max_time=duration_seconds,
    )
    intervals = [round(beats[index + 1] - beats[index], 4) for index in range(len(beats) - 1)]

    return {
        "extractor": "librosa.beat.beat_track",
        "source": {
            "kind": source_kind,
            "path": str(source_path),
            "sampleRate": int(sample_rate),
            "durationSeconds": round(duration_seconds, 4),
        },
        "tempoBpm": _scalar(tempo, np, 3),
        "beats": beats,
        "beatCount": len(beats),
        "beatIntervalSeconds": {
            "median": _round(np.median(intervals), 4) if intervals else None,
            "min": _round(np.min(intervals), 4) if intervals else None,
            "max": _round(np.max(intervals), 4) if intervals else None,
        },
        "onsetEnvelope": {
            "frameCount": int(len(onset_envelope)),
            "strength": _array_stats(onset_envelope, np),
        },
    }


def _extract_vocal_rhythm(
    y: Any,
    sample_rate: int,
    duration_seconds: float,
    source_path: Path,
    config: RhythmExtractionConfig,
    librosa: Any,
    np: Any,
) -> dict[str, Any]:
    rms = librosa.feature.rms(
        y=y,
        frame_length=config.frame_length,
        hop_length=config.hop_length,
        center=True,
    )[0]
    frame_count = len(rms)
    times = librosa.frames_to_time(np.arange(frame_count), sr=sample_rate, hop_length=config.hop_length)
    frame_step_seconds = config.hop_length / sample_rate
    rms = _align_array(rms, frame_count, 0.0, np)

    positive_rms = rms[rms > 0]
    if positive_rms.size:
        percentile_floor = np.percentile(positive_rms, config.energy_percentile) * 0.35
        peak_floor = np.max(positive_rms) * 0.02
        energy_threshold = float(max(percentile_floor, peak_floor))
    else:
        energy_threshold = 0.0

    active_mask = rms >= energy_threshold
    phrase_intervals = _active_intervals(active_mask, times, duration_seconds, frame_step_seconds, config)

    onset_envelope = librosa.onset.onset_strength(y=y, sr=sample_rate, hop_length=config.hop_length)
    onset_frames = librosa.onset.onset_detect(
        onset_envelope=onset_envelope,
        sr=sample_rate,
        hop_length=config.hop_length,
        units="frames",
        backtrack=True,
        delta=config.onset_delta,
        wait=max(0, int(config.onset_wait)),
    )
    onsets = _dedupe_times(
        [float(time) for time in librosa.frames_to_time(onset_frames, sr=sample_rate, hop_length=config.hop_length)],
        min_gap_seconds=config.min_syllable_duration_seconds,
        max_time=duration_seconds,
    )

    syllable_candidates: list[dict[str, Any]] = []
    phrases: list[dict[str, Any]] = []

    for phrase_index, phrase in enumerate(phrase_intervals):
        phrase_id = f"p{phrase_index + 1:03d}"
        phrase_onsets = [
            onset_time for onset_time in onsets if phrase["start"] <= onset_time < phrase["end"]
        ]
        boundaries = _syllable_boundaries(phrase["start"], phrase["end"], phrase_onsets, config)
        syllable_ids: list[str] = []

        for boundary_index in range(len(boundaries) - 1):
            start = boundaries[boundary_index]
            end = boundaries[boundary_index + 1]
            if end <= start:
                continue

            syllable_id = f"vc{len(syllable_candidates) + 1:04d}"
            syllable_ids.append(syllable_id)
            syllable_candidates.append(
                {
                    "id": syllable_id,
                    "phraseId": phrase_id,
                    "index": len(syllable_candidates),
                    "start": start,
                    "end": end,
                    "duration": round(end - start, 4),
                    "onset": start,
                    **_region_rms_summary(start, end, times, rms, np),
                }
            )

        phrases.append(
            {
                "id": phrase_id,
                "index": phrase_index,
                "start": phrase["start"],
                "end": phrase["end"],
                "duration": round(phrase["end"] - phrase["start"], 4),
                "onsets": phrase_onsets,
                "syllableCandidateIds": syllable_ids,
                "syllableCount": len(syllable_ids),
                **_region_rms_summary(phrase["start"], phrase["end"], times, rms, np),
            }
        )

    return {
        "extractor": "librosa.onset + rms_silence_segmentation",
        "source": {
            "kind": "vocals",
            "path": str(source_path),
            "sampleRate": int(sample_rate),
            "durationSeconds": round(duration_seconds, 4),
        },
        "energy": {
            "extractor": "librosa.feature.rms",
            "frameCount": int(frame_count),
            "threshold": _round(energy_threshold, 6),
            "rms": _array_stats(rms, np),
        },
        "onsets": onsets,
        "phrases": phrases,
        "syllableCandidates": syllable_candidates,
    }


def _select_beat_source(
    vocals_path: Path,
    instrumental_path: Path | None,
    mix_path: Path | None,
    config: RhythmExtractionConfig,
) -> tuple[str, Path, list[str]]:
    warnings: list[str] = []
    beat_source = config.beat_source.lower()

    if beat_source == "vocals":
        return "vocals", vocals_path, warnings

    if beat_source == "instrumental":
        if instrumental_path is not None:
            return "instrumental", instrumental_path, warnings

        warnings.append("Instrumental beat source was requested but no instrumental file was provided.")
        return "vocals", vocals_path, warnings

    if beat_source == "mix":
        if mix_path is not None:
            return "mix", mix_path, warnings

        warnings.append("Mix beat source was requested but no mix file was provided.")
        return "vocals", vocals_path, warnings

    if beat_source != "auto":
        warnings.append(f"Unknown beat source '{config.beat_source}'; falling back to vocals.")
        return "vocals", vocals_path, warnings

    if instrumental_path is not None:
        return "instrumental", instrumental_path, warnings

    if mix_path is not None:
        return "mix", mix_path, warnings

    warnings.append(
        "Auto beat source fell back to vocals because no instrumental or mix source was provided."
    )
    return "vocals", vocals_path, warnings


def extract_rhythm(
    vocals_path: str | Path,
    instrumental_path: str | Path | None = None,
    mix_path: str | Path | None = None,
    config: RhythmExtractionConfig | None = None,
) -> dict[str, Any]:
    """Extract song-level beat grid plus vocal phrasing rhythm.

    The beat grid prefers the instrumental stem or original mix. Vocal timing is
    extracted separately from the vocal stem so downstream remix stages can use
    either layer independently.
    """

    librosa, np = _require_audio_stack()
    config = config or RhythmExtractionConfig()

    resolved_vocals_path = _resolve_audio_path(vocals_path)
    if resolved_vocals_path is None:
        raise FileNotFoundError("Vocals file is required.")

    resolved_instrumental_path = _resolve_audio_path(instrumental_path)
    resolved_mix_path = _resolve_audio_path(mix_path)
    beat_source_kind, beat_source_path, warnings = _select_beat_source(
        resolved_vocals_path,
        resolved_instrumental_path,
        resolved_mix_path,
        config,
    )

    beat_y, beat_sample_rate, beat_duration_seconds = _load_audio(
        beat_source_path,
        config.sample_rate,
        librosa,
    )
    vocal_y, vocal_sample_rate, vocal_duration_seconds = _load_audio(
        resolved_vocals_path,
        config.sample_rate,
        librosa,
    )

    beat_grid = _extract_beat_grid(
        beat_y,
        beat_sample_rate,
        beat_duration_seconds,
        beat_source_kind,
        beat_source_path,
        config,
        librosa,
        np,
    )
    vocal = _extract_vocal_rhythm(
        vocal_y,
        vocal_sample_rate,
        vocal_duration_seconds,
        resolved_vocals_path,
        config,
        librosa,
        np,
    )

    if beat_grid["beatCount"] < 2:
        warnings.append("Beat tracker returned fewer than two beats; tempo may be unreliable.")

    return {
        "schemaVersion": "better-suno.rhythm.v1",
        "createdAt": datetime.now(UTC).isoformat(),
        "source": {
            "vocalsPath": str(resolved_vocals_path),
            "instrumentalPath": str(resolved_instrumental_path) if resolved_instrumental_path else None,
            "mixPath": str(resolved_mix_path) if resolved_mix_path else None,
            "beatSource": beat_grid["source"],
            "vocalSource": vocal["source"],
        },
        "params": asdict(config),
        "tempoBpm": beat_grid["tempoBpm"],
        "beats": beat_grid["beats"],
        "phrases": vocal["phrases"],
        "vocalOnsets": vocal["onsets"],
        "beatGrid": beat_grid,
        "vocal": vocal,
        "summary": {
            "tempoBpm": beat_grid["tempoBpm"],
            "beatCount": beat_grid["beatCount"],
            "phraseCount": len(vocal["phrases"]),
            "vocalOnsetCount": len(vocal["onsets"]),
            "syllableCandidateCount": len(vocal["syllableCandidates"]),
            "beatSource": beat_source_kind,
            "warnings": warnings,
        },
        "warnings": warnings,
    }
