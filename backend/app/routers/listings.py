"""GET /api/listings — SPEC v2.3 §2.6（查询参数只增）。"""
from fastapi import APIRouter

from app.services.listings_service import get_listings

router = APIRouter(tags=["listings"])


@router.get("/api/listings")
def read_listings(
    layout: str | None = None,
    price_min: str | None = None,
    price_max: str | None = None,
    q: str | None = None,
) -> dict:
    return get_listings(layout=layout, price_min=price_min, price_max=price_max, q=q)
