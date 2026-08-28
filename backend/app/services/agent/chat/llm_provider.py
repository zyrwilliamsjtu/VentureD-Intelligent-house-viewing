"""Chat LLM 增强：规则版保底；openai_compat 只改写话术，失败返回 None。"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any

import httpx

from app.config import chat_provider_name, llm_api_key, llm_base_url, llm_model
from app.services.agent._openai_http import bearer_headers, join_url
from app.services.agent.chat.grounding import Facts, is_placeholder_value

# SPEC §0：chat 30s
_TIMEOUT = 30.0
_COMPLETIONS_PATH = "/chat/completions"
_RESPONSES_PATH = "/responses"

_SYSTEM = (
    "你是 AI 置业顾问小安。只根据用户消息后附带的【场景事实】回答，禁止编造。"
    "事实不足就明确说没有可靠信息。不要编造灶台、朝向、价格、品牌、升数等未出现在事实中的内容。"
    "不要输出坐标数字，不要改变事实含义。用简短中文。"
)

# 最近一次成功调用的路径，便于验收记录（不含密钥）
last_chat_api: str = ""


class ChatLLMProvider(ABC):
    @abstractmethod
    def enhance(
        self,
        facts: Facts,
        user_text: str | None,
        history: list[dict[str, Any]],
    ) -> str | None:
        """成功返回改写后的 reply_text；不可用返回 None（调用方用规则版）。"""


class StubChatLLMProvider(ChatLLMProvider):
    def enhance(
        self,
        facts: Facts,
        user_text: str | None,
        history: list[dict[str, Any]],
    ) -> str | None:
        _ = facts, user_text, history
        return None


def facts_brief(facts: Facts) -> str:
    """只序列化 grounding 已取到的字段，不把整份 scene_graph 塞进 prompt。"""
    lines: list[str] = []
    if facts.get("missing"):
        lines.append(f"无可靠匹配：{facts.get('query') or ''}")
    house = facts.get("house")
    if isinstance(house, dict):
        for key in ("type", "total_area", "title"):
            val = house.get(key)
            if val is not None and not is_placeholder_value(val):
                lines.append(f"house.{key}={val}")
        for key in ("orientation", "floor", "price"):
            val = house.get(key)
            if is_placeholder_value(val):
                lines.append(f"house.{key}=数据未提供")
            elif val is not None and str(val).strip():
                lines.append(f"house.{key}={val}")
        facts_blob = house.get("facts") if isinstance(house.get("facts"), dict) else {}
        highlight = facts_blob.get("highlight") if isinstance(facts_blob, dict) else None
        if highlight and not is_placeholder_value(highlight):
            lines.append(f"house.highlight={highlight}")
    room = facts.get("room")
    if isinstance(room, dict):
        lines.append(
            "房间: "
            + ", ".join(
                f"{k}={room.get(k)}"
                for k in ("id", "name", "area", "story_card")
                if room.get(k) not in (None, "")
            )
        )
        points = room.get("selling_points")
        if isinstance(points, list) and points:
            lines.append("selling_points=" + "；".join(str(p) for p in points))
    inst = facts.get("instance")
    if isinstance(inst, dict):
        attrs = inst.get("attrs") if isinstance(inst.get("attrs"), dict) else {}
        public = {k: v for k, v in attrs.items() if k != "source_label" and not is_placeholder_value(v)}
        lines.append(
            f"实例: category={inst.get('category')} tag={inst.get('tag')} attrs={public}"
        )
    host = facts.get("host_room")
    if isinstance(host, dict) and host.get("name"):
        lines.append(f"所在房间={host.get('name')}")
    return "\n".join(lines) if lines else "（无结构化事实）"


def _parse_completions(data: object) -> str | None:
    if not isinstance(data, dict):
        return None
    try:
        content = data["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError):
        return None
    text = str(content or "").strip()
    return text or None


def _parse_responses(data: object) -> str | None:
    if not isinstance(data, dict):
        return None
    direct = data.get("output_text")
    if isinstance(direct, str) and direct.strip():
        return direct.strip()
    chunks: list[str] = []
    for item in data.get("output") or []:
        if not isinstance(item, dict):
            continue
        content = item.get("content")
        if isinstance(content, str) and content.strip():
            chunks.append(content)
            continue
        if not isinstance(content, list):
            continue
        for part in content:
            if isinstance(part, dict) and part.get("text"):
                chunks.append(str(part["text"]))
    text = "".join(chunks).strip()
    return text or None


def _try_chat_completions(
    client: httpx.Client,
    base: str,
    model: str,
    messages: list[dict[str, str]],
    headers: dict[str, str],
) -> str | None:
    url = join_url(base, _COMPLETIONS_PATH)
    payload = {"model": model, "messages": messages, "temperature": 0.2}
    resp = client.post(url, headers=headers, json=payload)
    try:
        data = resp.json()
    except Exception:
        return None
    if resp.status_code >= 400:
        return None
    return _parse_completions(data)


def _try_responses(
    client: httpx.Client,
    base: str,
    model: str,
    messages: list[dict[str, str]],
    headers: dict[str, str],
) -> str | None:
    url = join_url(base, _RESPONSES_PATH)
    input_items: list[dict[str, object]] = []
    for item in messages:
        role = item.get("role")
        text = item.get("content") or ""
        if role == "system" or not text:
            continue
        # assistant 的 content type 待确认：按 OpenAI responses 用 output_text
        ctype = "output_text" if role == "assistant" else "input_text"
        input_items.append({"role": role, "content": [{"type": ctype, "text": text}]})
    payload: dict[str, object] = {
        "model": model,
        "instructions": _SYSTEM,
        "input": input_items,
        "temperature": 0.2,
    }
    resp = client.post(url, headers=headers, json=payload)
    try:
        data = resp.json()
    except Exception:
        return None
    if resp.status_code >= 400:
        return None
    return _parse_responses(data)


class OpenAICompatChatLLMProvider(ChatLLMProvider):
    def enhance(
        self,
        facts: Facts,
        user_text: str | None,
        history: list[dict[str, Any]],
    ) -> str | None:
        key = llm_api_key()
        base = llm_base_url()
        model = llm_model()
        if not key or not base or not model:
            return None
        brief = facts_brief(facts)
        user_block = (
            f"用户：{(user_text or '').strip() or '（无文本）'}\n\n【场景事实】\n{brief}"
        )
        messages: list[dict[str, str]] = [{"role": "system", "content": _SYSTEM}]
        for item in (history or [])[-6:]:
            if not isinstance(item, dict):
                continue
            role = item.get("role")
            text = item.get("text")
            if role in ("user", "assistant") and text:
                messages.append({"role": str(role), "content": str(text)})
        messages.append({"role": "user", "content": user_block})
        headers = {**bearer_headers(key), "Content-Type": "application/json"}
        global last_chat_api
        last_chat_api = ""
        with httpx.Client(timeout=_TIMEOUT) as client:
            text = _try_chat_completions(client, base, model, messages, headers)
            if text:
                last_chat_api = "chat/completions"
                return text
            text = _try_responses(client, base, model, messages, headers)
            if text:
                last_chat_api = "responses"
                return text
        return None


_REGISTRY: dict[str, type[ChatLLMProvider]] = {
    "stub": StubChatLLMProvider,
    "openai_compat": OpenAICompatChatLLMProvider,
}


def get_chat_llm_provider(name: str | None = None) -> ChatLLMProvider:
    key = (name if name is not None else chat_provider_name()).strip().lower() or "stub"
    cls = _REGISTRY.get(key, StubChatLLMProvider)
    return cls()
