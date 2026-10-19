# 瀚涛百事通 · 全双工语音桌宠

右下角悬浮一颗**液态球**（liquid-orb / WebGPU / WGSL）。双击它，球会向内坍缩成高能量核心、
沿一条短光迹飞到屏幕中央重新展开，同时**自动接通**全双工语音：开口就能打断，随时说、随时听。
屏幕中央是**无边框对话流**，球下方是默认隐藏的输入框，打字提问也走同一条 realtime 链路。

- **全双工语音**：上行 16 kHz PCM，下行 24 kHz PCM，服务端 VAD 自动打断
- **原生工具调用**：查公司知识库、查日期时间（模型自主决定调用）
- **会呼吸的球**：聆听 / 思考 / 回答三态各不相同；声音驱动原生形变与边缘辉光
- **可替换渲染体**：`OrbRenderer` 接口 + 注册表，换一颗球不需要改组件
- **多标签安全**：Web Locks 选主，只有一个页面能开麦，其余页面镜像对话

> 上游是阿里云百炼 **Qwen-Audio Realtime**（OpenAI Realtime 风格协议），默认模型
> `qwen-audio-3.1-realtime-plus`。浏览器原生 WebSocket 不能带 `Authorization` 请求头，
> 所以本地需要一个中继补上它 —— 这就是 `src/server.py` 存在的唯一理由。

## 快速开始

```bash
# 1) 配置密钥（任选一种：.env / 环境变量 / --key）
cp .env.example .env      # 然后填入 DASHSCOPE_API_KEY

# 2) 启动（HTTP 8770）
python src/server.py --open

# 3) 浏览器打开 http://127.0.0.1:8770，双击右下角的球
```

前端产物 `public/dist/app.js` 已随仓库提交，**运行时只需要 Python**。
只有修改前端源码时才需要 Node：

```bash
scripts/build-web.bat     # 等价于 cd web && npm ci && npm run build
```

| 场景 | 启动方式 | 地址 |
|---|---|---|
| 本机自用 | `start.bat` 或 `python src/server.py --open` | `http://127.0.0.1:8770` |
| 局域网（需要语音） | `start-lan.bat`（原生 + HTTPS/WSS） | `https://<本机IP>:8772` |
| 容器部署 | `docker compose up -d --build` | `http://127.0.0.1:8770` |

> 浏览器只在**安全上下文**（localhost / 127.0.0.1 / https）里提供麦克风。
> 局域网用 `http://局域网IP` 拿不到麦克风，只能打字。
> 三种方式不能同时运行，都会占用 8770 / 8772。

## 架构

```
┌──────────────────────────────────────────┐
│ public/index.html                        │
│   ├─ <ai-orb-chat>  悬浮球 + 对话层       │
│   └─ public/dist/app.js  宿主装配         │
└───────────────┬──────────────────────────┘
                │ WebSocket（/ws?mode=audio|text|log）
                ▼
┌──────────────────────────────────────────┐
│ src/server.py  本地中继                   │
│   ├─ 注入 Authorization: Bearer <key>     │
│   ├─ 静态文件（public/）                  │
│   ├─ GET /kb  → 公司知识库代理             │
│   └─ 日志落盘（logs/*.jsonl）              │
└───────────────┬──────────────────────────┘
                │ WSS
                ▼
        Qwen-Audio Realtime
```

三条 WS 通道：`audio`（语音）、`text`（打字提问）、`log`（前端日志回传）。
组件本身不含 LLM 逻辑，宿主通过 `orb:submit` / `orb:phase` / `orb:interrupt` 接管。

## 目录结构

```
.
├─ src/                     后端：中继 + 静态服务 + 健康检查
├─ public/                  运行时静态资源（由 server.py 伺服）
│  ├─ index.html            生产宿主页
│  ├─ dist/app.js           前端构建产物（已提交）
│  └─ mic-capture-worklet.js  麦克风采集 AudioWorklet
├─ web/                     前端源码（Vite + TypeScript）
│  ├─ src/orb/              可复用悬浮球组件
│  ├─ src/app/              宿主装配与中继客户端
│  └─ tools/                上游提取脚本与导出参数
├─ docs/                    文档（架构 / 部署 / 前端 / 协议 / 设计）
├─ tests/                   集成测试、协议探针、测试素材
├─ scripts/                 构建脚本
├─ logs/  certs/            运行时生成（不入库）
└─ docker-compose.yml  Dockerfile
```

## 文档

| 文档 | 内容 |
|---|---|
| [docs/architecture.md](docs/architecture.md) | 数据流、状态机、关键机制（字幕跟读 / FC / 打断 / 音频映射 / 多标签） |
| [docs/deployment.md](docs/deployment.md) | 本机、局域网、Docker 三种部署方式与约束 |
| [docs/frontend.md](docs/frontend.md) | 前端结构、构建、换球、形态预设、可调参数 |
| [docs/protocol.md](docs/protocol.md) | Qwen-Audio Realtime 协议备忘 |
| [docs/testing.md](docs/testing.md) | 测试与探针清单、运行方式 |
| [CHANGELOG.md](CHANGELOG.md) | 版本变更记录 |

## 界面

| 位置 | 行为 |
|---|---|
| 悬浮球（右下） | 停靠直径 120px；双击展开并接通；鼠标靠近轻微提亮；久静进入低亮睡眠 |
| 激活编排 | 坍缩 → 高能量核心 + 冲击环 → 短光迹 → 平移展开（约 900ms），收起对称三段 |
| 对话流（球上） | 字幕跟读、用户转写、工具调用行；可上下滚动回看，滑离底部即停止跟随 |
| 输入框（球下） | 默认隐藏，悬停浮现；`Enter` 发送、`Shift+Enter` 换行 |
| 声场光晕 | 驱动上游原生 `edgeGlow`，随响度在轮廓外亮起柔光 |
| 打断 | 开口即打断；单击球只打断不挂断；`Esc` 挂断并收起 |

## 上游与授权

- 液态球视觉来自 [stdexception/liquid-orb](https://github.com/stdexception/liquid-orb)（MIT, © stdexception）。
  本项目抽取其 WGSL 与状态种子，封装为 `web/src/orb/liquid/`。
- 协议参考快照见 [docs/reference/](docs/reference/)。

## 常见问题

**麦克风拿不到？** 确认地址是 `http://127.0.0.1:8770` 或 `https://…`，并且用的是真正的
Chrome / Edge（不是应用内预览面板，也不是 `file://`）。

**球不显示？** 需要 WebGPU：Chrome / Edge 113+、Safari 26+、Firefox 141+（Windows）。
不支持时会显示提示，对话功能仍可用。

**知识库查不到？** 默认指向 `http://192.168.5.196:13000`。用 `PET_KB_BASE` 覆盖；连不上不影响
语音对话，模型会回答"暂时查不到"。
