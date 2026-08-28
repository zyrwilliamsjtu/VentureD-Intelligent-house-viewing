"""Agent contract gateway (SPEC v2.2 §3). 语义实现：app.services.agent。"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, File, Request, UploadFile

from app.schemas.errors import GatewayError
from app.services.agent import (
    handle_asr,
    handle_chat,
    handle_narration,
    handle_tour,
    handle_tts,
)

router = APIRouter(prefix="/api/agent", tags=["agent"])


def _form_str(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text if text else None


@router.post("/chat")
async def chat(request: Request) -> dict:
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

    room_id = _form_str(body.get("room_id"))
    return handle_chat(
        session_id=session_id,
        world_id=world_id,
        user_text=user_text if isinstance(user_text, str) else None,
        event=event,
        room_id=room_id,
        audio=audio,
    )


@router.post("/asr")
def asr(request: Request, audio: UploadFile | None = File(None)) -> dict:
    """同步路由：FastAPI 放线程池执行，内部 asyncio.run 才不会撞上 uvicorn 事件循环。"""
    ctype = (request.headers.get("content-type") or "").lower()
    if "multipart/form-data" not in ctype:
        raise GatewayError(400, "ASR_FAILED", "需要 multipart/form-data 上传 audio")
    if audio is None:
        raise GatewayError(400, "ASR_FAILED", "缺少 audio")
    return handle_asr(audio)


@router.post("/tts")
async def tts(request: Request) -> dict:
    try:
        body = await request.json()
    except Exception:
        raise GatewayError(400, "TTS_FAILED", "请求体无效") from None
    if not isinstance(body, dict) or not body.get("text"):
        raise GatewayError(400, "TTS_FAILED", "text 必填")
    voice = body.get("voice")
    return handle_tts(str(body["text"]), voice=str(voice) if voice else None)


@router.get("/narration")
def narration(
    world_id: str | None = None,
    room_id: str | None = None,
    session_id: str | None = None,
) -> dict:
    if not world_id or not room_id:
        raise GatewayError(400, "AGENT_ERROR", "world_id 与 room_id 必填")
    return handle_narration(world_id, room_id, session_id=session_id)


@router.post("/tour")
async def tour(request: Request) -> dict:
    try:
        body = await request.json()
    except Exception:
        raise GatewayError(400, "AGENT_ERROR", "请求体无效") from None
    if not isinstance(body, dict):
        raise GatewayError(400, "AGENT_ERROR", "请求体无效")
    world_id = _form_str(body.get("world_id"))
    session_id = _form_str(body.get("session_id"))
    if not world_id or not session_id:
        raise GatewayError(400, "AGENT_ERROR", "world_id 与 session_id 必填")
    return handle_tour(world_id, session_id)
