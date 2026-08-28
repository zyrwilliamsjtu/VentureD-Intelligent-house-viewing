import sys
from pathlib import Path

import pytest

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))


@pytest.fixture(autouse=True)
def _isolate_agent_external_providers(monkeypatch: pytest.MonkeyPatch) -> None:
    """测试默认 stub，避免本机 .env 把 PROVIDER 开成 openai_compat 打到外网。"""
    monkeypatch.setenv("ASR_PROVIDER", "stub")
    monkeypatch.setenv("TTS_PROVIDER", "stub")
    monkeypatch.setenv("CHAT_PROVIDER", "stub")
