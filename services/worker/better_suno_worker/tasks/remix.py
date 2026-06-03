from typing import Any

from celery import chain

from ..celery_app import celery_app
from ..job_state import create_job_state, update_job_status
from ..schemas import PipelineContext, QualityReport, RemixArtifact, RemixJobPayload


@celery_app.task(name="better_suno.remix.enqueue_pipeline", bind=True)
def enqueue_pipeline(self, payload: dict[str, Any]) -> dict[str, Any]:
    job = RemixJobPayload.model_validate(payload)
    create_job_state(job, root_task_id=self.request.id)

    workflow = chain(
        analyze_source.s(job.model_dump(mode="json")),
        generate_lyrics.s(),
        generate_vocal.s(),
        mix_remix.s(),
        score_quality.s(),
    )
    result = workflow.apply_async()

    update_job_status(
        job.job_id,
        "queued",
        "workflow_scheduled",
        {"workflow_id": result.id},
    )
    return {"job_id": job.job_id, "workflow_id": result.id}


@celery_app.task(name="better_suno.remix.analyze_source", bind=True)
def analyze_source(self, payload: dict[str, Any]) -> dict[str, Any]:
    job = RemixJobPayload.model_validate(payload)
    update_job_status(job.job_id, "analyzing", "analysis_started", {"task_id": self.request.id})

    context = PipelineContext(
        job=job,
        analysis={
            "bpm": 96,
            "key": "C major",
            "sections": [
                {"label": "verse", "start_seconds": 0, "end_seconds": 30},
                {"label": "hook", "start_seconds": 30, "end_seconds": 75},
            ],
            "melody_guide_uri": f"redis-stub://jobs/{job.job_id}/melody-guide.mid",
        },
    )
    update_job_status(job.job_id, "analyzing", "analysis_completed", context.analysis)
    return context.model_dump(mode="json")


@celery_app.task(name="better_suno.remix.generate_lyrics", bind=True)
def generate_lyrics(self, context_payload: dict[str, Any]) -> dict[str, Any]:
    context = PipelineContext.model_validate(context_payload)
    update_job_status(
        context.job.job_id,
        "generating",
        "lyrics_started",
        {"task_id": self.request.id},
    )

    context.lyrics = {
        "text": f"Draft lyric based on prompt: {context.job.prompt}",
        "syllable_map_uri": f"redis-stub://jobs/{context.job.job_id}/syllable-map.json",
    }
    update_job_status(context.job.job_id, "generating", "lyrics_completed", context.lyrics)
    return context.model_dump(mode="json")


@celery_app.task(name="better_suno.remix.generate_vocal", bind=True)
def generate_vocal(self, context_payload: dict[str, Any]) -> dict[str, Any]:
    context = PipelineContext.model_validate(context_payload)
    update_job_status(
        context.job.job_id,
        "generating",
        "vocal_started",
        {"task_id": self.request.id},
    )

    context.vocal = {
        "voice_profile_id": context.job.voice_profile_id,
        "audio_uri": f"redis-stub://jobs/{context.job.job_id}/vocals.wav",
    }
    update_job_status(context.job.job_id, "generating", "vocal_completed", context.vocal)
    return context.model_dump(mode="json")


@celery_app.task(name="better_suno.remix.mix_remix", bind=True)
def mix_remix(self, context_payload: dict[str, Any]) -> dict[str, Any]:
    context = PipelineContext.model_validate(context_payload)
    update_job_status(
        context.job.job_id,
        "mixing",
        "mixing_started",
        {"task_id": self.request.id},
    )

    context.artifacts = [
        RemixArtifact(
            kind="master",
            uri=f"redis-stub://jobs/{context.job.job_id}/master.wav",
            mime_type="audio/wav",
        ),
        RemixArtifact(
            kind="report",
            uri=f"redis-stub://jobs/{context.job.job_id}/report.json",
            mime_type="application/json",
        ),
    ]
    update_job_status(
        context.job.job_id,
        "mixing",
        "mixing_completed",
        {"artifacts": [artifact.model_dump(mode="json") for artifact in context.artifacts]},
    )
    return context.model_dump(mode="json")


@celery_app.task(name="better_suno.remix.score_quality", bind=True)
def score_quality(self, context_payload: dict[str, Any]) -> dict[str, Any]:
    context = PipelineContext.model_validate(context_payload)
    update_job_status(
        context.job.job_id,
        "scoring",
        "quality_started",
        {"task_id": self.request.id},
    )

    context.quality = QualityReport(
        melody_similarity=0.78,
        lyric_fit=0.72,
        voice_similarity=0.66,
        mix_readiness=0.7,
        notes=["Celery stub score only. Connect real evaluators before beta."],
    )
    update_job_status(
        context.job.job_id,
        "completed",
        "quality_completed",
        {
            "quality": context.quality.model_dump(mode="json"),
            "artifacts": [artifact.model_dump(mode="json") for artifact in context.artifacts],
        },
    )
    return context.model_dump(mode="json")
