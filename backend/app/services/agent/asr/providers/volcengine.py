"""豆包语音 ASR：大模型流式 WebSocket（流式识别 1.0）。

端点：wss://openspeech.bytedance.com/api/v3/sauc/bigmodel
文档：https://www.volcengine.com/docs/6561/1354869
二进制帧实现对照官方 veadk / 文档 header 布局。
"""

from __future__ import annotations

import asyncio
import gzip
import json
import struct
import uuid

from app.config import (
    asr_access_token,
    asr_app_id,
    asr_resource_id,
    asr_secret_key,
)
from app.services.agent.asr.providers.base import ASRProvider

_WS_URL = "wss://openspeech.bytedance.com/api/v3/sauc/bigmodel"
_TIMEOUT = 10.0
_CHUNK = 3200  # 待确认：约 100ms @ 16kHz s16le mono；压缩容器按字节切

_PROTOCOL_V1 = 0b0001
_HEADER_SIZE = 0b0001
_FULL_CLIENT = 0b0001
_AUDIO_ONLY = 0b0010
_SERVER_FULL = 0b1001
_SERVER_ERROR = 0b1111
_POS_SEQ = 0b0001
_NEG_WITH_SEQ = 0b0011
_JSON = 0b0001
_RAW = 0b0000
_GZIP = 0b0001


def _resource_candidates() -> list[str]:
    primary = asr_resource_id()
    # 待确认：控制台资源包可能是数字 ID；流式识别 1.0 小时版官方值为 volc.bigasr.sauc.duration
    aliases = [primary, "volc.bigasr.sauc.duration"]
    out: list[str] = []
    for item in aliases:
        if item and item not in out:
            out.append(item)
    return out


def handshake_headers(
    *,
    app_id: str,
    access_token: str,
    resource_id: str,
    secret_key: str = "",
) -> dict[str, str]:
    headers = {
        "X-Api-App-Key": app_id,
        "X-Api-Access-Key": access_token,
        "X-Api-Resource-Id": resource_id,
        "X-Api-Connect-Id": str(uuid.uuid4()),
        "X-Api-Request-Id": str(uuid.uuid4()),
    }
    if secret_key:
        headers["X-Api-Secret-Key"] = secret_key  # 待确认：1354869 旧版表未列 Secret-Key
    return headers


def _header(message_type: int, flags: int, serialization: int) -> bytes:
    return bytes(
        [
            (_PROTOCOL_V1 << 4) | _HEADER_SIZE,
            (message_type << 4) | flags,
            (serialization << 4) | _GZIP,
            0x00,
        ]
    )


def pack_full_client_request(seq: int, *, audio_format: str, codec: str) -> bytes:
    payload = {
        "user": {"uid": "ventureD"},
        "audio": {
            "format": audio_format,
            "codec": codec,
            "rate": 16000,
            "bits": 16,
            "channel": 1,
        },
        "request": {
            "model_name": "bigmodel",
            "enable_itn": True,
            "enable_punc": True,
        },
    }
    compressed = gzip.compress(json.dumps(payload).encode("utf-8"))
    out = bytearray(_header(_FULL_CLIENT, _POS_SEQ, _JSON))
    out.extend(struct.pack(">i", seq))
    out.extend(struct.pack(">I", len(compressed)))
    out.extend(compressed)
    return bytes(out)


def pack_audio_only(seq: int, segment: bytes, *, is_last: bool) -> bytes:
    flags = _NEG_WITH_SEQ if is_last else _POS_SEQ
    seq_val = -seq if is_last else seq
    header = _header(_AUDIO_ONLY, flags, _RAW)
    compressed = gzip.compress(segment or b"")
    out = bytearray(header)
    out.extend(struct.pack(">i", seq_val))
    out.extend(struct.pack(">I", len(compressed)))
    out.extend(compressed)
    return bytes(out)


def parse_server_frame(msg: bytes) -> dict:
    if len(msg) < 4:
        return {}
    header_size = msg[0] & 0x0F
    message_type = msg[1] >> 4
    flags = msg[1] & 0x0F
    serialization = msg[2] >> 4
    compression = msg[2] & 0x0F
    payload = msg[header_size * 4 :]
    result: dict = {
        "message_type": message_type,
        "is_last": bool(flags & 0x02),
        "code": 0,
        "payload": None,
    }
    if flags & 0x01 and len(payload) >= 4:
        result["sequence"] = struct.unpack(">i", payload[:4])[0]
        payload = payload[4:]
    if message_type == _SERVER_ERROR and len(payload) >= 8:
        result["code"] = struct.unpack(">i", payload[:4])[0]
        size = struct.unpack(">I", payload[4:8])[0]
        payload = payload[8 : 8 + size]
    elif message_type == _SERVER_FULL and len(payload) >= 4:
        size = struct.unpack(">I", payload[:4])[0]
        payload = payload[4 : 4 + size]
    if payload and compression == _GZIP:
        try:
            payload = gzip.decompress(payload)
        except Exception:
            return result
    if payload and serialization == _JSON:
        try:
            result["payload"] = json.loads(payload.decode("utf-8"))
        except Exception:
            pass
    return result


def extract_text(payload: object) -> str:
    if not isinstance(payload, dict):
        return ""
    result = payload.get("result")
    if isinstance(result, dict) and result.get("text"):
        return str(result["text"]).strip()
    if payload.get("text"):
        return str(payload["text"]).strip()
    return ""


def detect_audio_format(audio_bytes: bytes, filename: str) -> tuple[str, str]:
    name = (filename or "").lower()
    if audio_bytes[:4] == b"RIFF":
        return "wav", "raw"
    if audio_bytes[:4] == b"OggS" or name.endswith(".ogg"):
        return "ogg", "opus"
    if name.endswith(".mp3"):
        return "mp3", "raw"
    # 待确认：浏览器 webm/opus 按 ogg+opus 申报
    if name.endswith(".webm") or audio_bytes[:4] == b"\x1a\x45\xdf\xa3":
        return "ogg", "opus"
    return "raw", "raw"


def _split(data: bytes, size: int) -> list[bytes]:
    if not data:
        return [b""]
    return [data[i : i + size] for i in range(0, len(data), size)]


async def _recognize(audio_bytes: bytes, filename: str) -> tuple[str, int]:
    import websockets

    app_id = asr_app_id()
    token = asr_access_token()
    if not app_id or not token:
        raise RuntimeError("volcengine ASR 未配置 APP_ID 或 ACCESS_TOKEN")
    resources = _resource_candidates()
    if not resources:
        raise RuntimeError("volcengine ASR 未配置 RESOURCE_ID")
    fmt, codec = detect_audio_format(audio_bytes, filename)
    last_err: Exception | None = None
    for resource in resources:
        headers = handshake_headers(
            app_id=app_id,
            access_token=token,
            resource_id=resource,
            secret_key=asr_secret_key(),
        )
        connect_kw: dict = {"open_timeout": _TIMEOUT, "close_timeout": 3}
        try:
            try:
                connect = websockets.connect(_WS_URL, additional_headers=headers, **connect_kw)
            except TypeError:
                connect = websockets.connect(_WS_URL, extra_headers=headers, **connect_kw)
            text = ""
            async with connect as ws:
                seq = 1
                await ws.send(pack_full_client_request(seq, audio_format=fmt, codec=codec))
                seq += 1
                first = await asyncio.wait_for(ws.recv(), timeout=_TIMEOUT)
                if isinstance(first, (bytes, bytearray)):
                    parsed = parse_server_frame(bytes(first))
                    if parsed.get("code") not in (0, None):
                        raise RuntimeError(f"volcengine ASR handshake code={parsed.get('code')}")
                segments = _split(audio_bytes, _CHUNK)
                for i, segment in enumerate(segments):
                    last = i == len(segments) - 1
                    await ws.send(pack_audio_only(seq, segment, is_last=last))
                    if not last:
                        seq += 1
                deadline = asyncio.get_event_loop().time() + _TIMEOUT
                while True:
                    remain = deadline - asyncio.get_event_loop().time()
                    if remain <= 0:
                        break
                    raw = await asyncio.wait_for(ws.recv(), timeout=remain)
                    if not isinstance(raw, (bytes, bytearray)):
                        continue
                    parsed = parse_server_frame(bytes(raw))
                    got = extract_text(parsed.get("payload"))
                    if got:
                        text = got
                    if parsed.get("is_last") or (
                        parsed.get("code") not in (0, None) and parsed.get("code")
                    ):
                        break
            duration_ms = max(int(len(audio_bytes) / 32), 0)
            return text, duration_ms
        except Exception as exc:
            last_err = exc
            continue
    raise last_err or RuntimeError("volcengine ASR 失败")


class VolcengineASRProvider(ASRProvider):
    def transcribe(self, audio_bytes: bytes, *, filename: str = "audio.webm") -> dict:
        if not audio_bytes:
            return {"text": "", "duration_ms": 0}
        if not asr_app_id() or not asr_access_token():
            raise RuntimeError("volcengine ASR 未配置")
        text, duration_ms = asyncio.run(
            asyncio.wait_for(_recognize(audio_bytes, filename), timeout=_TIMEOUT)
        )
        return {"text": text, "duration_ms": int(duration_ms or 0)}
