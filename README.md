# SAP_JOULE

A starting point for a project related to **SAP Joule**, SAP's generative-AI
assistant (copilot). This repository provides a clean Python baseline that is
ready to be built out.

## What is SAP Joule?

[SAP Joule](https://www.sap.com/products/artificial-intelligence/ai-assistant.html)
is SAP's AI copilot, embedded across SAP's enterprise applications to help users
get work done through natural-language interaction.

## Project layout

```
.
├── src/sap_joule/      # application package
│   ├── __init__.py
│   ├── __main__.py     # `python -m sap_joule` entry point
│   └── config.py       # environment-driven configuration
├── tests/              # pytest test suite
├── pyproject.toml      # project metadata + tooling (ruff, pytest)
├── .env.example        # sample environment variables
└── .gitignore
```

## Getting started

Requires Python 3.10+.

```bash
# create and activate a virtual environment
python -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate

# install the package with dev tooling
pip install -e ".[dev]"

# copy and fill in environment variables
cp .env.example .env

# run the CLI
python -m sap_joule
```

## Development

```bash
ruff check .        # lint
ruff format .       # format
pytest              # run tests
```

## Configuration

Configuration is read from environment variables (see `.env.example`). Nothing
in this baseline contacts a live SAP endpoint yet — `config.py` simply loads and
validates settings so integration code has a single place to start from.

## Contributing

Open an issue or pull request to propose changes.
