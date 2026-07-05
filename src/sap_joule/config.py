"""Environment-driven configuration.

This module gives integration code a single, validated place to read settings
from. It intentionally does not contact any SAP endpoint — it only loads and
validates configuration values.
"""

from __future__ import annotations

import os
from dataclasses import dataclass


class ConfigError(RuntimeError):
    """Raised when configuration is missing or invalid."""


@dataclass(frozen=True)
class Config:
    """Runtime configuration for the application.

    Attributes:
        base_url: Base URL of the SAP Joule / SAP AI service endpoint.
        api_key: API key or token used to authenticate requests.
        timeout: Per-request timeout in seconds.
    """

    base_url: str
    api_key: str
    timeout: float = 30.0

    @classmethod
    def from_env(cls, env: dict[str, str] | None = None) -> Config:
        """Build a :class:`Config` from environment variables.

        Args:
            env: Optional mapping to read from (defaults to ``os.environ``).

        Raises:
            ConfigError: If a required variable is missing or invalid.
        """
        env = os.environ if env is None else env

        base_url = env.get("JOULE_BASE_URL", "").strip()
        api_key = env.get("JOULE_API_KEY", "").strip()

        missing = [
            name
            for name, value in (("JOULE_BASE_URL", base_url), ("JOULE_API_KEY", api_key))
            if not value
        ]
        if missing:
            raise ConfigError("Missing required environment variable(s): " + ", ".join(missing))

        raw_timeout = env.get("JOULE_TIMEOUT", "30").strip()
        try:
            timeout = float(raw_timeout)
        except ValueError as exc:
            raise ConfigError(f"JOULE_TIMEOUT must be a number, got {raw_timeout!r}") from exc
        if timeout <= 0:
            raise ConfigError(f"JOULE_TIMEOUT must be positive, got {timeout}")

        return cls(base_url=base_url, api_key=api_key, timeout=timeout)
