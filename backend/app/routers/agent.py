"""Agent contract passthrough (chat/asr/tts/narration/tour). Stub — B implements logic."""
from fastapi import APIRouter

router = APIRouter(prefix="/api/agent", tags=["agent"])
