"""豆包语音 TTS：V1 HTTP 非流式。

接口：POST https://openspeech.bytedance.com/api/v1/tts
鉴权：Header Authorization: Bearer;${access_token}（分号，不是空格）
文档：https://www.volcengine.com/docs/6561/1257584
"""

from __future__ import annotations

import base64
import uuid

import httpx

from app.config import tts_access_token, tts_app_id, tts_output_dir, tts_voice
from app.services.agent.tts.providers.base import TTSProvider

_URL = "https://openspeech.bytedance.com/api/v1/tts"
_TIMEOUT = 15.0
_CLUSTER = "volcano_tts"  # 官方 V1 cluster
_OK = 3000


class VolcengineTTSProvider(TTSProvider):
    def synthesize(self, text: str, *, voice: str | None = None) -> dict:
        appid = tts_app_id()
        token = tts_access_token()
        if not appid or not token or not (text or "").strip():
            raise RuntimeError("volcengine TTS 未配置或文本为空")
        voice_type = (voice or tts_voice()).strip()
        payload = {
            "app": {
                "appid": appid,
                "token": token,  # 官方：body.token 无实际鉴权，可非空任意
                "cluster": _CLUSTER,
            },
            "user": {"uid": "ventureD"},
            "audio": {
                "voice_type": voice_type,
                "encoding": "mp3",
                "speed_ratio": 1.0,
                "loudness_ratio": 1.0,  # 官方 V1 为 loudness_ratio；旧文档 volume_ratio 待确认
                # pitch_ratio：官方 V1 写暂不支持音高，不传
            },
            "request": {
                "reqid": str(uuid.uuid4()),
                "text": text,
                "operation": "query",
            },
        }
        headers = {
            "Authorization": f"Bearer;{token}",
            "Content-Type": "application/json",
        }
        with httpx.Client(timeout=_TIMEOUT) as client:
            resp = client.post(_URL, headers=headers, json=payload)
            try:
                data = resp.json()
            except Exception:
                resp.raise_for_status()
                raise RuntimeError("volcengine TTS 响应非 JSON")
        if not isinstance(data, dict) or int(data.get("code") or 0) != _OK:
            code = data.get("code") if isinstance(data, dict) else None
            msg = data.get("message") if isinstance(data, dict) else None
            raise RuntimeError(f"volcengine TTS 失败 code={code} message={msg}")
        raw_b64 = data.get("data")
        if not raw_b64:
            raise RuntimeError("volcengine TTS 响应无 data")
        audio = base64.b64decode(raw_b64)
        name = f"{uuid.uuid4().hex}.mp3"
        path = tts_output_dir() / name
        path.write_bytes(audio)
        return {"audio_url": f"/static/tts/{name}"}
