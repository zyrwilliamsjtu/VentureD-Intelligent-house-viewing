"""Agent contract gateway (SPEC v2.2 §3). Stub only — no agent business logic.

TODO: 待接入 B 的 agent 实现（透传 session_id，转发 chat/asr/tts/narration/tour）。
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Request

from app.schemas.errors import GatewayError

router = APIRouter(prefix="/api/agent", tags=["agent"])

_STUB_REPLY = "（stub）契约测试回复，agent 逻辑待接入。"


def _form_str(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text if text else None


@router.post("/chat")
async def chat(request: Request) -> dict:
    # TODO: 待接入 agent 实现（按 session_id 维护多轮上下文）
    ctype = (request.headers.get("content-type") or "").lower()
    audio = None
    body: dict[str, Any] = {}
    if "multipart/form-data" in ctype:
        form = await request.form()
        for key, value in form.items():
            if key == "audio":
                audio = value
            else:
                body[key] = value
    elif "application/json" in ctype:
        parsed = await request.json()
        if not isinstance(parsed, dict):
            raise GatewayError(400, "AGENT_ERROR", "请求体无效")
        body = parsed
    else:
        raise GatewayError(400, "AGENT_ERROR", "请求体无效")

    session_id = _form_str(body.get("session_id"))
    world_id = _form_str(body.get("world_id"))
    if not session_id or not world_id:
        raise GatewayError(400, "AGENT_ERROR", "session_id 与 world_id 必填")

    user_text = body.get("user_text")
    if user_text is not None and not isinstance(user_text, str):
        user_text = str(user_text)
    event = _form_str(body.get("event"))
    has_text = bool(user_text)
    has_audio = audio is not None
    # SPEC：user_text 与 audio 二选一，同时存在以 user_text 为准；enter_room 时 user_text 可为 null
    if not has_text and not has_audio and event != "enter_room":
        raise GatewayError(400, "AGENT_ERROR", "user_text 与 audio 二选一")

    _ = session_id  # stub 阶段仅透传，不落会话存储
    return {
        "reply_text": _STUB_REPLY,
        "tts_url": None,
        "actions": [],
    }


@router.post("/asr")
async def asr(request: Request) -> dict:
    # TODO: 待接入 agent ASR
    ctype = (request.headers.get("content-type") or "").lower()
    if "multipart/form-data" not in ctype:
        raise GatewayError(400, "ASR_FAILED", "需要 multipart/form-data 上传 audio")
    form = await request.form()
    if "audio" not in form:
        raise GatewayError(400, "ASR_FAILED", "缺少 audio")
    return {"text": "", "duration_ms": 0}


@router.post("/tts")
async def tts(request: Request) -> dict:
    # TODO: 待接入 agent TTS（同文本可缓存）
    try:
        body = await request.json()
    except Exception:
        raise GatewayError(400, "TTS_FAILED", "请求体无效") from None
    if not isinstance(body, dict) or not body.get("text"):
        raise GatewayError(400, "TTS_FAILED", "text 必填")
    return {"audio_url": None}


@router.get("/narration")
def narration(world_id: str | None = None, room_id: str | None = None) -> dict:
    # TODO: 待接入 agent 进房讲解；无内容时按 SPEC 可 404
    if not world_id or not room_id:
        raise GatewayError(400, "AGENT_ERROR", "world_id 与 room_id 必填")
    return {"reply_text": "（stub）", "tts_url": None}


@router.post("/tour")
async def tour(request: Request) -> dict:
    # TODO: 待接入 agent tour（主动讲解以 narration + enter_room 为主）
    try:
        body = await request.json()
    except Exception:
        raise GatewayError(400, "AGENT_ERROR", "请求体无效") from None
    if not isinstance(body, dict):
        raise GatewayError(400, "AGENT_ERROR", "请求体无效")
    if not _form_str(body.get("world_id")) or not _form_str(body.get("session_id")):
        raise GatewayError(400, "AGENT_ERROR", "world_id 与 session_id 必填")
    return {"steps": []}
