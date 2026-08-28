"""豆包语音 TTS：V3 HTTP Chunked 单向流式（SeedTTS2.0）。

端点：POST https://openspeech.bytedance.com/api/v3/tts/unidirectional
文档：https://www.volcengine.com/docs/6561/1598757
请求体用官方 V3 `req_params`（不是 V1 的 app/audio/request）。
"""

from __future__ import annotations

import base64
import json
import uuid

import httpx

from app.config import (
    tts_access_token,
    tts_app_id,
    tts_output_dir,
    tts_resource_id,
    tts_secret_key,
    tts_voice,
)
from app.services.agent.tts.providers.base import TTSProvider

_URL = "https://openspeech.bytedance.com/api/v3/tts/unidirectional"
_TIMEOUT = 15.0
_END = 20000000


def _auth_headers(resource_id: str) -> dict[str, str]:
    req_id = str(uuid.uuid4())
    headers = {
        # 官方旧版控制台 TTS V3：X-Api-App-Id；ASR 文档为 X-Api-App-Key。两者都带，待确认。
        "X-Api-App-Id": tts_app_id(),
        "X-Api-App-Key": tts_app_id(),
        "X-Api-Access-Key": tts_access_token(),
        "X-Api-Resource-Id": resource_id,
        "X-Api-Request-Id": req_id,
        "X-Api-Connect-Id": req_id,  # 待确认：HTTP Chunked 是否需要 Connect-Id
        "Content-Type": "application/json",
    }
    secret = tts_secret_key()
    if secret:
        headers["X-Api-Secret-Key"] = secret  # 待确认：V3 HTTP 文档未列此头
    return headers


def _resource_candidates() -> list[str]:
    primary = tts_resource_id()
    # 待确认：控制台资源包可能是数字 ID；V3 接口 2.0 字符版官方值为 seed-tts-2.0
    aliases = [primary, "seed-tts-2.0"]
    out: list[str] = []
    for item in aliases:
        if item and item not in out:
            out.append(item)
    return out


def _collect_audio(resp: httpx.Response) -> bytes:
    chunks: list[bytes] = []
    for line in resp.iter_lines():
        if not line:
            continue
        raw = line.decode("utf-8") if isinstance(line, (bytes, bytearray)) else str(line)
        if raw.startswith("data:"):
            raw = raw[5:].strip()
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            continue
        if not isinstance(data, dict):
            continue
        code = int(data.get("code") or 0)
        if code == _END:
            break
        if code not in (0, 3000) and data.get("data") is None:
            raise RuntimeError(f"volcengine TTS V3 code={code} message={data.get('message')}")
        b64 = data.get("data")
        if isinstance(b64, str) and b64:
            chunks.append(base64.b64decode(b64))
    return b"".join(chunks)


class VolcengineTTSProvider(TTSProvider):
    def synthesize(self, text: str, *, voice: str | None = None) -> dict:
        appid = tts_app_id()
        token = tts_access_token()
        resource = tts_resource_id()
        if not appid or not token or not (text or "").strip():
            raise RuntimeError("volcengine TTS 未配置 APP_ID/TOKEN 或文本为空")
        resources = _resource_candidates()
        if not resources:
            raise RuntimeError("volcengine TTS 未配置 RESOURCE_ID")
        speaker = (voice or tts_voice()).strip()
        payload = {
            "user": {"uid": "ventureD"},
            "req_params": {
                "text": text,
                "speaker": speaker,  # 待确认：SeedTTS2.0 控制台音色名
                "audio_params": {"format": "mp3", "sample_rate": 24000},
            },
        }
        last_err = "volcengine TTS V3 无音频数据"
        with httpx.Client(timeout=_TIMEOUT) as client:
            for resource in resources:
                with client.stream(
                    "POST", _URL, headers=_auth_headers(resource), json=payload
                ) as resp:
                    if resp.status_code >= 400:
                        body = ""
                        try:
                            body = resp.read().decode("utf-8", errors="replace")[:240]
                        except Exception:
                            body = ""
                        last_err = f"volcengine TTS HTTP {resp.status_code} {body}"
                        if "45000030" in body or "not granted" in body.lower():
                            continue
                        raise RuntimeError(last_err)
                    audio = _collect_audio(resp)
                if audio:
                    name = f"{uuid.uuid4().hex}.mp3"
                    path = tts_output_dir() / name
                    path.write_bytes(audio)
                    return {"audio_url": f"/static/tts/{name}"}
        raise RuntimeError(last_err)
