"""GET /api/scene/{world_id} — implemented in a follow-up commit."""
from fastapi import APIRouter

router = APIRouter(prefix="/api/scene", tags=["scene"])
