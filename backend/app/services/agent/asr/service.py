"""P0 ASR stub。空语音返回 text=""，不报错（SPEC §3.2）。真实 ASR 需 key，见 AGENT_DEV L 层。"""

from __future__ import annotations


def transcribe(_audio: object | None = None) -> dict:
    return {"text": "", "duration_ms": 0}
