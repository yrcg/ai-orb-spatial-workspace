# 测试

`tests/` 下是直接运行的脚本（不是 pytest 用例），因为多数要连真实上游或驱动真实 Chrome。

```
tests/
├─ integration/   连真实中继 / 上游 / 浏览器的端到端验证
├─ tools/         辅助脚本（语法校验、生成测试音频）
└─ fixtures/      测试素材（_probe_speech.wav）
```

## 前置条件

- `integration/` 多数脚本需要**中继已启动**（`python src/server.py`）且 `.env` 里有 key
- `_cdp_*.py` 需要本机安装 Chrome，路径写死在脚本顶部
- 脚本会自己拉起 headless Chrome 并监听调试端口，跑之前确认端口没被占用

## integration/

| 脚本 | 验证内容 | 依赖 |
|---|---|---|
| `_verify_qwen_realtime.py` | 中继 → 上游 → 原生 FC → 答案 → 打断，全链路 | 中继 + key |
| `_verify_kb_integration.py` | 知识库端到端（每问约 12 s，慎跑） | 中继 + 内网 |
| `_cdp_verify4.py` | 页面 UI 契约 + 语音链路形态（真实 Chrome） | 中继 |
| `_cdp_audio_path.py` | 音频帧是否到达页面、是否进播放队列 | 中继 + Chrome |
| `_cdp_multiturn.py` | 用 WAV 冒充麦克风跑多轮 | 中继 + Chrome |
| `_cdp_repro_display.py` | 气泡显示问题复现 | 中继 + Chrome |
| `_test_realtime_fc.py` | 上游 function calling 行为 | key |
| `_test_realtime_fc_dup.py` | 工具重复调用场景 | key |
| `_test_realtime_cancel.py` | `response.cancel` 行为 | key |
| `_test_realtime_audio_commit.py` | 音频提交语义 | key |
| `_test_dashscope_channels.py` | DashScope 三通道连通性 | key |
| `_test_llm_tools.py` | 文本模型 function calling | key |

## tools/

| 脚本 | 用途 |
|---|---|
| `_check_syntax.py` | 抽取 `public/index.html` 的内联 JS，交给 `node --check` |
| `_mk_speech.py` | 用 TTS 生成测试音频，输出到 `tests/fixtures/` |

## 运行示例

```bash
# 端到端（先启动中继）
python tests/integration/_verify_qwen_realtime.py

# 页面契约
python tests/integration/_cdp_verify4.py http://127.0.0.1:8770

# 语法校验
python tests/tools/_check_syntax.py
```

## 前端自己的检查

```bash
cd web
npm run typecheck     # tsc --noEmit
npm run build         # 类型检查 + 生产构建
```

## 已知的环境噪声

- **知识库连接被拒**（`WinError 10061` / `URLError`）：本机连不上 `192.168.5.196:13000`，
  不是前端逻辑问题。界面会正确显示 ✕ 失败态，模型给出兜底话术。
- **首次握手偶发 TimeoutError**：冷启动时中继建连较慢，刷新后复测消失。
- **WebGPU 截图超时**：headless 下 rAF 循环可能导致截图 surface 准备超时，与应用缺陷无关。
