"""OpenAI 兼容 ASR。

待确认：向 key 提供方确认 base_url（是否含 /v1）、模型名、路径是否为 /audio/transcriptions。
"""

from __future__ import annotations

import httpx

from app.config import asr_api_key, asr_base_url, asr_model
from app.services.agent._openai_http import bearer_headers, join_url
from app.services.agent.asr.providers.base import ASRProvider

# SPEC §0：asr 10s
_TIMEOUT = 10.0
# 待确认：OpenAI 为 POST {base}/audio/transcriptions（multipart file）
_PATH = "/audio/transcriptions"


class OpenAICompatASRProvider(ASRProvider):
    def transcribe(self, audio_bytes: bytes, *, filename: str = "audio.webm") -> dict:
        key = asr_api_key()
        base = asr_base_url()
        if not key or not base:
            raise RuntimeError("ASR openai_compat 未配置 API_KEY 或 BASE_URL")
        if not audio_bytes:
            return {"text": "", "duration_ms": 0}
        url = join_url(base, _PATH)
        model = asr_model() or "whisper-1"  # 待确认：默认模型名
        files = {"file": (filename, audio_bytes, "application/octet-stream")}
        data: dict[str, str] = {}
        if model:
            data["model"] = model
        with httpx.Client(timeout=_TIMEOUT) as client:
            resp = client.post(url, headers=bearer_headers(key), files=files, data=data)
            resp.raise_for_status()
            payload = resp.json()
        text = ""
        if isinstance(payload, dict):
            text = str(payload.get("text") or "")
        return {"text": text, "duration_ms": 0}
