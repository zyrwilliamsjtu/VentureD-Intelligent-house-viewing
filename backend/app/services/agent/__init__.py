"""AI agent 语义服务（网关内模块）。统一入口见 service.handle_*。"""

from app.services.agent.service import (
    handle_asr,
    handle_chat,
    handle_narration,
    handle_tour,
    handle_tts,
)

__all__ = [
    "handle_asr",
    "handle_chat",
    "handle_narration",
    "handle_tour",
    "handle_tts",
]
