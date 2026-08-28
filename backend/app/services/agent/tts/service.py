"""P0 TTS stub。无音频时省略 audio_url（SPEC §0 omit）。真实 TTS 需 key。"""

from __future__ import annotations


def synthesize(_text: str, *, voice: str | None = None) -> dict:
    return {}
