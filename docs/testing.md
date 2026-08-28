# 测试 / 自测清单（Testing & QA Checklist）

> 三部分：自动化测试（后端 pytest / 前端 build）、手动端到端（Golden Path）、演示前最终 checklist。
> 日期：2026-08-28。

---

## 1. 自动化测试

### 1.1 后端（pytest，在 `main` / `dev-backend` 分支）

```bash
cd backend
pip install -r requirements.txt
pytest -q          # 全量
pytest tests/test_agent_chat.py -q   # 单文件
```

测试覆盖（`backend/tests/`）：

| 分类 | 文件 |
|---|---|
| 数据契约 | `test_scene.py` · `test_camera.py` · `test_listings_multiworld.py` |
| 理解层 | `test_understanding.py` |
| Agent 网关/服务 | `test_agent_gateway.py` · `test_agent_service.py` · `test_agent_chat.py` · `test_agent_chat_llm.py` |
| 语音 | `test_agent_asr.py` · `test_asr_volcengine.py` · `test_agent_tts.py` · `test_tts_volcengine.py` |
| 带看/讲解 | `test_agent_tour_narration.py` |
| 端到端 | `acceptance/test_agent_full_link.py` · `test_backend_acceptance.py` |

### 1.2 前端（构建）

```bash
cd frontend
npm run build        # tsc 类型检查 + vite 构建，必须零报错
```

---

## 2. 手动端到端（Golden Path，联调第一件事）

1. 起后端 → `curl http://127.0.0.1:8000/health` 返回 ok。
2. 起前端 → 打开落地页，确认 Hero/搜索卡/三张效果图房源卡渲染。
3. `开始看房` → 列表页 5 套房源、三套平面图、两套点云 SVG 户型图。
4. 点「翡翠云邸」→ 进 3D 漫游，WASD 走动 + 鼠标视角正常。
5. 按 `T` 呼出 AI 面板，输入「主卧在哪」→ 收到回复 + 触发 teleport 瞬移。
6. 按住 🎙 说话 → 松开 → 识别 → 自动发送 → 回复 + 朗读。

---

## 3. 体验底线（改 UI 后必须仍可用）

- [ ] 开场页 → 进入 → WASD 漫游 → ESC → 点「点击继续漫游」恢复
- [ ] ESC 后仍能点开「AI 讲解 · 询问」面板
- [ ] 打字提问 → 回复 → 气泡自动滚到底
- [ ] 按住麦克风变录音态 → 松开「语音识别中」→ 自动发出
- [ ] chat 等待期间输入框/麦克风/发送均禁用
- [ ] toast 出现 2.6s 后自动消失
- [ ] 落地页/列表页滚动流畅（无 3D 引擎空转）

---

## 4. 降级矩阵验证（后端不可达时）

| 场景 | 期望表现 |
|---|---|
| 后端未启动 | 落地页/列表/3D 仍可用；AI 面板报「Agent 暂不可用」 |
| ASR 失败 / 空语音 | 打字输入可用；提示「没听清」 |
| TTS 无 key / 失败 | 气泡正常，朗读静默 |
| 点云未加载完 | 加载仪表盘逐步上屏，不黑屏卡死（20s 超时兜底） |
| 未提供素材的房源 | 效果图回退占位、户型图回退点云 SVG |

---

## 5. 演示前最终 checklist

- [ ] `npm run build` 通过（前端）；`pytest -q` 通过（后端）
- [ ] 落地页三张效果图、列表三张平面图加载成功
- [ ] 搜索筛选（户型/价格）→ 列表过滤 + 清除恢复
- [ ] 进房 → 漫游 → 语音/打字问答 → 瞬移一条链跑通
- [ ] 后端 `.env` 已填真实 key（或确认 stub 降级文案）
- [ ] 若公网演示：Pages 已发布、后端已部署、`VITE_API_BASE` 已指对