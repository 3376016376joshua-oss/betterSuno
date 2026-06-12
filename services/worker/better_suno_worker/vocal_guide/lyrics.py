from __future__ import annotations

from dataclasses import asdict, dataclass
import re
import unicodedata


@dataclass(frozen=True)
class LyricSyllable:
    text: str
    source_text: str
    line_index: int
    word_index: int
    syllable_index: int
    syllable_count: int
    language: str

    def to_dict(self) -> dict[str, int | str]:
        return asdict(self)


_LATIN_WORD_RE = re.compile(r"[A-Za-z]+(?:['-][A-Za-z]+)?")
_VOWEL_GROUP_RE = re.compile(r"[aeiouy]+", re.IGNORECASE)
_LATIN_VOWELS = set("aeiouy")


def _is_cjk_syllable_char(char: str) -> bool:
    codepoint = ord(char)
    return (
        0x3400 <= codepoint <= 0x4DBF
        or 0x4E00 <= codepoint <= 0x9FFF
        or 0x3040 <= codepoint <= 0x30FF
        or 0xAC00 <= codepoint <= 0xD7AF
    )


def _is_wordlike(char: str) -> bool:
    category = unicodedata.category(char)
    return category[0] in {"L", "N"} or char in {"'", "-"}


def _latin_syllable_count(word: str) -> int:
    normalized = re.sub(r"[^A-Za-z]", "", word).lower()
    if not normalized:
        return 0

    groups = _VOWEL_GROUP_RE.findall(normalized)
    count = len(groups)

    if len(normalized) > 2 and normalized.endswith("e") and not normalized.endswith(("le", "ye")):
        count -= 1

    if len(normalized) > 3 and normalized.endswith("ed") and normalized[-3] not in _LATIN_VOWELS:
        count -= 1

    if count <= 0:
        count = 1

    return count


def _latin_syllable_labels(word: str) -> list[str]:
    count = _latin_syllable_count(word)
    if count <= 1:
        return [word]

    return [f"{word}:{index + 1}" for index in range(count)]


def _scan_line(line: str) -> list[tuple[str, str]]:
    tokens: list[tuple[str, str]] = []
    index = 0

    while index < len(line):
        char = line[index]

        if char.isspace():
            index += 1
            continue

        if _is_cjk_syllable_char(char):
            tokens.append((char, "cjk"))
            index += 1
            continue

        if char.isascii() and (match := _LATIN_WORD_RE.match(line, index)):
            tokens.append((match.group(0), "latin"))
            index = match.end()
            continue

        if _is_wordlike(char):
            tokens.append((char, "symbolic"))

        index += 1

    return tokens


def split_lyric_syllables(text: str, language: str = "auto") -> list[LyricSyllable]:
    """Split lyrics into a simple syllable-like sequence.

    This is intentionally conservative and dependency-free. CJK scripts map one
    visible syllable character to one slot, while Latin words use a small vowel
    group heuristic. The labels are stable enough for guide alignment and can be
    swapped later for a language-specific tokenizer.
    """

    syllables: list[LyricSyllable] = []
    lines = text.splitlines() or [text]

    for line_index, line in enumerate(lines):
        word_index = 0
        for token, token_language in _scan_line(line):
            if token_language == "latin":
                labels = _latin_syllable_labels(token)
            else:
                labels = [token]

            syllable_count = len(labels)
            effective_language = language if language != "auto" else token_language
            for syllable_index, label in enumerate(labels):
                syllables.append(
                    LyricSyllable(
                        text=label,
                        source_text=token,
                        line_index=line_index,
                        word_index=word_index,
                        syllable_index=syllable_index,
                        syllable_count=syllable_count,
                        language=effective_language,
                    )
                )
            word_index += 1

    return syllables
