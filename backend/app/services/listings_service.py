"""GET /api/listings — SPEC §2.6（可选查询参数只增不改）。"""
from __future__ import annotations

from typing import Any

from app.data.listing_store import list_listings
from app.schemas.errors import GatewayError


def _parse_price(raw: str | None, name: str) -> float | None:
    if raw is None:
        return None
    text = str(raw).strip()
    if not text:
        return None
    try:
        return float(text)
    except ValueError as exc:
        raise GatewayError(400, "AGENT_ERROR", f"{name} 无效") from exc


def _blob(item: dict[str, Any]) -> str:
    tags = item.get("tags")
    tag_s = " ".join(str(t) for t in tags) if isinstance(tags, list) else ""
    return " ".join(
        str(item.get(k) or "")
        for k in ("title", "code", "layout", "highlight", "orientation", "floor")
    ) + " " + tag_s


def filter_listings(
    rows: list[dict[str, Any]],
    *,
    layout: str | None = None,
    price_min: float | None = None,
    price_max: float | None = None,
    q: str | None = None,
) -> list[dict[str, Any]]:
    layout_n = (layout or "").strip()
    q_n = (q or "").strip().lower()
    out: list[dict[str, Any]] = []
    for item in rows:
        if not isinstance(item, dict):
            continue
        if layout_n and layout_n not in str(item.get("layout") or ""):
            continue
        pn = item.get("price_num")
        if price_min is not None:
            if not isinstance(pn, (int, float)) or float(pn) < price_min:
                continue
        if price_max is not None:
            if not isinstance(pn, (int, float)) or float(pn) > price_max:
                continue
        if q_n and q_n not in _blob(item).lower():
            continue
        out.append(item)
    return out


def get_listings(
    layout: str | None = None,
    price_min: str | None = None,
    price_max: str | None = None,
    q: str | None = None,
) -> dict:
    """无参返回全部；组合参数取交集。price_* 非数字 → 400。"""
    lo = _parse_price(price_min, "price_min")
    hi = _parse_price(price_max, "price_max")
    rows = list_listings()
    if not layout and lo is None and hi is None and not (q or "").strip():
        return {"listings": rows}
    return {"listings": filter_listings(rows, layout=layout, price_min=lo, price_max=hi, q=q)}
