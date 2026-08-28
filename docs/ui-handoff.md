# UI 重设计护栏说明（VentureD 智能看房 · 前端视觉版）

> **交接背景**：前端功能已全部就绪（漫游/语音/对话/传送/讲解），你的任务只做**视觉与交互美化**。本文列出不可破坏的架构约定——违反任何一条都会弄坏已实测通过的功能链路或制造合并冲突。
> 事实源：仓库 `VentureD-Intelligent-house-viewing` 分支 `dev/frontend`。日期：2026-08-28。

## 1. 一句话任务

美化第一人称 3D 看房的 HUD 与 Agent 对话面板（当前是工程师风格的功能性 UI）：开场页、漫游 HUD、AI 面板、toast、遮罩层。**只改样式与 DOM 结构，不改数据流。**

## 2. 分支与提交（红线）

- 分支 `dev/frontend`，开工 `git pull`
- **禁止 `git add .` / `-A`**；只 add 你改的文件
- 提交信息 `frontend-ui: 做了什么`；不 force push
- **绝对不碰**：`src/services/`、`src/scene/`、`src/store/`、`src/types/`、`backend/`、`agent/`、`docs/`（本文件除外不动）
- 你的改动面：`src/components/*.tsx`、`src/styles/global.css`、`index.html`、`public/`（只加静态资源）

## 3. 架构铁律（WORKLOG 决策 D6：UI 与逻辑解耦）

**UI 只从 store 读，逻辑只往 store 写。**具体到代码：

1. **`useAppStore` 只读**。你可消费的字段（全部已存在，别新增 store 字段）：

| 字段 | 类型 | 用途 |
|---|---|---|
| `entered` | boolean | 是否已过开场页 |
| `pointerLocked` | boolean | 第一人称指针锁定态 |
| `house` | House \| null | 房源信息（meta.title/area/floor/price/tags） |
| `houseLoading` / `houseError` | boolean / string | 加载态 |
| `toast` | {text, sub, key} | 中央提示（key 变化触发动画） |
| `player` | {world_id, position, facing, room_id} \| null | 玩家实时上下文（可用于"当前位置"显示） |

2. **事件绑定不许重写**。`WalkHud.tsx` 里的 `send()`、`startVoice()`、`finishVoice()`、`sendText()` 函数体**原样保留**，你只能改它们周围的 JSX/className。语音按钮的 `onPointerDown/Up/Leave` 三个事件绑定照抄。
3. **`useRoomNarration()` 调用保留**（WalkHud 顶部那行，删了进房讲解就没了）。
4. **组件只拆不并**：可以拆子组件文件（放 `components/`），但 `App.tsx` 的三件套结构（AholoViewport / WalkHud / Splash）不动——`AholoViewport.tsx` 一行都不要碰（3D 核心循环， WORKLOG 标注高风险文件）。

## 4. CSS 约定

1. 单文件 `global.css`，不引入 CSS 框架/新依赖（要加先在群里说）。
2. **固定类名**（JSX 引用它们，改名=断功能）：`walk-hud`、`hud-tl`、`hud-tr`、`agent-stub`、`agent-panel`、`agent-head`、`agent-list`、`agent-input`、`msg`、`voice-btn`（状态类 `recording`/`recognizing`）、`send`、`center-toast`、`ct-title`、`ct-sub`、`hint-bar`、`crosshair`、`resume-overlay`、`splash`。
3. **pointer-events 层级架构不许破坏**（2026-08-28 刚修过的 bug，见 WORKLOG 阶段 13）：
   - `.walk-hud` 整体 `pointer-events: none`，其内 `button` 为 `auto`（3D 画布要收鼠标事件，HUD 不能挡）
   - `.hud-tr` z-index 23 > `.agent-panel` 22 > `.resume-overlay` 21 > `.walk-hud` 20。改层级前想清楚这个顺序为什么成立。
4. 变量：`--glass` / `--glass-border` 是现有玻璃拟态变量，可改值可加新变量。
5. 录音态的视觉反馈必须保留（`.voice-btn.recording` 有脉冲动画、recognizing 有变色）——用户靠它知道正在录音。
6. `.crosshair` 必须保持 `pointer-events: none`。

## 5. 体验底线（这些场景改完必须仍可用）

- [ ] 开场页 → 进入 → WASD 漫游 → ESC → 点「点击继续漫游」恢复
- [ ] 点「小驻AI·询问」开面板（ESC 后也必须能点开，这是刚修的 bug，别改回去）
- [ ] 打字提问 → 收到回复 → 气泡自动滚到底
- [ ] 按住麦克风变录音态 → 松开出「语音识别中」→ 自动发出消息
- [ ] chat 等待期间输入框/麦克风/发送均禁用
- [ ] toast 出现 2.6s 后消失

## 6. 自测与交付

```bash
cd frontend && npm run build   # 必须过（tsc + vite）
npm run dev                     # 逐条过 §5 清单
```

交付：提交到 `dev/frontend` 并推送；WORKLOG 追加一节「阶段 N · UI 重设计」列改动文件。调试技巧：dev 模式浏览器 console 里有 `__appStore`（dev-only 调试钩子），如 `__appStore.getState().showToast('测试','副标题')` 可直接触发 toast 看样式。
