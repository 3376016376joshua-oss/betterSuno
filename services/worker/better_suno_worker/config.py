from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class WorkerSettings(BaseSettings):
    celery_broker_url: str = Field(default="redis://localhost:6379/0")
    celery_result_backend: str = Field(default="redis://localhost:6379/1")
    redis_state_url: str = Field(default="redis://localhost:6379/2")
    redis_cache_url: str = Field(default="redis://localhost:6379/3")
    redis_visibility_timeout_seconds: int = Field(default=3600)
    celery_result_expires_seconds: int = Field(default=86400)
    celery_task_soft_time_limit_seconds: int = Field(default=300)
    celery_task_time_limit_seconds: int = Field(default=360)
    job_state_ttl_seconds: int = Field(default=604800)

    model_config = SettingsConfigDict(
        env_file=(".env", "../../.env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = WorkerSettings()
