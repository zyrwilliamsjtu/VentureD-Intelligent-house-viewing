# 接口契约（24h 冻结，只增不改）

## 1. 数据契约：三级语义结构 JSON（PI → B）
{
  "worldId": "w_xxx",
  "house": {
    "type": "两室一厅", "totalArea": 89, "orientation": "南向",
    "rooms": [{
      "id": "room_1", "type": "卧室", "name": "主卧", "area": 15,
      "trajectoryPointId": "tp_主卧",
      "instances": [
        {"id": "inst_1", "category": "床", "position": [1.2,0.0,2.1],
         "confidence": 0.87, "trajectoryPointId": "tp_主卧_床"}
      ]
    }]
  }
}

## 2. agent 契约（B 提供，经后端暴露）
- POST /api/agent/tour → { steps: [{trajectoryPointId, narration, sellingPoints[]}] }
- POST /api/agent/ask → { question, sessionId } → { answer, cameraTarget?, highlightInstances[] }
- 约定：导航一律输出轨迹点 id，不输出相机矩阵

## 3. 相机契约（PI → A）
- POST /api/camera/target（入参轨迹点 id）→ 触发渲染流推相机
- A 不碰 RenderCloud，只接渲染画面 WS