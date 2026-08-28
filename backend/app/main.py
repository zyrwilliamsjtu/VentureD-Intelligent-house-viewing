"""FastAPI gateway entry: CORS + router registration."""
from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app.config import BACKEND_ROOT, cors_origins, tts_output_dir
from app.routers import agent, camera, scene
from app.schemas.errors import GatewayError

app = FastAPI(title="VentureD Backend Gateway", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(scene.router)
app.include_router(agent.router)
app.include_router(camera.router)

tts_output_dir()
app.mount("/static", StaticFiles(directory=str(BACKEND_ROOT / "static")), name="static")


@app.exception_handler(GatewayError)
async def gateway_error_handler(_request, exc: GatewayError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content={"code": exc.code, "message": exc.message},
    )


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
