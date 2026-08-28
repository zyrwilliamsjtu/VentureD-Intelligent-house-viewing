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
# 待确认：OpenAI 为 POST {base}/chat/completions
_PATH = "/chat/completions"

_SYSTEM = (
    "你是 AI 置业顾问小安。只根据用户消息后附带的【场景事实】回答，禁止编造。"
    "事实不足就明确说没有可靠信息。不要编造灶台、朝向、价格、品牌、升数等未出现在事实中的内容。"
    "不要输出坐标数字，不要改变事实含义。用简短中文。"
)


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
        url = join_url(base, _PATH)
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
        payload = {"model": model, "messages": messages, "temperature": 0.2}
        headers = {**bearer_headers(key), "Content-Type": "application/json"}
        with httpx.Client(timeout=_TIMEOUT) as client:
            resp = client.post(url, headers=headers, json=payload)
            resp.raise_for_status()
            data = resp.json()
        try:
            content = data["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError):
            return None
        text = str(content or "").strip()
        return text or None


_REGISTRY: dict[str, type[ChatLLMProvider]] = {
    "stub": StubChatLLMProvider,
    "openai_compat": OpenAICompatChatLLMProvider,
}


def get_chat_llm_provider(name: str | None = None) -> ChatLLMProvider:
    key = (name if name is not None else chat_provider_name()).strip().lower() or "stub"
    cls = _REGISTRY.get(key, StubChatLLMProvider)
    return cls()
