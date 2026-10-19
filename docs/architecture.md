# 架构与关键机制

## 数据流

```
用户说话 ──mic──► AudioWorklet（16 kHz PCM 分片）
                        │ input_audio_buffer.append（base64）
                        ▼
                 src/server.py（注入 Authorization）
                        │ WSS
                        ▼
              Qwen-Audio Realtime
                        │
      ┌─────────────────┼──────────────────┐
      │                 │                  │
 response.audio   transcript.delta   function_call
  .delta（24k）     （字幕）            arguments.done
      │                 │                  │
      ▼                 ▼                  ▼
 播放队列 → Analyser  字幕跟读      本地工具执行
      │                 │                  │
      └────────► 悬浮球律动 ◄──────────────┘
                        │
                  对话层渲染
```

三条 WS 通道，互不复用：

| 通道 | 用途 | 生命周期 |
|---|---|---|
| `/ws?mode=audio` | 语音通话：上行 PCM、下行音频、VAD、转写、工具 | 展开 → 收起 |
| `/ws?mode=text` | 打字提问：`session.update` + `conversation.item.create` | 首次提问时建立，可复用 |
| `/ws?mode=log` | 前端日志批量回传 | 按需建立 |

## 状态机

两个正交维度，组合出渲染体看到的形态：

```
phase（界面）   idle ──双击──► active ──Esc/×──► idle
voice（语音）   idle ─► thinking ─► user ⇄ ai ─► idle
```

`#phase` 是唯一事实来源，DOM 上的 `data-phase` 由它派生。这一点曾经出过 bug：
关闭时只改了 DOM 标记，内部仍是 `active`，导致 Esc 之后第二次双击走的是"关闭"分支。

组合映射（`component.ts#resolveState`）：

| phase | voice | 渲染形态 |
|---|---|---|
| idle | 任意 | `dock`（配色取 thinking，流速折中） |
| active | idle | `active` |
| active | thinking | `thinking` |
| active | user | `listening` |
| active | ai | `speaking` |

`dock` 与 `thinking` 刻意分开：外观接近但语义不同，宿主需要区分"缩在角落等你"和"正在处理问题"。

## 激活编排

四段（合计约 900 ms）：

1. **坍缩**（180 ms）— 球缩到 16%，曝光升到 2.4
2. **高能量核心**（120 ms）— 更小更亮，同时扩散一圈冲击环
3. **光迹**（260 ms）— 平移到屏心，同时闪一条短光迹
4. **展开**（360 ms）— `easeOutBack` 回到活跃尺寸

收起是对称的三段（合计约 620 ms）。

编排由 `setInterval` 驱动，不是 `requestAnimationFrame` —— 实测窗口被遮挡时段 rAF 会节流到
300 ms 一帧，导致"界面已展开、球还停在右下角"。rAF 只负责着色与粒子。

关键帧插值的起点取**当前实际姿态**（`#shown`），所以中途反向（展开一半按 Esc）不会跳变。

## 字幕跟读

上游把整段字幕在约 1.4 s 内一次性流完，而音频 2.8 s 才开始、要播十几到二十秒。
"文字先出完、语音才慢慢念"不是 bug，是上游特性。

做法：

1. `response.created` 开始跟读
2. `transcript.delta` 只累加到 `#capText`
3. 首帧 `audio.delta` 记下播放时钟起点
4. 每 60 ms 按 `已播放秒数 × 6.5 字/秒` 渲染前缀

没收到音频前不显示文字（先听声音，后见字）。

## 工具调用

```
模型 → response.function_call_arguments.done
     → 客户端本地执行（/kb 或本地时间）
     → conversation.item.create{function_call_output}
     → response.create          ← 必须客户端补，上游不会自动续答
```

**实测**：模型在调用工具前不会先出声（`response.created` 后直接进 `function_call`），
而知识库单问 4–12 s。于是"问完 → 静默十几秒 → 突然报答案"很生硬。缓解方式：
慢工具开始前播一个约 0.35 s 的轻提示音，用户开口会被一起打断。

工具 chip 插在字幕前面，视觉顺序始终是「chip → 字幕」。

## 打断

两条路径：

- **服务端 VAD**：用户开口 → `input_audio_buffer.speech_started` → 服务端自动取消本轮
  （`response.done status=cancelled`）。客户端必须**立刻停播已入队音频**并丢弃迟到帧。
- **手动**：单击球发 `response.cancel`，只打断不挂断；`Esc` 是挂断并收起。

文字链路和语音链路是**两条独立 WS**，各自维护一份 function-call 续答状态。
共用一份曾导致"一条链路的工具回合把另一条卡死"。

## 音频 → 视觉

见 [frontend.md](frontend.md#音频--视觉)。要点：

- 非对称包络（起音 45 ms / 释放 280 ms）
- 呼吸包络驱动上游原生形变参数，不缩放整颗球
- 曝光有总闸（≤ 形态基准 1.15 倍）
- 声场光晕用上游 `mfEdgeGlow` 的连续衰减光，不是独立绘制层

## 多标签选主

同一浏览器可能开了多个页面。风险很具体：两个标签同时开麦导致 AEC 失配、双份计费、
两路回答同时播、工具重复调用。

方案（纯客户端，不动服务端）：

- **Web Locks**：`ai-orb/voice` 这把锁只有持有者能开麦/连语音。页面关闭时浏览器自动释放，
  不需要心跳和过期时间。
- **BroadcastChannel**：主控页广播 `phase` / `voice` / `message`，跟随页镜像同一份对话。
- **接管**：跟随页点「接管语音」或双击球 → 广播 `takeover` → 主控放锁 → 接管者重连。

降级：不支持 Web Locks 时用 localStorage 心跳选举；不支持 BroadcastChannel 时退化为各页独立。

## 日志

前端事件 → 内存缓冲 → 批量 WS 推送（1.2 s 合并）→ 中继落盘：

- `logs/pet-YYYY-MM-DD.jsonl` — 前端事件
- `logs/relay-YYYY-MM-DD.jsonl` — 中继自身

`http://127.0.0.1:8770/logs` 可列出文件名；设置面板里可一键导出。

## 静态服务

`src/server.py` 的 `load_static()` 把 URL 映射到 `public/`，目录自动落到 `index.html`。两个踩过的坑写在代码注释里：

- 二进制资源不能走 `decode()`，否则字节被替换成 U+FFFD（表现为 Float32Array 长度不是 4 的倍数）
- `connection.respond()` 只接受 `str`，二进制必须自己组 `Response`
