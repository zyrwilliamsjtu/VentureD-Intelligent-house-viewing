"""Chat LLM 增强：规则版保底；openai_compat 只改写话术，失败返回 None。"""

from __future__ import annotations

import json
import re
from abc import ABC, abstractmethod
from typing import Any

import httpx

from app.config import chat_provider_name, llm_api_key, llm_base_url, llm_model, llm_route_model
from app.services.agent._openai_http import bearer_headers, join_url
from app.services.agent.chat.grounding import Facts, is_placeholder_value

_ROUTE_TIMEOUT = 8.0
_TIMEOUT = 30.0
_ROUTE_SYSTEM = (
    "你是置业顾问小安的意图分类器。只根据【目录】里出现的房间名、家具类、户型字段作答，禁止编造目录没有的内容。"
    "只输出一个 JSON 对象，不要 markdown，不要其它文字。"
    '格式：{"intent":"navigation|property|instance|clarify|unknown","room":null或目录中的房间名,'
    '"category":null或目录中的家具中文名,"asked_keys":[],"clarify":false,"confidence":0到1,'
    '"reply":"简短中文话术"}。'
    "开放问题若说不清对象：intent=clarify，reply 反问户型/价格/朝向。"
    "reply 里的数字必须来自目录；没有的价格朝向不要编。导航 intent 的 reply 不要写坐标。"
)
_COMPLETIONS_PATH = "/chat/completions"
_RESPONSES_PATH = "/responses"

_SYSTEM = (
    "你是 AI 置业顾问小安：友好、专业、销售式口吻，让客户感到被照顾，但绝不编造。"
    "只根据用户消息后附带的【场景事实】回答；事实里没有的价格/朝向/房间/家具/数字一律不许写出来。"
    "若事实写明无可靠匹配或数据未提供：先明确「该信息暂未提供」，再引导到【场景事实】里列出的可介绍内容。"
    "不要编造灶台、朝向、价格、品牌、升数、学区等未出现在事实中的内容。"
    "不要输出坐标数字，不要改变事实含义，不要编造新房间名。"
    "用简短自然的中文，像带看现场的顾问，不要冷冰冰的系统句。"
)

# 最近一次成功调用的路径，便于验收记录（不含密钥）
last_chat_api: str = ""
last_route_model: str = ""


class ChatLLMProvider(ABC):
    def route(
        self,
        user_text: str | None,
        catalog: str,
        history: list[dict[str, Any]],
    ) -> dict[str, Any] | None:
        """开放问题：结构化意图。失败返回 None。"""
        _ = user_text, catalog, history
        return None

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
        lines.append("该信息暂未提供。禁止编造。")
        hints = facts.get("hints") or ""
        if hints:
            lines.append("可引导（仅这些）：" + hints)
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
    if not facts.get("missing"):
        hints = facts.get("hints") or ""
        if hints:
            lines.append("可介绍：" + hints)
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


def parse_route_json(text: str | None) -> dict[str, Any] | None:
    """从模型输出里抠 JSON；失败返回 None。"""
    if not text or not str(text).strip():
        return None
    raw = str(text).strip()
    fence = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", raw, re.S)
    if fence:
        raw = fence.group(1)
    else:
        start = raw.find("{")
        end = raw.rfind("}")
        if start >= 0 and end > start:
            raw = raw[start : end + 1]
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return None
    return data if isinstance(data, dict) else None


def _try_chat_completions(
    client: httpx.Client,
    base: str,
    model: str,
    messages: list[dict[str, str]],
    headers: dict[str, str],
    *,
    max_tokens: int | None = None,
) -> str | None:
    url = join_url(base, _COMPLETIONS_PATH)
    payload: dict[str, object] = {"model": model, "messages": messages, "temperature": 0.2}
    if max_tokens is not None:
        payload["max_tokens"] = max_tokens
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
    *,
    instructions: str | None = None,
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
        "instructions": instructions or _SYSTEM,
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

    def route(
        self,
        user_text: str | None,
        catalog: str,
        history: list[dict[str, Any]],
    ) -> dict[str, Any] | None:
        key = llm_api_key()
        base = llm_base_url()
        model = llm_route_model()
        if not key or not base or not model:
            return None
        user_block = (
            f"用户：{(user_text or '').strip() or '（无文本）'}\n\n【目录】\n{catalog}"
        )
        messages: list[dict[str, str]] = [{"role": "system", "content": _ROUTE_SYSTEM}]
        for item in (history or [])[-4:]:
            if not isinstance(item, dict):
                continue
            role = item.get("role")
            text = item.get("text")
            if role in ("user", "assistant") and text:
                messages.append({"role": str(role), "content": str(text)[:200]})
        messages.append({"role": "user", "content": user_block})
        headers = {**bearer_headers(key), "Content-Type": "application/json"}
        global last_chat_api, last_route_model
        last_chat_api = ""
        last_route_model = model
        try:
            with httpx.Client(timeout=_ROUTE_TIMEOUT) as client:
                text = _try_chat_completions(
                    client, base, model, messages, headers, max_tokens=220
                )
                if text:
                    last_chat_api = "chat/completions"
                    parsed = parse_route_json(text)
                    if parsed:
                        return parsed
                text = _try_responses(
                    client, base, model, messages, headers, instructions=_ROUTE_SYSTEM
                )
                if text:
                    last_chat_api = "responses"
                    return parse_route_json(text)
        except httpx.TimeoutException:
            return None
        except Exception:
            return None
        return None


_REGISTRY: dict[str, type[ChatLLMProvider]] = {
    "stub": StubChatLLMProvider,
    "openai_compat": OpenAICompatChatLLMProvider,
}


def get_chat_llm_provider(name: str | None = None) -> ChatLLMProvider:
    key = (name if name is not None else chat_provider_name()).strip().lower() or "stub"
    cls = _REGISTRY.get(key, StubChatLLMProvider)
    return cls()
