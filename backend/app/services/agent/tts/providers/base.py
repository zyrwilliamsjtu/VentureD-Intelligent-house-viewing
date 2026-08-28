from abc import ABC, abstractmethod


class TTSProvider(ABC):
    @abstractmethod
    def synthesize(self, text: str, *, voice: str | None = None) -> dict:
        """成功可含 audio_url；无音频返回 {}。"""
