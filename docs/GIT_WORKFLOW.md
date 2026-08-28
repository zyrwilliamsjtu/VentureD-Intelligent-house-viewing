# Git 工作流与推送规则（全队 + Cursor 必须遵守）

> 目标：让仓库始终**白盒、可追溯、可回滚**。Cursor 的一切改动必须遵守本规则；PI 按此审查。

## 1. 分支模型（保持简单）

```
main              ← 演示版，永远可运行；只经 PR 合并（或 PI 管理员合并）
  ├── dev-backend   ← PI 后端开发（backend 改动走这里）
  ├── dev-agent     ← B 的 agent
  └── dev-frontend  ← A 的前端
```

- **永远不直接 push main**（main 已保护）。
- 每个板块在自己的 dev 分支开发。

## 2. 提交纪律（Cursor 必守）

1. **小步提交**：一个提交只做一件事（一个功能 / 一个修复 / 一个文档）。
2. **提交信息规范**：`模块: 做了什么`（如 `backend: 实现 GET /api/scene 路由`）。
3. **只 add 自己改的文件**：禁止 `git add .`（会误提交队友/无关文件）。
4. **push 前先 pull**：`git pull` 后再 `git push`，避免冲突。
5. **不 force**：禁止 `git push --force` / `-f`（会覆盖历史）。
6. **不提交大文件/密钥**：.ply/.env/token 绝不入库（见 .gitignore）。
7. **不提交无关改动**：不顺手改别人的文件、不重构无关代码。

## 3. 提交信息模板

```
backend: 实现 GET /api/scene/{world_id} 路由（按 world_id 路由 mock/真实）
agent: 完成 /api/agent/chat 非流式
docs: 更新 SPEC 附录 A 为前端对拍法
```

## 4. 合并到 main 的流程

- 默认走 **PR**：`dev-backend → main`，PI 审查后 Merge。
- PI 也可管理员直合（若未禁止绕过），但**必须保证 main 随时可运行**。
- 合并后立即 `git pull` 同步。

## 5. Cursor 的"白盒"承诺（每次任务）

- 每个任务开始：先 `git pull`，确认在自己分支。
- 每次提交：提交信息写清"做了什么、为什么"。
- 涉及接口/数据流变更：**先更新 `backend/README.md` / `SPEC.md`，再改代码**。
- 完成任务：汇报时列出**改了哪些文件、每条 commit、是否跑过测试**。
- 遇到冲突：停下，不擅自 force/删历史，向 PI 报告。

## 6. 可追溯 & 回滚

- 任何时刻 `git log --oneline` 都能看全历史。
- 出错回滚：`git revert <hash>` 或 `git checkout -- <file>`；**绝不 reset --hard 丢历史**（除非 PI 明确要求）。
- 每个里程碑（4h/12h/24h/36h）合并一次，main 始终可用。

## 7. 红线（违反即返工）

- ❌ `git add .` / `git add -A`
- ❌ `git push --force`
- ❌ 直接 push main
- ❌ 提交 .env / token / 大文件
- ❌ 改别人的板块文件（backend 不改 agent/、frontend/）
- ❌ 接口变更不先更新 SPEC 就改代码
- ❌ 一次提交塞多个无关改动

## 8. 命令速查

```
git branch                     # 看分支
git checkout dev-backend       # 切分支
git pull                       # 拉最新
git add <file>                 # 只加指定文件
git commit -m "backend: ..."   # 规范提交
git push                       # 推送
git log --oneline              # 看历史
git revert <hash>              # 回滚某提交
```
