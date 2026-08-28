"""P2 chat LLM：规则版保底；未配置不改写。"""

from __future__ import annotations

import httpx
import pytest

from app.services.agent._openai_http import join_url
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


def test_join_url_keeps_v3_no_extra_v1() -> None:
    url = join_url("https://ark.cn-beijing.volces.com/api/v3", "/chat/completions")
    assert url == "https://ark.cn-beijing.volces.com/api/v3/chat/completions"
    assert "/v1/" not in url


def test_openai_compat_http_error_keeps_rule(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CHAT_PROVIDER", "openai_compat")
    monkeypatch.setenv("LLM_API_KEY", "ark-test-not-real")
    monkeypatch.setenv("LLM_BASE_URL", "https://example.invalid/api/v3")
    monkeypatch.setenv("LLM_MODEL", "doubao-1-5-pro-32k-250115")

    class _Boom:
        def __init__(self, *args: object, **kwargs: object) -> None:
            _ = args, kwargs

        def __enter__(self) -> "_Boom":
            return self

        def __exit__(self, *args: object) -> None:
            return None

        def post(self, *args: object, **kwargs: object) -> None:
            _ = args, kwargs
            raise httpx.ConnectError("llm down")

    monkeypatch.setattr("app.services.agent.chat.llm_provider.httpx.Client", _Boom)
    sid = "s_llm_http_err"
    session_store.clear(sid)
    body = handle_chat(session_id=sid, world_id=WORLD, user_text="主卧在哪")
    assert body["reply_text"]
    assert "主卧" in body["reply_text"]
    assert body["actions"][0]["type"] == "teleport"
    session_store.clear(sid)


def test_responses_fallback_when_completions_404(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CHAT_PROVIDER", "openai_compat")
    monkeypatch.setenv("LLM_API_KEY", "ark-test-not-real")
    monkeypatch.setenv("LLM_BASE_URL", "https://example.invalid/api/v3")
    monkeypatch.setenv("LLM_MODEL", "ep-test")

    class _Resp:
        def __init__(self, status: int, data: dict) -> None:
            self.status_code = status
            self._data = data

        def json(self) -> dict:
            return self._data

    calls = {"n": 0}

    class _Client:
        def __init__(self, *args: object, **kwargs: object) -> None:
            _ = args, kwargs

        def __enter__(self) -> "_Client":
            return self

        def __exit__(self, *args: object) -> None:
            return None

        def post(self, url: str, headers: dict, json: dict) -> _Resp:
            _ = headers
            calls["n"] += 1
            if url.endswith("/chat/completions"):
                return _Resp(404, {"error": {"message": "does not support chat/completions"}})
            assert url.endswith("/responses")
            assert json["model"] == "ep-test"
            assert json["input"]
            return _Resp(
                200,
                {
                    "output": [
                        {
                            "content": [
                                {"type": "output_text", "text": "根据场景事实，这套房适合三口之家。"}
                            ]
                        }
                    ]
                },
            )

    monkeypatch.setattr("app.services.agent.chat.llm_provider.httpx.Client", _Client)
    sid = "s_llm_responses"
    session_store.clear(sid)
    body = handle_chat(session_id=sid, world_id=WORLD, user_text="这套房适合什么人住")
    assert "三口" in body["reply_text"] or "适合" in body["reply_text"]
    assert calls["n"] == 2
    session_store.clear(sid)


def test_enhance_override_keeps_actions(monkeypatch: pytest.MonkeyPatch) -> None:
    class _Fake:
        called = False

        def enhance(self, facts, user_text, history):
            _ = facts, history
            type(self).called = True
            return f"LLM改写:{user_text}"

    monkeypatch.setattr(
        "app.services.agent.service.get_chat_llm_provider",
        lambda: _Fake(),
    )
    sid = "s_llm_fake"
    session_store.clear(sid)
    nav = handle_chat(session_id=sid, world_id=WORLD, user_text="主卧在哪")
    assert "带您去主卧" in nav["reply_text"]
    assert "LLM改写" not in nav["reply_text"]
    assert nav["actions"][0]["tp_id"] == "tp_bedroom_master"
    assert _Fake.called is False

    sid2 = "s_llm_fake_prop"
    session_store.clear(sid2)
    prop = handle_chat(session_id=sid2, world_id=WORLD, user_text="这套房适合什么人住")
    assert prop["reply_text"] == "LLM改写:这套房适合什么人住"
    session_store.clear(sid)
    session_store.clear(sid2)
