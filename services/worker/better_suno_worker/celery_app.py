from celery import Celery

from .config import settings
from .queues import CELERY_QUEUES, QUEUE_NAMES, TASK_ROUTES

celery_app = Celery(
    "better_suno_worker",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
    include=["better_suno_worker.tasks.remix"],
)

celery_app.conf.update(
    accept_content=["json"],
    broker_transport_options={
        "visibility_timeout": settings.redis_visibility_timeout_seconds,
    },
    enable_utc=True,
    result_expires=settings.celery_result_expires_seconds,
    result_serializer="json",
    task_acks_late=True,
    task_default_exchange="remix",
    task_default_queue=QUEUE_NAMES["default"],
    task_default_routing_key=QUEUE_NAMES["default"],
    task_queues=CELERY_QUEUES,
    task_reject_on_worker_lost=True,
    task_routes=TASK_ROUTES,
    task_serializer="json",
    task_soft_time_limit=settings.celery_task_soft_time_limit_seconds,
    task_time_limit=settings.celery_task_time_limit_seconds,
    task_track_started=True,
    timezone="UTC",
    worker_prefetch_multiplier=1,
)
