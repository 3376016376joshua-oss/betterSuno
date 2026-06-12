from __future__ import annotations

from copy import deepcopy
from typing import Any

from .lyrics import LyricSyllable, split_lyric_syllables


def build_fit(slot_count: int, lyric_syllable_count: int, max_mismatch_ratio: float) -> dict[str, Any]:
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


def line_phrase_fit(syllables: list[LyricSyllable], phrases: list[dict[str, Any]]) -> list[dict[str, Any]]:
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


def fit_lyrics_to_guide(
    guide: dict[str, Any],
    lyrics_text: str,
    language: str = "auto",
    max_mismatch_ratio: float | None = None,
) -> dict[str, Any]:
    fitted = deepcopy(guide)
    slots = fitted.get("slots") or []
    phrases = fitted.get("rhythm", {}).get("phrases") or []
    max_ratio = (
        max_mismatch_ratio
        if max_mismatch_ratio is not None
        else float(fitted.get("fit", {}).get("maxMismatchRatio", 0.2))
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
                "medianF0Hz": slot.get("medianF0Hz"),
                "medianMidi": slot.get("medianMidi"),
            }
        )

    for phrase in phrases:
        phrase["lyricSyllables"] = [
            slot["lyric"]["text"]
            for slot in slots
            if slot.get("phraseId") == phrase.get("id") and slot.get("lyric")
        ]

    fit = build_fit(len(slots), len(syllables), max_ratio)
    fitted["lyrics"] = {
        "text": lyrics_text,
        "language": language,
        "syllableCount": len(syllables),
        "syllables": syllable_payloads,
    }
    fitted["fit"] = {
        **fit,
        "linePhraseFit": line_phrase_fit(syllables, phrases),
    }
    fitted["guide"] = {
        "assignments": assignments,
        "extraLyrics": syllable_payloads[len(slots) :],
        "unfilledSlotIds": [slot["id"] for slot in slots[len(syllable_payloads) :]],
    }

    return fitted
