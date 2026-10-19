# 协议备忘（Qwen-Audio Realtime）

对接上游时看这里。官方事件全文见 `docs/reference/client-events.md` 与
`docs/reference/server-events.md`（阿里云百炼文档快照，2026-10 版）。

## 端点与鉴权

- 端点/模型：见 `src/server.py` 的 `UPSTREAM_BASE` / `DEFAULT_MODEL`
  （`wss://…/api-ws/v1/realtime?model=…`）
- 鉴权：请求头 `Authorization: Bearer <key>`。浏览器原生 WebSocket 不能带请求头，
  所以必须经中继补上。

## 会话配置

```json
{
  "type": "session.update",
  "session": {
    "modalities": ["text", "audio"],
    "voice": "longanqian",
    "instructions": "…",
    "tools": [ … ],
    "input_audio_transcription": { "model": "qwen3-asr-flash-realtime", "language": "zh" },
    "enable_speech_emotion": true,
    "turn_detection": {
      "type": "server_vad",
      "threshold": 0.5,
      "silence_duration_ms": 800,
      "prefix_padding_ms": 300,
      "create_response": true,
      "interrupt_response": true
    }
  }
}
```

⚠ **文字通道每条 WS 只下发一次 `session.update`**。回答进行中再发会被服务端拒绝：
`Cannot update 'turn_detection' while a response is active`。

## 音频

| 方向 | 事件 | 格式 |
|---|---|---|
| 上行 | `input_audio_buffer.append{audio}` | **16-bit 裸 PCM**，16 kHz 单声道，base64 |
| 下行 | `response.audio.delta{delta}` | **24 kHz 16-bit 裸 PCM**，base64 |

## 字幕与转写

- 下行字幕：`response.audio_transcript.delta{delta}`
- 用户转写：`conversation.item.input_audio_transcription.{delta,completed}`
  - **delta 的增量全文在 `stash` 字段**（`text` 为空）
  - `completed` 里是 `transcript`

## 打断

- 用户开口 → `input_audio_buffer.speech_started`
- 服务端自动取消当前响应 → `response.done{status: "cancelled"}`
- 手动打断：客户端发 `response.cancel`

⚠ 服务端取消不等于客户端停播：已入队的 `AudioBufferSourceNode` 必须本地停掉，
并丢弃随后的迟到音频帧（`#dropAudio`）。

## 工具调用

```
response.output_item.added{item.type=function_call, name, call_id}
response.function_call_arguments.done{name, call_id, arguments}
  → 本地执行
  → conversation.item.create{item: {type: "function_call_output", call_id, output}}
  → response.create          ← 必须客户端补
```

实测上游**不会**在 function_call_output 之后自动续答。

## 响应生命周期

`response.done.response.status` ∈ `completed | failed | in_progress | incomplete | cancelled`

- `cancelled`：被打断
- `failed`：生成失败，需要退出思考态并给用户反馈
- 其余：等音频播放完成再封口气泡

## 其他实测结论

| 结论 | 依据 |
|---|---|
| 模型调工具前不会先出声 | 实测（纯文本轮，排除 VAD 干扰） |
| 字幕在 ~1.4 s 内流完，音频 2.8 s 后才开始 | 实测时序采样 |
| 服务端流式转写可用，delta 在 `stash` | 实测事件样本 |
| 音频帧必须按 16k/24k 严格解码 | `tests/integration/_cdp_audio_path.py` |
