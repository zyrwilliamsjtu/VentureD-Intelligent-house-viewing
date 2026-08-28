"""GET /api/scene/{world_id} — SPEC v2.2 scene JSON."""
from fastapi import APIRouter

from app.services.scene_service import get_scene

router = APIRouter(prefix="/api/scene", tags=["scene"])


@router.get("/{world_id}")
def read_scene(world_id: str) -> dict:
    return get_scene(world_id)
