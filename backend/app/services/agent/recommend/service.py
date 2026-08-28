"""从 5 套真实挂牌里推荐 1 套。LLM 结构化输出；非法 listing_id 丢弃并回落规则版。"""

from __future__ import annotations

import json
import re
from typing import Any

import httpx

from app.config import llm_api_key, llm_base_url, llm_route_model
from app.data.listing_store import list_listings
from app.schemas.errors import GatewayError
from app.services.agent._openai_http import bearer_headers, join_url
from app.services.agent.chat.llm_provider import parse_route_json
from app.services.agent.facts import load as load_facts, rooms_of

_TIMEOUT = 8.0
_SYSTEM = (
    "你是小驻，只能从【房源目录】里推荐 1 套真实房源。"
    '只输出一个 JSON 对象：{"listing_id":"目录中的 id","reason":"一两句中文理由"}。'
    "理由必须基于该套房已列出的户型/面积/价格/朝向/标签/亮点/房间名，禁止编造目录没有的学区、地铁站、数字。"
    "listing_id 必须与目录 id 完全一致。不要 markdown。"
)
_GUIDE = "小驻没听清您的需求，换个说法试试，比如想要书房、四房，或总价更低一些。"


def _room_names(world_id: str | None) -> list[str]:
    if not world_id:
        return []
    graph = load_facts(world_id)
    if not graph:
        return []
    names: list[str] = []
    for room in rooms_of(graph):
        if not isinstance(room, dict):
            continue
        n = str(room.get("name") or "").strip()
        if n and n != "其他" and n not in names:
            names.append(n)
    return names


def _real_pool(listing_ids: list[str] | None) -> list[dict]:
    rows = [x for x in list_listings() if x.get("is_real") and x.get("id") and x.get("world_id")]
    allowed = {str(x["id"]) for x in rows}
    if listing_ids:
        want = {str(i).strip() for i in listing_ids if str(i).strip()}
        rows = [x for x in rows if str(x["id"]) in want and str(x["id"]) in allowed]
    return rows


def _catalog_line(item: dict) -> str:
    rooms = _room_names(str(item.get("world_id") or ""))
    tags = item.get("tags") if isinstance(item.get("tags"), list) else []
    tag_s = "、".join(str(t) for t in tags if t)
    return (
        f"id={item.get('id')} 楼盘={item.get('title')} 编号={item.get('code')} "
        f"户型={item.get('layout')} 面积={item.get('area')}㎡ 价格={item.get('price')} "
        f"朝向={item.get('orientation')} 楼层={item.get('floor')} "
        f"标签={tag_s} 亮点={item.get('highlight')} 房间={('、'.join(rooms) if rooms else '未列出')}"
    )


def _blob(item: dict) -> str:
    rooms = _room_names(str(item.get("world_id") or ""))
    tags = item.get("tags") if isinstance(item.get("tags"), list) else []
    return " ".join(
        str(x)
        for x in (
            item.get("id"),
            item.get("title"),
            item.get("code"),
            item.get("layout"),
            item.get("area"),
            item.get("price"),
            item.get("orientation"),
            item.get("floor"),
            item.get("highlight"),
            " ".join(str(t) for t in tags),
            " ".join(rooms),
        )
        if x not in (None, "")
    )


def _reason_grounded(reason: str, item: dict) -> bool:
    text = (reason or "").strip()
    if not text or len(text) > 180:
        return False
    blob = _blob(item)
    for num in re.findall(r"\d+(?:\.\d+)?", text):
        if num not in blob:
            return False
    for banned in ("学区", "地铁站", "物业费", "得房率"):
        if banned in text and banned not in blob:
            return False
    return True


def _rule_reason(item: dict, hits: list[str]) -> str:
    title = str(item.get("title") or "这套房")
    hl = str(item.get("highlight") or "").strip().rstrip("。")
    bit = "、".join(hits[:3]) if hits else hl
    if bit:
        return f"小驻推荐{title}：{bit}。"
    return f"小驻推荐{title}，供您先看看。"


def rule_recommend(query: str, pool: list[dict]) -> tuple[dict | None, str]:
    """关键词打分；零分则引导换需求。理由只引用 listing/房间已有字段。"""
    q = (query or "").strip()
    if not q or not pool:
        return None, _GUIDE
    ranked: list[tuple[int, dict, list[str]]] = []
    for item in pool:
        blob = _blob(item)
        score = 0
        hits: list[str] = []

        def add(n: int, label: str) -> None:
            nonlocal score
            score += n
            if label and label not in hits:
                hits.append(label)

        if "书房" in q and ("书房" in blob or "带书房" in blob):
            add(6, "带书房")
        if any(k in q for k in ("四房", "四室")) and "四" in str(item.get("layout") or ""):
            add(6, str(item.get("layout")))
        if any(k in q for k in ("三房", "三室")) and "三" in str(item.get("layout") or ""):
            add(3, str(item.get("layout")))
        if any(k in q for k in ("便宜", "总价低", "门槛", "低总价")):
            pn = item.get("price_num")
            if isinstance(pn, (int, float)) and pn <= 340:
                add(4, str(item.get("price")))
        if "地铁" in q and "地铁" in blob:
            add(4, "近地铁")
        if "南北" in q and "南北" in blob:
            add(4, str(item.get("orientation") or "南北"))
        if any(k in q for k in ("大客厅", "客厅大", "开间")) and ("客厅" in blob):
            add(3, "客厅开间")
        if "高楼层" in q and "高楼层" in blob:
            add(3, "高楼层")
        if any(k in q for k in ("小三房", "小户型", "86", "85")) and str(item.get("area")) in blob:
            add(3, f"{item.get('area')}㎡")
        ranked.append((score, item, hits))
    ranked.sort(key=lambda x: (-x[0], str(x[1].get("id"))))
    best_s, best, hits = ranked[0]
    if best_s <= 0:
        return None, _GUIDE
    return best, _rule_reason(best, hits)


def ask_llm(query: str, catalog: str) -> dict[str, Any] | None:
    """方舟 structured recommend；失败/超时/未配置返回 None。# 待确认：lite 未开通则走规则版。"""
    key = llm_api_key()
    base = llm_base_url()
    model = llm_route_model()
    if not key or not base or not model:
        return None
    messages = [
        {"role": "system", "content": _SYSTEM},
        {"role": "user", "content": f"用户需求：{query}\n\n【房源目录】\n{catalog}"},
    ]
    headers = {**bearer_headers(key), "Content-Type": "application/json"}
    url = join_url(base, "/chat/completions")
    payload = {"model": model, "messages": messages, "temperature": 0.2, "max_tokens": 220}
    try:
        with httpx.Client(timeout=_TIMEOUT) as client:
            resp = client.post(url, headers=headers, json=payload)
            data = resp.json()
            if resp.status_code >= 400:
                return None
            text = ""
            choices = data.get("choices") if isinstance(data, dict) else None
            if isinstance(choices, list) and choices:
                msg = choices[0].get("message") if isinstance(choices[0], dict) else None
                if isinstance(msg, dict):
                    text = str(msg.get("content") or "")
            return parse_route_json(text)
    except (httpx.TimeoutException, httpx.HTTPError, json.JSONDecodeError, TypeError, ValueError):
        return None
    except Exception:
        return None


def handle_recommend(
    *,
    session_id: str | None,
    user_text: str | None,
    listing_ids: list[str] | None = None,
) -> dict[str, Any]:
    if not (session_id or "").strip():
        raise GatewayError(400, "AGENT_ERROR", "session_id 必填")
    q = (user_text or "").strip()
    if not q:
        raise GatewayError(400, "AGENT_ERROR", "user_text 必填")
    pool = _real_pool(listing_ids)
    allowed = {str(x["id"]) for x in pool}
    if not pool:
        return {"reason": _GUIDE}

    catalog = "\n".join(_catalog_line(x) for x in pool)
    picked: dict | None = None
    reason = ""
    routed = ask_llm(q, catalog)
    if isinstance(routed, dict):
        lid = str(routed.get("listing_id") or "").strip()
        if lid in allowed:
            item = next(x for x in pool if str(x["id"]) == lid)
            llm_reason = str(routed.get("reason") or "").strip()
            if _reason_grounded(llm_reason, item):
                picked, reason = item, llm_reason
            else:
                picked, reason = item, _rule_reason(item, [])

    if picked is None:
        picked, reason = rule_recommend(q, pool)

    if picked is None:
        return {"reason": reason or _GUIDE}

    body: dict[str, Any] = {
        "listing_id": str(picked["id"]),
        "reason": reason if reason.startswith("小驻") or "小驻" in reason[:8] else f"小驻推荐：{reason}",
    }
    if picked.get("title"):
        body["title"] = picked["title"]
    if picked.get("code"):
        body["code"] = picked["code"]
    if picked.get("world_id"):
        body["world_id"] = picked["world_id"]
    return body
