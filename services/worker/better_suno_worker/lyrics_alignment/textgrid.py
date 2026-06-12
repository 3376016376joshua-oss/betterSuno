from __future__ import annotations

from pathlib import Path
import re
from typing import Any


_ITEM_RE = re.compile(r"^\s*item \[\d+\]:\s*$")
_INTERVAL_RE = re.compile(r"^\s*intervals \[\d+\]:\s*$")
_ASSIGNMENT_RE = re.compile(r'^\s*([A-Za-z_?]+)\s*=\s*(.*)\s*$')


def _parse_value(raw: str) -> str | float:
    value = raw.strip()
    if len(value) >= 2 and value[0] == '"' and value[-1] == '"':
        return value[1:-1].replace('""', '"')

    try:
        return float(value)
    except ValueError:
        return value


def _parse_assignment(line: str) -> tuple[str, str | float] | None:
    match = _ASSIGNMENT_RE.match(line)
    if not match:
        return None

    return match.group(1), _parse_value(match.group(2))


def parse_textgrid(path: str | Path) -> dict[str, Any]:
    """Parse long-format Praat TextGrid interval tiers without extra dependencies."""

    textgrid_path = Path(path).expanduser().resolve()
    lines = textgrid_path.read_text(encoding="utf-8").splitlines()
    tiers: list[dict[str, Any]] = []
    index = 0

    while index < len(lines):
        line = lines[index]
        if not _ITEM_RE.match(line):
            index += 1
            continue

        tier: dict[str, Any] = {"class": "", "name": "", "intervals": []}
        index += 1

        while index < len(lines) and not _ITEM_RE.match(lines[index]):
            current = lines[index]

            if _INTERVAL_RE.match(current):
                interval: dict[str, Any] = {}
                index += 1
                while (
                    index < len(lines)
                    and not _INTERVAL_RE.match(lines[index])
                    and not _ITEM_RE.match(lines[index])
                ):
                    assignment = _parse_assignment(lines[index])
                    if assignment:
                        key, value = assignment
                        if key in {"xmin", "xmax", "text"}:
                            interval[key] = value
                    index += 1

                if {"xmin", "xmax", "text"}.issubset(interval):
                    tier["intervals"].append(
                        {
                            "start": float(interval["xmin"]),
                            "end": float(interval["xmax"]),
                            "text": str(interval["text"]),
                        }
                    )
                continue

            assignment = _parse_assignment(current)
            if assignment:
                key, value = assignment
                if key == "class":
                    tier["class"] = str(value)
                elif key == "name":
                    tier["name"] = str(value)
            index += 1

        if tier["intervals"] or tier["name"]:
            tiers.append(tier)

    return {"path": str(textgrid_path), "tiers": tiers}


def _escape_label(label: str) -> str:
    return label.replace('"', '""')


def _fill_gaps(intervals: list[dict[str, Any]], duration_seconds: float) -> list[dict[str, Any]]:
    filled: list[dict[str, Any]] = []
    cursor = 0.0

    for interval in sorted(intervals, key=lambda item: float(item["start"])):
        start = max(0.0, min(float(interval["start"]), duration_seconds))
        end = max(start, min(float(interval["end"]), duration_seconds))
        label = str(interval.get("text") or interval.get("phone") or "")

        if start > cursor:
            filled.append({"start": cursor, "end": start, "text": ""})
        if end > start:
            filled.append({"start": start, "end": end, "text": label})
        cursor = max(cursor, end)

    if cursor < duration_seconds:
        filled.append({"start": cursor, "end": duration_seconds, "text": ""})

    return filled or [{"start": 0.0, "end": duration_seconds, "text": ""}]


def _tier(name: str, intervals: list[dict[str, Any]], duration_seconds: float, index: int) -> str:
    filled = _fill_gaps(intervals, duration_seconds)
    lines = [
        f"    item [{index}]:",
        '        class = "IntervalTier"',
        f'        name = "{_escape_label(name)}"',
        "        xmin = 0",
        f"        xmax = {duration_seconds:.6f}",
        f"        intervals: size = {len(filled)}",
    ]

    for interval_index, interval in enumerate(filled, start=1):
        lines.extend(
            [
                f"        intervals [{interval_index}]:",
                f"            xmin = {float(interval['start']):.6f}",
                f"            xmax = {float(interval['end']):.6f}",
                f'            text = "{_escape_label(str(interval["text"]))}"',
            ]
        )

    return "\n".join(lines)


def write_alignment_textgrid(alignment: dict[str, Any], path: str | Path) -> str:
    output_path = Path(path).expanduser().resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)

    duration_seconds = float(alignment.get("source", {}).get("durationSeconds") or 0)
    words = [
        {"start": item["start"], "end": item["end"], "text": item["text"]}
        for item in alignment.get("words", [])
        if item.get("start") is not None and item.get("end") is not None
    ]
    phones = [
        {"start": item["start"], "end": item["end"], "text": item["phone"]}
        for item in alignment.get("phones", [])
        if item.get("start") is not None and item.get("end") is not None
    ]

    max_end = max(
        [float(item["end"]) for item in words + phones if item.get("end") is not None],
        default=duration_seconds,
    )
    duration_seconds = max(duration_seconds, max_end)

    tiers = [
        _tier("words", words, duration_seconds, 1),
        _tier("phones", phones, duration_seconds, 2),
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
