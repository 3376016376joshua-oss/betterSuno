from typing import Any, Literal
from uuid import uuid4

from pydantic import BaseModel, Field

JobStatus = Literal["queued", "analyzing", "generating", "mixing", "scoring", "completed", "failed"]
RemixIntent = Literal["cover", "parody", "translation", "brand_jingle", "original_variant"]


class RightsConfirmation(BaseModel):
    has_source_rights: bool = True
    has_voice_consent: bool = True
    allow_platform_processing: bool = True


class RemixJobPayload(BaseModel):
    job_id: str = Field(default_factory=lambda: str(uuid4()))
    source_audio_uri: str
    voice_profile_id: str | None = None
    prompt: str
    target_language: str = "en"
    duration_seconds: int = Field(default=60, ge=15, le=600)
    intent: RemixIntent = "cover"
    keep_melody_strength: float = Field(default=0.82, ge=0, le=1)
    rights: RightsConfirmation = Field(default_factory=RightsConfirmation)
    metadata: dict[str, Any] = Field(default_factory=dict)


class RemixArtifact(BaseModel):
    kind: Literal[
        "master",
        "vocals",
        "instrumental",
        "stems",
        "waveform",
        "report",
        "rhythm",
        "vocal-guide",
        "lyrics-alignment",
        "lyrics-alignment-textgrid",
    ]
    uri: str
    mime_type: str


class QualityReport(BaseModel):
    melody_similarity: float = Field(ge=0, le=1)
    lyric_fit: float = Field(ge=0, le=1)
    voice_similarity: float = Field(ge=0, le=1)
    mix_readiness: float = Field(ge=0, le=1)
    notes: list[str] = Field(default_factory=list)


class PipelineContext(BaseModel):
    job: RemixJobPayload
    analysis: dict[str, Any] = Field(default_factory=dict)
    lyrics: dict[str, Any] = Field(default_factory=dict)
    vocal: dict[str, Any] = Field(default_factory=dict)
    artifacts: list[RemixArtifact] = Field(default_factory=list)
    quality: QualityReport | None = None
