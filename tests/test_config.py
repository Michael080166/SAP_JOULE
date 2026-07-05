"""Tests for sap_joule.config."""

from __future__ import annotations

import pytest

from sap_joule import __version__
from sap_joule.config import Config, ConfigError


def test_version_is_set() -> None:
    assert __version__


def test_from_env_success() -> None:
    config = Config.from_env(
        {
            "JOULE_BASE_URL": "https://example.sap.com/joule",
            "JOULE_API_KEY": "secret",
            "JOULE_TIMEOUT": "12.5",
        }
    )
    assert config.base_url == "https://example.sap.com/joule"
    assert config.api_key == "secret"
    assert config.timeout == 12.5


def test_from_env_defaults_timeout() -> None:
    config = Config.from_env({"JOULE_BASE_URL": "https://x", "JOULE_API_KEY": "k"})
    assert config.timeout == 30.0


def test_from_env_missing_required() -> None:
    with pytest.raises(ConfigError) as exc:
        Config.from_env({"JOULE_BASE_URL": "https://x"})
    assert "JOULE_API_KEY" in str(exc.value)


def test_from_env_invalid_timeout() -> None:
    with pytest.raises(ConfigError):
        Config.from_env(
            {"JOULE_BASE_URL": "https://x", "JOULE_API_KEY": "k", "JOULE_TIMEOUT": "abc"}
        )


def test_from_env_nonpositive_timeout() -> None:
    with pytest.raises(ConfigError):
        Config.from_env({"JOULE_BASE_URL": "https://x", "JOULE_API_KEY": "k", "JOULE_TIMEOUT": "0"})
