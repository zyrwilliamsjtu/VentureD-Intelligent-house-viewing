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


def _opt(name: str, default: str = "") -> str:
    return (os.environ.get(name) or default).strip()


def llm_api_key() -> str:
    return _opt("LLM_API_KEY")


def llm_base_url() -> str:
    # 待确认：向 key 提供方确认是否含 /v1
    return _opt("LLM_BASE_URL")


def llm_model() -> str:
    # 待确认：模型名由提供方给出
    return _opt("LLM_MODEL")


def asr_api_key() -> str:
    return _opt("ASR_API_KEY") or llm_api_key()


def asr_base_url() -> str:
    return _opt("ASR_BASE_URL") or llm_base_url()


def asr_model() -> str:
    # 待确认：如 whisper-1 / 供应商 ASR 模型名
    return _opt("ASR_MODEL")


def tts_api_key() -> str:
    return _opt("TTS_API_KEY") or llm_api_key()


def tts_base_url() -> str:
    return _opt("TTS_BASE_URL") or llm_base_url()


def tts_model() -> str:
    # 待确认：如 tts-1 / 供应商 TTS 模型名
    return _opt("TTS_MODEL")


def asr_provider_name() -> str:
    return (_opt("ASR_PROVIDER", "stub") or "stub").lower()


def tts_provider_name() -> str:
    return (_opt("TTS_PROVIDER", "stub") or "stub").lower()


def chat_provider_name() -> str:
    return (_opt("CHAT_PROVIDER", "stub") or "stub").lower()
