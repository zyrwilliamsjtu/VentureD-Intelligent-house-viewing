"""Understanding layer package (L0 Provider + L1 GT pipeline).

核心产出见 output.UnderstandingOutput（SPEC v2.2 scene_graph，供 B/A 消费）。
"""

from app.services.understanding.output import UnderstandingOutput

__all__ = ["UnderstandingOutput"]
