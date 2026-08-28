"""豆包语音 ASR：大模型流式 WebSocket 骨架。

端点：wss://openspeech.bytedance.com/api/v3/sauc/bigmodel
官方鉴权 Header：
  X-Api-App-Key = APP ID
  X-Api-Access-Key = Access Token
  X-Api-Resource-Id = volc.bigasr.sauc.duration | volc.bigasr.sauc.concurrent  # 待确认小时/并发
  X-Api-Connect-Id = UUID
新版控制台或仅需 X-Api-Key，待确认。

本轮未实现二进制帧（gzip + sequence）分包，也未引入 websockets 包（需装先问 PI）。
配置齐全时仍抛错，由 service 降级 stub，demo 不挂。
文档：https://www.volcengine.com/docs/6561/1354869
"""

from __future__ import annotations

import uuid

from app.config import asr_access_token, asr_app_id, asr_resource_id
from app.services.agent.asr.providers.base import ASRProvider

# 待确认：流式输入也可用 .../bigmodel_nostream
_WS_URL = "wss://openspeech.bytedance.com/api/v3/sauc/bigmodel"


def handshake_headers(*, app_id: str, access_token: str, resource_id: str) -> dict[str, str]:
    return {
        "X-Api-App-Key": app_id,
        "X-Api-Access-Key": access_token,
        "X-Api-Resource-Id": resource_id,
        "X-Api-Connect-Id": str(uuid.uuid4()),
        # 待确认：新版控制台是否改为 X-Api-Key
    }


class VolcengineASRProvider(ASRProvider):
    def transcribe(self, audio_bytes: bytes, *, filename: str = "audio.webm") -> dict:
        _ = audio_bytes, filename
        app_id = asr_app_id()
        token = asr_access_token()
        if not app_id or not token:
            raise RuntimeError("volcengine ASR 未配置 APP_ID 或 ACCESS_TOKEN")
        _ = handshake_headers(
            app_id=app_id,
            access_token=token,
            resource_id=asr_resource_id(),
        )
        _ = _WS_URL
        # 待确认：WebSocket 二进制协议（FULL_CLIENT_REQUEST / AUDIO_ONLY 分包 100-200ms）
        raise RuntimeError("volcengine ASR WebSocket 二进制协议待下轮实现")
