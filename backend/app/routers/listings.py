"""GET /api/listings — SPEC v2.3 §2.6."""
from fastapi import APIRouter

from app.services.listings_service import get_listings

router = APIRouter(tags=["listings"])


@router.get("/api/listings")
def read_listings() -> dict:
    return get_listings()
