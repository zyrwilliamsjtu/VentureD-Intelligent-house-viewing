"""Read mock/listings.json. Keys starting with _ are documentation-only."""
from __future__ import annotations

import json

from app.config import REPO_ROOT
from app.schemas.errors import GatewayError

LISTINGS_PATH = REPO_ROOT / "mock" / "listings.json"


def load_listings_file() -> dict:
    if not LISTINGS_PATH.is_file():
        raise GatewayError(500, "LISTINGS_UNAVAILABLE", "挂牌数据不可用")
    try:
        with LISTINGS_PATH.open("r", encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, json.JSONDecodeError) as exc:
        raise GatewayError(500, "LISTINGS_UNAVAILABLE", "挂牌数据不可用") from exc
    if not isinstance(data, dict):
        raise GatewayError(500, "LISTINGS_UNAVAILABLE", "挂牌数据不可用")
    return data


def list_listings() -> list[dict]:
    data = load_listings_file()
    raw = data.get("listings")
    if not isinstance(raw, list):
        raise GatewayError(500, "LISTINGS_UNAVAILABLE", "挂牌数据不可用")
    out: list[dict] = []
    for item in raw:
        if isinstance(item, dict):
            out.append(item)
    return out


def get_listing(listing_id: str | None) -> dict | None:
    if not listing_id:
        return None
    needle = listing_id.strip()
    if not needle:
        return None
    for item in list_listings():
        if item.get("id") == needle:
            return item
    return None
