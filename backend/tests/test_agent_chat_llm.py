"""P2 chat LLM：规则版保底；未配置不改写。"""

from __future__ import annotations

import httpx
import pytest

from app.services.agent._openai_http import join_url
from app.services.agent.chat.llm_provider import StubChatLLMProvider, get_chat_llm_provider, _SYSTEM
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
                                {
                                    "type": "output_text",
                                    "text": '{"intent":"unknown","clarify":false,"confidence":0.8,"reply":"根据目录，这套房适合三口之家。"}',
                                }
                            ]
                        }
                    ]
                },
            )

    monkeypatch.setattr("app.services.agent.chat.llm_provider.httpx.Client", _Client)
    sid = "s_llm_responses"
    session_store.clear(sid)
    body = handle_chat(session_id=sid, world_id=WORLD, user_text="帮我参谋怎么住比较合适")
    assert body["reply_text"]
    assert calls["n"] == 2
    session_store.clear(sid)


def test_enhance_override_keeps_actions(monkeypatch: pytest.MonkeyPatch) -> None:
    class _Fake:
        routed = False
        enhanced = False

        def route(self, user_text, catalog, history):
            _ = catalog, history
            type(self).routed = True
            return {
                "intent": "navigation",
                "room": "主卧",
                "confidence": 0.92,
                "clarify": False,
                "reply": "好的，带您去主卧看看。",
            }

        def enhance(self, facts, user_text, history):
            _ = facts, history
            type(self).enhanced = True
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
    assert _Fake.routed is False
    assert _Fake.enhanced is False

    sid2 = "s_llm_fake_open"
    session_store.clear(sid2)
    opened = handle_chat(session_id=sid2, world_id=WORLD, user_text="帮我参谋怎么住比较合适")
    assert _Fake.routed is True
    assert "带您去主卧" not in opened["reply_text"]
    assert opened.get("actions") in (None, [])
    for a in opened.get("actions") or []:
        assert "position" not in a
    session_store.clear(sid)
    session_store.clear(sid2)


def test_llm_nav_intent_discards_llm_reply(monkeypatch: pytest.MonkeyPatch) -> None:
    class _Fake:
        def route(self, user_text, catalog, history):
            _ = user_text, catalog, history
            return {
                "intent": "navigation",
                "room": "主卧",
                "confidence": 0.99,
                "clarify": False,
                "reply": "三室一厅共有三间卧室，我带您空转一圈。",
            }

        def enhance(self, *args, **kwargs):
            return None

    monkeypatch.setattr("app.services.agent.service.get_chat_llm_provider", lambda: _Fake())
    sid = "s_llm_nav_guard"
    session_store.clear(sid)
    body = handle_chat(session_id=sid, world_id=WORLD, user_text="帮我参谋怎么住比较合适")
    assert "三室一厅共有三间卧室" not in body["reply_text"]
    assert "空转" not in body["reply_text"]
    assert body.get("actions") in (None, [])
    session_store.clear(sid)


def test_llm_route_drops_hallucinated_numbers(monkeypatch: pytest.MonkeyPatch) -> None:
    class _Fake:
        def route(self, user_text, catalog, history):
            _ = user_text, catalog, history
            return {
                "intent": "unknown",
                "confidence": 0.9,
                "clarify": False,
                "reply": "学区房501万，靠近地铁。",
            }

        def enhance(self, *args, **kwargs):
            return None

    monkeypatch.setattr(
        "app.services.agent.service.get_chat_llm_provider",
        lambda: _Fake(),
    )
    sid = "s_llm_hallu"
    session_store.clear(sid)
    body = handle_chat(session_id=sid, world_id=WORLD, user_text="帮我参谋怎么住比较合适")
    assert "501" not in body["reply_text"]
    assert "学区" not in body["reply_text"]
    assert "地铁" not in body["reply_text"]
    session_store.clear(sid)


def test_parse_route_json_extracts_object() -> None:
    from app.services.agent.chat.llm_provider import parse_route_json

    raw = '废话```json\n{"intent":"clarify","confidence":0.4}\n```'
    data = parse_route_json(raw)
    assert data is not None
    assert data["intent"] == "clarify"


def test_system_prompt_sales_and_no_hallucination() -> None:
    assert "暂未提供" in _SYSTEM
    assert "编造" in _SYSTEM
    assert "销售" in _SYSTEM or "置业顾问" in _SYSTEM


def test_route_uses_agent_route_model(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CHAT_PROVIDER", "openai_compat")
    monkeypatch.setenv("LLM_API_KEY", "ark-test-not-real")
    monkeypatch.setenv("LLM_BASE_URL", "https://example.invalid/api/v3")
    monkeypatch.setenv("LLM_MODEL", "doubao-pro-test")
    monkeypatch.setenv("AGENT_ROUTE_MODEL", "doubao-lite-test")
    seen: dict[str, str] = {}

    class _Resp:
        status_code = 200

        def json(self) -> dict:
            return {
                "choices": [
                    {
                        "message": {
                            "content": '{"intent":"clarify","confidence":0.9,"clarify":true,"reply":"您更关心户型、价格还是朝向？"}'
                        }
                    }
                ]
            }

    class _Client:
        def __init__(self, *args: object, **kwargs: object) -> None:
            _ = args
            seen["timeout"] = str(kwargs.get("timeout"))

        def __enter__(self) -> "_Client":
            return self

        def __exit__(self, *args: object) -> None:
            return None

        def post(self, url: str, headers: dict, json: dict) -> _Resp:
            _ = url, headers
            seen["model"] = str(json.get("model"))
            return _Resp()

    monkeypatch.setattr("app.services.agent.chat.llm_provider.httpx.Client", _Client)
    sid = "s_route_lite"
    session_store.clear(sid)
    body = handle_chat(session_id=sid, world_id=WORLD, user_text="帮我参谋怎么住比较合适")
    assert seen.get("model") == "doubao-lite-test"
    assert "8" in str(seen.get("timeout") or "")
    assert "户型" in body["reply_text"]
    session_store.clear(sid)


def test_route_timeout_falls_back_to_rules(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CHAT_PROVIDER", "openai_compat")
    monkeypatch.setenv("LLM_API_KEY", "ark-test-not-real")
    monkeypatch.setenv("LLM_BASE_URL", "https://example.invalid/api/v3")
    monkeypatch.setenv("LLM_MODEL", "ep-test")

    class _Client:
        def __init__(self, *args: object, **kwargs: object) -> None:
            _ = args, kwargs

        def __enter__(self) -> "_Client":
            return self

        def __exit__(self, *args: object) -> None:
            return None

        def post(self, *args: object, **kwargs: object) -> None:
            _ = args, kwargs
            raise httpx.TimeoutException("route timeout")

    monkeypatch.setattr("app.services.agent.chat.llm_provider.httpx.Client", _Client)
    sid = "s_route_to"
    session_store.clear(sid)
    body = handle_chat(session_id=sid, world_id=WORLD, user_text="帮我参谋怎么住比较合适")
    assert body["reply_text"]
    assert "户型" in body["reply_text"] or "房间" in body["reply_text"] or "家具" in body["reply_text"]
    assert "actions" not in body
    session_store.clear(sid)


def test_route_cache_second_call_skips_llm(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.services.agent.service import clear_route_cache

    clear_route_cache()
    calls = {"n": 0}

    class _Fake:
        def route(self, user_text, catalog, history):
            _ = user_text, catalog, history
            calls["n"] += 1
            return {
                "intent": "navigation",
                "room": "主卧",
                "confidence": 0.9,
                "clarify": False,
                "reply": "好的，带您去主卧看看。",
            }

        def enhance(self, *args, **kwargs):
            return None

    monkeypatch.setattr("app.services.agent.service.get_chat_llm_provider", lambda: _Fake())
    sid = "s_cache_1"
    session_store.clear(sid)
    a = handle_chat(session_id=sid, world_id=WORLD, user_text="帮我参谋怎么住比较合适")
    b = handle_chat(session_id="s_cache_2", world_id=WORLD, user_text="帮我参谋怎么住比较合适")
    assert calls["n"] == 1
    assert a["reply_text"] and b["reply_text"]
    assert "position" not in str(a.get("actions") or [])
    clear_route_cache()
    session_store.clear(sid)
    session_store.clear("s_cache_2")
