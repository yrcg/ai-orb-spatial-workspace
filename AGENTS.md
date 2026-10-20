# AGENTS.md

本文件给在本仓库工作的 AI 代理（以及新加入的开发者）提供**仓库位置、连接方式、
分支约定和不可违反的红线**。改动代码前请先读完本文件与 `docs/README.md`。

---

## 1. 仓库地址

| 项 | 值 |
|---|---|
| GitHub | https://github.com/yrcg/ai-orb-spatial-workspace |
| 协议 | HTTPS（本机到 github.com 的直连被网络阻断，必须走代理，见第 2 节） |
| 默认分支 | `main` |
| 功能分支 | `feat/ai-spatial-workspace`（空间工作区探索分支，**未合并**） |
| 本地路径 | `C:\Users\LENOVO\WorkBuddy\2026-10-12-14-49-27\desktop-pet\minicpm-demo` |
| 可见性 | Public（创建时未指定私有） |

远端配置：

```
origin  https://github.com/yrcg/ai-orb-spatial-workspace.git (fetch)
origin  https://github.com/yrcg/ai-orb-spatial-workspace.git (push)
```

---

## 2. 连接方式（重要）

### 2.1 必须走代理

本机直连 `github.com:443` 会超时（`Recv failure: Connection was reset`）。
系统代理运行在 `127.0.0.1:33210`，已写入**仓库级** git 配置（不是全局）：

```bash
git config http.proxy  http://127.0.0.1:33210
git config https.proxy http://127.0.0.1:33210
```

如果代理端口变了，用同样两条命令改本仓库配置即可，**不要**改 `--global`，
以免影响其他项目的网络行为。

### 2.2 GitHub CLI

`gh` 已登录为 `yrcg`（keyring，fine-grained PAT）。该 token 的已知权限边界：

- ✅ 可以 `gh api` 读写本仓库内容、`git push`
- ❌ 不能创建仓库（`Resource not accessible by personal access token (createRepository)`）
- ❌ 不能读写 `user/keys`、`repos/.../keys`

所以新仓库需要先用网页或 `gh auth login -s repo` 重新授权，不要在这上面反复重试。

### 2.3 验证连通性

```bash
git ls-remote origin          # 有输出即通
gh api repos/yrcg/ai-orb-spatial-workspace --jq '.permissions'
```

---

## 3. 日常命令

```bash
# 拉取
git fetch origin
git pull --ff-only origin main

# 在功能分支上工作
git checkout feat/ai-spatial-workspace
git rebase origin/main          # 或 merge，见第 4 节

# 前端
cd web
npx tsc --noEmit                # 类型检查（必须通过）
npm run build                   # 产物 → public/dist/app.js
npm run dev                     # Vite 开发服务器（可选）

# 后端（仅需 Python，运行时不需要 Node）
python src/server.py --port 8770

# 测试
node tests/frontend/chart-markdown.test.mjs
node tests/frontend/chart-side-channel.test.mjs
```

服务地址：http://127.0.0.1:8770/

---

## 4. 分支约定

- `main`：可运行基线。**空间工作区未经验收前不合并进去。**
- `feat/ai-spatial-workspace`：探索分支。所有空间相关改动在这里。
- 合并方向：`main` → 功能分支（同步修复），功能分支 → `main` 仅在用户明确验收后。

`main` 上已有一次上游修复 `5a9c90c`（`response.create` 闸门、焦点框、输入框点击），
功能分支已合入。若再次出现冲突，冲突点通常集中在：

| 文件 | 常见冲突原因 |
|---|---|
| `web/src/app/relay.ts` | 双方都在改 `response.done` 分支与状态机 |
| `web/src/orb/component.ts` | 样式块与 `#applyLayout` 的布局逻辑 |
| `CHANGELOG.md` | 双方都在表格里加行 |

解决原则：**两边的意图都保留**，不要二选一。例如 relay 里既要保留
`#sendCreate` 闸门，也要保留空间分支记录 `finalText` 的收尾时机。

---

## 5. 不可违反的红线

### 5.1 密钥

以下文件**永不入库**，且不得写进 Docker 镜像：

- `.env`、`.env.local`、`key.txt`、`*.pem`、`*.key`

`DASHSCOPE_API_KEY` 只存在于中继进程环境与 `.env`，前端产物中必须为零引用。
提交前自检：

```bash
git grep -nIE "sk-[A-Za-z0-9]{20,}|glpat-[A-Za-z0-9_-]{10,}" $(git rev-list --all)
```

> 历史提示：曾有 GitLab token 出现在对话中，需在 GitLab 侧吊销/重置。
> 任何 token 都不得写入仓库文件或 `.git/config`。

### 5.2 语音链路

- 语音与文字是两条独立 WS，各自的续答状态（`FcState`）不得共用。
- `response.create` 必须经过 `#sendCreate()` 闸门，禁止随手 `ws.send`。
- 工具结果可以立刻 `conversation.item.create` 回灌，但**发起新一轮**必须等本轮结束。

### 5.3 空间工作区

- 模型只表达意图（展示什么、多重要、偏好哪侧），**永远不输出像素坐标**。
- 布局必须确定性：同一 `SceneSpec` + 同一视口 → 同一 `LayoutPlan`，不读时间/随机数。
- 图表请求不得进入正文路径：`/kb` 永不携带图表参数，图表走 `/kb/chart` 旁路。
- 球体保持活跃态原尺寸，空间不够时**只移动，不缩小**。

---

## 6. 代码地图

```
src/                 Python 中继（WS 代理、静态服务、/kb 与 /kb/chart）
public/              运行时静态资源（index.html、dist/app.js）
web/src/app/         宿主装配：relay、tabLock、tools、sounds、config
web/src/orb/         悬浮球组件：component、ChatLayer、AudioReactive、liquid/
web/src/spatial/     空间工作区：types、spec、orchestrator、stage、renderers、chartMarkdown
docs/                架构、协议、部署、前端、测试、空间工作区与路线图
tests/               integration（Python 探针）/ frontend（node 测试）
scripts/             构建脚本
```

关键文档：

- [docs/architecture.md](docs/architecture.md) —— 数据流与状态机（改代码前必读）
- [docs/spatial-workspace.md](docs/spatial-workspace.md) —— 场景协议、布局引擎、图表捕获、回滚
- [docs/spatial-workspace-roadmap.md](docs/spatial-workspace-roadmap.md) —— P1–P4 计划与验收标准
- [docs/testing.md](docs/testing.md) —— 测试清单与已知环境噪声

---

## 7. 提交前检查清单

1. `cd web && npx tsc --noEmit` 通过
2. `npm run build` 通过（产物 `public/dist/app.js` 一并提交）
3. `node tests/frontend/*.test.mjs` 全绿
4. 改动涉及中继时：`python -m py_compile src/server.py`
5. 无密钥进入暂存区
6. 浏览器实机确认（至少覆盖：默认停靠、展开、思考/聆听、空间工作区开关）
