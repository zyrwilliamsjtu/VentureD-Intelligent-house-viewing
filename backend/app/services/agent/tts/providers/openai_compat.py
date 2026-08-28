"""OpenAI 兼容 TTS。

待确认：base_url、模型、路径是否为 /audio/speech、返回二进制还是 JSON url。
"""

from __future__ import annotations

import base64

import httpx

from app.config import tts_api_key, tts_base_url, tts_model
from app.services.agent._openai_http import bearer_headers, join_url
from app.services.agent.tts.providers.base import TTSProvider

# SPEC §0：tts 15s
_TIMEOUT = 15.0
# 待确认：OpenAI 为 POST {base}/audio/speech
_PATH = "/audio/speech"


class OpenAICompatTTSProvider(TTSProvider):
    def synthesize(self, text: str, *, voice: str | None = None) -> dict:
        key = tts_api_key()
        base = tts_base_url()
        if not key or not base or not text.strip():
            raise RuntimeError("TTS openai_compat 未配置或文本为空")
        url = join_url(base, _PATH)
        model = tts_model() or "tts-1"  # 待确认
        payload = {
            "model": model,
            "input": text,
            "voice": voice or "alloy",  # 待确认：voice 枚举
        }
        headers = {**bearer_headers(key), "Content-Type": "application/json"}
        with httpx.Client(timeout=_TIMEOUT) as client:
            resp = client.post(url, headers=headers, json=payload)
            resp.raise_for_status()
            ctype = (resp.headers.get("content-type") or "").lower()
            if "application/json" in ctype:
                data = resp.json()
                if isinstance(data, dict) and data.get("url"):
                    return {"audio_url": str(data["url"])}
                if isinstance(data, dict) and data.get("audio_url"):
                    return {"audio_url": str(data["audio_url"])}
                raise RuntimeError("TTS JSON 无 url 字段")
            b64 = base64.b64encode(resp.content).decode("ascii")
            # 待确认：前端 Audio 可播 data URL；若需公网 GET 再改落地文件
            return {"audio_url": f"data:audio/mpeg;base64,{b64}"}
