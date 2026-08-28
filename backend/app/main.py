"""FastAPI gateway entry: CORS + router registration + LAN static (dist + /ply)."""
from __future__ import annotations

import logging
import re

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from app.config import (
    BACKEND_ROOT,
    cors_origins,
    frontend_dist_dir,
    ply_scenes_dir,
    tts_output_dir,
)
from app.routers import agent, camera, listings, scene
from app.schemas.errors import GatewayError

log = logging.getLogger("uvicorn.error")

app = FastAPI(title="VentureD Backend Gateway", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(scene.router)
app.include_router(listings.router)
app.include_router(agent.router)
app.include_router(camera.router)

tts_output_dir()
app.mount("/static", StaticFiles(directory=str(BACKEND_ROOT / "static")), name="static")

_PLY_NAME = re.compile(r"^([0-9A-Za-z_]+)\.ply$")


@app.exception_handler(GatewayError)
async def gateway_error_handler(_request, exc: GatewayError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content={"code": exc.code, "message": exc.message},
    )


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/ply/{scene_file}")
def serve_ply(scene_file: str) -> FileResponse:
    """只读映射数据盘 `{scene}/3dgs_compressed.ply`。不改契约；ply 不入库。"""
    m = _PLY_NAME.fullmatch(scene_file)
    if not m:
        raise GatewayError(404, "NOT_FOUND", "ply 不可用")
    root = ply_scenes_dir()
    if root is None:
        raise GatewayError(404, "NOT_FOUND", "ply 不可用")
    root_r = root.resolve()
    path = (root_r / m.group(1) / "3dgs_compressed.ply").resolve()
    try:
        path.relative_to(root_r)
    except ValueError:
        raise GatewayError(404, "NOT_FOUND", "ply 不可用") from None
    if not path.is_file():
        raise GatewayError(404, "NOT_FOUND", "ply 不可用")
    return FileResponse(
        path,
        media_type="application/octet-stream",
        filename=scene_file,
        headers={"Cache-Control": "no-store"},
    )


def _mount_spa() -> None:
    dist = frontend_dist_dir()
    if dist is None:
        log.warning("frontend/dist 不存在：只提供 /api。局域网请先 cd frontend && npm run build")
        return
    app.mount("/", StaticFiles(directory=str(dist), html=True), name="spa")
    log.info("SPA mounted from %s", dist)


_mount_spa()
