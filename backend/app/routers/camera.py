"""GET /api/camera_poses/{world_id} — SPEC §4 tp → 点云坐标映射。"""
from fastapi import APIRouter

from app.services.camera_service import get_camera_poses

router = APIRouter(prefix="/api/camera_poses", tags=["camera"])


@router.get("/{world_id}")
def read_camera_poses(world_id: str) -> dict:
    return get_camera_poses(world_id)
