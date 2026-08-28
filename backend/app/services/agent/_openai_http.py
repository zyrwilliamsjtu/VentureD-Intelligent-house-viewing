"""OpenAI 兼容 HTTP 小工具。端点路径待向 key 提供方确认，勿把 key 写入本文件。"""

from __future__ import annotations


def join_url(base: str, path: str) -> str:
    return base.rstrip("/") + "/" + path.lstrip("/")


def bearer_headers(api_key: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {api_key}"}
