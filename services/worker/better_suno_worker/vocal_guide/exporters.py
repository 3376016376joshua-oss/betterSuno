from __future__ import annotations

from pathlib import Path
import json
import struct
from typing import Any


def write_json(path: str | Path, payload: dict[str, Any], pretty: bool = False) -> str:
    output_path = Path(path).expanduser().resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2 if pretty else None) + "\n",
        encoding="utf-8",
    )
    return str(output_path)


def build_alignment_payload(guide: dict[str, Any]) -> dict[str, Any]:
    phrases = guide.get("rhythm", {}).get("phrases") or []
    slots = guide.get("slots") or []

    return {
        "schemaVersion": "better-suno.alignment.v1",
        "source": guide.get("source", {}),
        "fit": guide.get("fit", {}),
        "phrases": [
            {
                "id": phrase.get("id"),
                "index": phrase.get("index"),
                "start": phrase.get("start"),
                "end": phrase.get("end"),
                "duration": phrase.get("duration"),
                "slotCount": phrase.get("slotCount"),
                "medianF0Hz": phrase.get("medianF0Hz"),
                "medianMidi": phrase.get("medianMidi"),
                "lyricSyllables": phrase.get("lyricSyllables", []),
            }
            for phrase in phrases
        ],
        "slots": [
            {
                "id": slot.get("id"),
                "phraseId": slot.get("phraseId"),
                "index": slot.get("index"),
                "start": slot.get("start"),
                "end": slot.get("end"),
                "duration": slot.get("duration"),
                "medianF0Hz": slot.get("medianF0Hz"),
                "medianMidi": slot.get("medianMidi"),
                "lyric": slot.get("lyric"),
            }
            for slot in slots
        ],
    }


def build_syllable_map_payload(guide: dict[str, Any]) -> dict[str, Any]:
    guide_payload = guide.get("guide") or {}

    return {
        "schemaVersion": "better-suno.syllable-map.v1",
        "source": guide.get("source", {}),
        "lyrics": guide.get("lyrics", {}),
        "fit": guide.get("fit", {}),
        "assignments": guide_payload.get("assignments", []),
        "extraLyrics": guide_payload.get("extraLyrics", []),
        "unfilledSlotIds": guide_payload.get("unfilledSlotIds", []),
    }


def _varlen(value: int) -> bytes:
    buffer = value & 0x7F
    value >>= 7
    chunks = [buffer]

    while value:
        chunks.append((value & 0x7F) | 0x80)
        value >>= 7

    return bytes(reversed(chunks))


def _event(delta: int, payload: bytes) -> bytes:
    return _varlen(max(0, int(delta))) + payload


def write_melody_midi(guide: dict[str, Any], path: str | Path, tempo_bpm: float = 120.0) -> str:
    output_path = Path(path).expanduser().resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)

    ticks_per_beat = 480
    tempo_microseconds = int(60_000_000 / tempo_bpm)
    ticks_per_second = ticks_per_beat * tempo_bpm / 60
    events: list[tuple[int, bytes]] = []

    for slot in guide.get("slots") or []:
        midi = slot.get("medianMidi")
        start = slot.get("start")
        end = slot.get("end")
        if midi is None or start is None or end is None or end <= start:
            continue

        note = max(0, min(127, int(round(float(midi)))))
        velocity = 72
        start_tick = round(float(start) * ticks_per_second)
        end_tick = max(start_tick + 1, round(float(end) * ticks_per_second))
        events.append((start_tick, bytes([0x90, note, velocity])))
        events.append((end_tick, bytes([0x80, note, 0])))

    events.sort(key=lambda item: (item[0], item[1][0]))
    track = bytearray()
    track.extend(_event(0, b"\xff\x51\x03" + tempo_microseconds.to_bytes(3, "big")))

    previous_tick = 0
    for tick, payload in events:
        track.extend(_event(tick - previous_tick, payload))
        previous_tick = tick

    track.extend(_event(0, b"\xff\x2f\x00"))

    header = b"MThd" + struct.pack(">LHHH", 6, 0, 1, ticks_per_beat)
    data = header + b"MTrk" + struct.pack(">L", len(track)) + bytes(track)
    output_path.write_bytes(data)
    return str(output_path)


def _escape_textgrid_label(label: str) -> str:
    return label.replace('"', '""')


def _interval_items(items: list[dict[str, Any]], label_key: str, fallback_key: str) -> list[dict[str, Any]]:
    intervals = []
    for item in items:
        start = item.get("start")
        end = item.get("end")
        if start is None or end is None or end <= start:
            continue

        label = item.get(label_key) or item.get(fallback_key) or ""
        if isinstance(label, dict):
            label = label.get("text") or label.get("source_text") or ""
        elif isinstance(label, list):
            label = " ".join(str(value) for value in label)

        intervals.append({"start": float(start), "end": float(end), "label": str(label)})

    return sorted(intervals, key=lambda item: item["start"])


def _fill_tier_gaps(intervals: list[dict[str, Any]], duration_seconds: float) -> list[dict[str, Any]]:
    filled = []
    cursor = 0.0

    for interval in intervals:
        start = max(0.0, min(float(interval["start"]), duration_seconds))
        end = max(start, min(float(interval["end"]), duration_seconds))
        if start > cursor:
            filled.append({"start": cursor, "end": start, "label": ""})
        if end > start:
            filled.append({"start": start, "end": end, "label": interval["label"]})
        cursor = max(cursor, end)

    if cursor < duration_seconds:
        filled.append({"start": cursor, "end": duration_seconds, "label": ""})

    return filled or [{"start": 0.0, "end": duration_seconds, "label": ""}]


def _textgrid_tier(name: str, intervals: list[dict[str, Any]], duration_seconds: float, index: int) -> str:
    filled = _fill_tier_gaps(intervals, duration_seconds)
    lines = [
        f"    item [{index}]:",
        '        class = "IntervalTier"',
        f'        name = "{_escape_textgrid_label(name)}"',
        "        xmin = 0",
        f"        xmax = {duration_seconds:.6f}",
        f"        intervals: size = {len(filled)}",
    ]

    for interval_index, interval in enumerate(filled, start=1):
        lines.extend(
            [
                f"        intervals [{interval_index}]:",
                f"            xmin = {interval['start']:.6f}",
                f"            xmax = {interval['end']:.6f}",
                f'            text = "{_escape_textgrid_label(interval["label"])}"',
            ]
        )

    return "\n".join(lines)


def write_textgrid(guide: dict[str, Any], path: str | Path) -> str:
    output_path = Path(path).expanduser().resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    duration_seconds = float(guide.get("source", {}).get("durationSeconds") or 0)
    phrases = guide.get("rhythm", {}).get("phrases") or []
    slots = guide.get("slots") or []
    phrase_intervals = _interval_items(phrases, "id", "id")
    slot_intervals = _interval_items(slots, "lyric", "id")
    tiers = [
        _textgrid_tier("phrases", phrase_intervals, duration_seconds, 1),
        _textgrid_tier("syllables", slot_intervals, duration_seconds, 2),
    ]
    payload = "\n".join(
        [
            'File type = "ooTextFile"',
            'Object class = "TextGrid"',
            "",
            "xmin = 0",
            f"xmax = {duration_seconds:.6f}",
            "tiers? <exists>",
            "size = 2",
            "item []:",
            *tiers,
            "",
        ]
    )
    output_path.write_text(payload, encoding="utf-8")
    return str(output_path)
