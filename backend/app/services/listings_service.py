"""GET /api/listings — SPEC §2.6."""
from __future__ import annotations

from app.data.listing_store import list_listings


def get_listings() -> dict:
    return {"listings": list_listings()}
