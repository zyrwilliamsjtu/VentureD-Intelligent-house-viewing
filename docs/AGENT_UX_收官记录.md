# Agent UX 收官记录

> **性质**：`feat/agent-ux` 历轮产品/对话体验说明，供后来者对照代码。接口字段仍以 [`SPEC.md`](../SPEC.md) 为准。  
> **日期**：2026-08-29 · 已合 main 的最终版。  
> **不新增功能**：本文只记录已落地行为。

实现位置：`backend/app/services/agent/`（规则版 + 可选方舟）· `frontend/src/components/WalkHud.tsx` 等。细节见 [`AGENT_DEV.md`](./AGENT_DEV.md)。

---

## 人设

- 自称 **「小驻」**（规则版话术、带看 `speech`、LLM prompt）。
- 不编造学区/地铁/目录没有的数字；无可靠信息就说没有。
- 去掉「您刚提到「X」」一类回显。

---

## 发声

- **打字提问默认静音**；按住说话（PTT）识别后走 chat，带 `tts_url` 才自动播。
- 转房 / 导航到位：上屏 toast，不自动 TTS（避免和带看抢声）。
- 带看：每步 **强制飞入**（WASD 不能取消过渡）→ **speech 说完**再切下一房；介绍期内可走动。
- 独立 `POST /tts` 常为空；讲解依赖 chat/narration 的 `tts_url`。

---

## 导航与镜头

- Agent **只出 `tp_id`**，前端查 `camera_poses`（点云 Z-up）。
- 已在目标房间：短路，不再飞。
- 实例观察位：teleport 带 `lookAt`（点云系），朝向家具而非背对。
- **V**：回出生点并复位视角。
- 平滑飞入约 850ms；带看 `force` 时不可被 WASD 打断。

---

## 问答逻辑

- 快路径（在哪 / 带我去 / 户型价格等）规则版；开放问题可走 LLM 结构化路由，失败回规则版。
- **存在性**：scene 没有的实例明确说无，不补常识（如 0330 无灶台）。
- **介绍这套房**：挂牌 `listing_id` 赢过 scene 占位「待对拍」。
- **介绍这个房间 / 这里**：用前端 `room_id`；没有 room_id 则引导进房。
- 别名：睡觉的地方 → 主卧/次卧；看书学习 → 书房；洗漱/上厕所 → 卫生间。
- 挂牌问答：价格/面积/朝向/楼层以 listings 为准。

---

## 页面与 HUD（前端）

| 项 | 行为 |
|----|------|
| Splash → 列表 → 详情 → 3D | 点卡先 2D 户型，再「进入3D空间」 |
| 问问小驻 | `POST /api/agent/recommend`，只从真实 5 套选 1 套 |
| PlaceFacts | 去重挂牌 + 房间清单；不重复讲解长文 |
| **M** | 俯瞰图（去文字 polygon）+ `cloudToScene` 光点 |
| 底栏 | 两行键位，固定清晰 |
| 性能 | 外置 Chrome 易卡；演示用 Cursor 内置预览。漫游 HUD 关闭 `backdrop-filter` |

---

## 防幻觉（不变）

- recommend：`listing_id` 必须 ∈ 真实 5 套，否则丢弃并规则回落。
- 2D 户型只用真实 `polygon`，不编造门窗家具。
- `0309`/`0836` 的 `tp_living` 复用已对拍 `tp_kitchen`（无独立客厅），见各 `SOURCE.md`。
