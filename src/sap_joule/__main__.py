"""Command-line entry point: ``python -m sap_joule``."""

from __future__ import annotations

import sys

from sap_joule import __version__
from sap_joule.config import Config, ConfigError


def main(argv: list[str] | None = None) -> int:
    """Run the CLI.

    Returns:
        Process exit code (0 on success).
    """
    argv = sys.argv[1:] if argv is None else argv

    if "--version" in argv or "-V" in argv:
        print(f"sap-joule {__version__}")
        return 0

    print(f"sap-joule {__version__}")
    try:
        config = Config.from_env()
    except ConfigError as exc:
        print(f"Not configured yet: {exc}", file=sys.stderr)
        print("Copy .env.example to .env and fill in the values.", file=sys.stderr)
        return 1

    print(f"Configured for endpoint: {config.base_url}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
