from kombu import Exchange, Queue

REMIX_EXCHANGE = Exchange("remix", type="direct", durable=True)

QUEUE_NAMES = {
    "orchestrator": "remix.orchestrator",
    "analysis": "remix.analysis",
    "lyrics": "remix.lyrics",
    "vocal": "remix.vocal",
    "mixing": "remix.mixing",
    "quality": "remix.quality",
    "default": "remix.default",
}

CELERY_QUEUES = tuple(
    Queue(name, REMIX_EXCHANGE, routing_key=name, durable=True)
    for name in QUEUE_NAMES.values()
)

TASK_ROUTES = {
    "better_suno.remix.enqueue_pipeline": {
        "queue": QUEUE_NAMES["orchestrator"],
        "routing_key": QUEUE_NAMES["orchestrator"],
    },
    "better_suno.remix.analyze_source": {
        "queue": QUEUE_NAMES["analysis"],
        "routing_key": QUEUE_NAMES["analysis"],
    },
    "better_suno.remix.generate_lyrics": {
        "queue": QUEUE_NAMES["lyrics"],
        "routing_key": QUEUE_NAMES["lyrics"],
    },
    "better_suno.remix.generate_vocal": {
        "queue": QUEUE_NAMES["vocal"],
        "routing_key": QUEUE_NAMES["vocal"],
    },
    "better_suno.remix.mix_remix": {
        "queue": QUEUE_NAMES["mixing"],
        "routing_key": QUEUE_NAMES["mixing"],
    },
    "better_suno.remix.score_quality": {
        "queue": QUEUE_NAMES["quality"],
        "routing_key": QUEUE_NAMES["quality"],
    },
}
