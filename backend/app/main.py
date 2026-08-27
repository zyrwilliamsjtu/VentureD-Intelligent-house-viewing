"""FastAPI gateway entry: CORS + router registration."""
from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import cors_origins
from app.routers import agent, camera, scene

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


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
