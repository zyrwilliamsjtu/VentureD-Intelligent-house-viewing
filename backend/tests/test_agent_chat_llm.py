"""P2 chat LLM：规则版保底；未配置不改写。"""

from __future__ import annotations

import pytest

from app.services.agent.chat.llm_provider import StubChatLLMProvider, get_chat_llm_provider
from app.services.agent.service import handle_chat
from app.services.agent.session import store as session_store

WORLD = "w_0330_840483"


def test_factory_default_is_stub() -> None:
    assert isinstance(get_chat_llm_provider(), StubChatLLMProvider)


def test_stub_keeps_rule_reply() -> None:
    sid = "s_llm_stub"
    session_store.clear(sid)
    body = handle_chat(session_id=sid, world_id=WORLD, user_text="主卧在哪")
    assert "主卧" in body["reply_text"]
    assert body["actions"][0]["tp_id"] == "tp_bedroom_master"
    session_store.clear(sid)


def test_unconfigured_openai_compat_keeps_rule(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CHAT_PROVIDER", "openai_compat")
    monkeypatch.setenv("LLM_API_KEY", "")
    monkeypatch.setenv("LLM_BASE_URL", "")
    monkeypatch.setenv("LLM_MODEL", "")
    sid = "s_llm_none"
    session_store.clear(sid)
    body = handle_chat(session_id=sid, world_id=WORLD, user_text="主卧在哪")
    assert "主卧" in body["reply_text"]
    assert "501" not in body["reply_text"]
    session_store.clear(sid)


def test_enhance_override_keeps_actions(monkeypatch: pytest.MonkeyPatch) -> None:
    class _Fake:
        def enhance(self, facts, user_text, history):
            _ = facts, history
            assert user_text == "主卧在哪"
            return "根据场景事实，这是主卧。"

    monkeypatch.setattr(
        "app.services.agent.service.get_chat_llm_provider",
        lambda: _Fake(),
    )
    sid = "s_llm_fake"
    session_store.clear(sid)
    body = handle_chat(session_id=sid, world_id=WORLD, user_text="主卧在哪")
    assert body["reply_text"] == "根据场景事实，这是主卧。"
    assert body["actions"][0]["tp_id"] == "tp_bedroom_master"
    assert "501" not in body["reply_text"]
    session_store.clear(sid)
