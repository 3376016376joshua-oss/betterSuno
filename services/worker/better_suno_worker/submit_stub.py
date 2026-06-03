from .schemas import RemixJobPayload
from .tasks.remix import enqueue_pipeline


def main() -> None:
    payload = RemixJobPayload(
        source_audio_uri="s3://better-suno-dev/source/authorized-song.wav",
        voice_profile_id="demo-user-voice",
        prompt="Test the Redis and Celery remix foundation.",
        target_language="en",
        duration_seconds=60,
        intent="cover",
        keep_melody_strength=0.82,
    )
    result = enqueue_pipeline.apply_async(
        args=[payload.model_dump(mode="json")],
        queue="remix.orchestrator",
        routing_key="remix.orchestrator",
    )
    print(f"submitted job_id={payload.job_id} root_task_id={result.id}")


if __name__ == "__main__":
    main()
