"""Vocal guide extraction utilities for remix pipelines."""

from .analysis import VocalGuideConfig, generate_vocal_guide
from .fitting import fit_lyrics_to_guide
from .lyrics import LyricSyllable, split_lyric_syllables

__all__ = [
    "LyricSyllable",
    "VocalGuideConfig",
    "fit_lyrics_to_guide",
    "generate_vocal_guide",
    "split_lyric_syllables",
]
