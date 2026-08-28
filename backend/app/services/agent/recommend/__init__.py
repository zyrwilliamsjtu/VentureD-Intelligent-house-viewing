"""找房推荐（additive：POST /api/agent/recommend）。"""

from app.services.agent.recommend.service import handle_recommend

__all__ = ["handle_recommend"]
