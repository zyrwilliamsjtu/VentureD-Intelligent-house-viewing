"""Load process config from environment / optional .env (never commit secrets)."""
from __future__ import annotations

import os
from pathlib import Path

# backend/app/config.py → repo root is parents[2]
BACKEND_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = BACKEND_ROOT.parent


def _load_dotenv() -> None:
    env_path = BACKEND_ROOT / ".env"
    if not env_path.is_file():
        return
    for raw in env_path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        if key and key not in os.environ:
            os.environ[key] = value.strip().strip('"').strip("'")


_load_dotenv()


def cors_origins() -> list[str]:
    raw = os.environ.get("CORS_ORIGINS", "http://localhost:5173")
    return [item.strip() for item in raw.split(",") if item.strip()]


def understanding_provider() -> str:
    """Scene-graph source: gt (default) or dual_engine (stub)."""
    raw = os.environ.get("UNDERSTANDING_PROVIDER", "gt").strip()
    return raw.lower() if raw else "gt"
