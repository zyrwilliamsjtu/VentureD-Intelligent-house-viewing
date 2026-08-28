from abc import ABC, abstractmethod


class ASRProvider(ABC):
    """transcribe：失败应抛异常或由调用方视为不可用，service 层降级 stub。"""

    @abstractmethod
    def transcribe(self, audio_bytes: bytes, *, filename: str = "audio.webm") -> dict:
        """返回 {"text": str, "duration_ms": int}。"""
