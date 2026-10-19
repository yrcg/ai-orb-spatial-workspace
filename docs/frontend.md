# 前端

源码在 `web/`（Vite + TypeScript，零运行时依赖）。构建产物 `public/dist/app.js` 已提交，
由 `src/server.py` 直接伺服 —— 所以**运行时只需要 Python**。

## 目录

```
web/
├─ index.html            开发宿主页（build 时不用它，生产页在 public/index.html）
├─ src/
│  ├─ app/               宿主装配（与本项目强相关）
│  │  ├─ index.ts        接线：组件、中继、设置面板、主题、多标签
│  │  ├─ relay.ts        中继客户端：协议、打断、工具、麦克风降级、字幕跟读、双路取音
│  │  ├─ config.ts       ★ 配置入口（换渲染体 / 预设 / 主题 / 声场模式）
│  │  ├─ tabLock.ts      多标签选主（Web Locks + BroadcastChannel）
│  │  ├─ sounds.ts       现场合成音（接通 / 挂断 / 出错 / 工具）
│  │  └─ tools.ts        工具定义、知识库调用、日期时间
│  └─ orb/               可复用悬浮球组件（框架无关，可单独构建）
│     ├─ component.ts    <ai-orb-chat>：两态、激活编排、粒子、睡眠、状态映射
│     ├─ ChatLayer.ts    对话层：消息行 + 自由滚动 + 隐藏输入框 + 工具行
│     ├─ AudioReactive.ts  双路取音 → 四频段 + 32 段频谱 + 非对称包络
│     ├─ renderers.ts    ★ OrbRenderer 接口 + registerOrb 注册表
│     ├─ options.ts      全部可调参数与默认值
│     └─ liquid/         liquid-orb 封装
│        ├─ LiquidOrb.ts   WebGPU 管线 + 音频映射 + 原生形变/光晕
│        ├─ effect.wgsl.ts 上游 WGSL（自动生成，勿手改）
│        └─ seeds.ts       状态种子（自动生成）
└─ tools/
   ├─ extract_liquid.py  从导出产物提取 WGSL 与种子
   └─ fixtures/          对话球参数*.txt 导出件
```

## 构建

```bash
scripts/build-web.bat        # = cd web && npm ci && npm run build → public/dist/app.js
```

| 命令 | 产物 |
|---|---|
| `npm run build` | 生产应用包 `public/dist/app.js`（`public/index.html` 引用） |
| `npm run build:lib` | 组件单文件 `web/dist-lib/ai-orb-chat.js`，供别的页面 `<script type="module">` 引入 |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run dev` | Vite 开发服务器（注意：生产页在 `public/`，开发页在 `web/index.html`） |

> `web/dist-lib/` 与 `web/node_modules/` 已在 `web/.gitignore` 中忽略。

## 换一种悬浮球

组件只依赖 `OrbRenderer` 接口：

```ts
interface OrbRenderer {
  init(): Promise<boolean>;
  setVisualState(state: 'idle' | 'dock' | 'active' | 'thinking' | 'listening' | 'speaking'): void;
  setAudioBands(bands?: Partial<AudioBands>): void;
  setOverrides(overrides: UniformOverrides): void;
  destroy(): void;
}
```

```ts
import { registerOrb, type OrbRenderer } from './orb';

class MyOrb implements OrbRenderer { /* 画你自己的球 */ }

registerOrb('myOrb', (canvas) => new MyOrb(canvas));
// 再把 src/app/config.ts 的 orb 字段改成 'myOrb'
```

## 形态预设

`web/src/orb/liquid/seeds.ts` 里有三套，可在 `config.ts` 选，或运行时切换：

| preset | 说明 | 流场 |
|---|---|---|
| `custom` | **原始悬浮球**（默认）：「对话球参数.txt」导出件，与参考工程一致 | 12 |
| `voiceWave` | 声纹薄膜（备选，上游原生音频响应） | 19 |
| `chromatic` | 「对话球参数2.txt」调校形态（备选） | 22 |

```js
document.querySelector('ai-orb-chat').setOptions({ orbPreset: 'chromatic' });  // 立即重建
```

新增预设：

```bash
python web/tools/extract_liquid.py "web/tools/fixtures/对话球参数.txt"
```

把输出加进 `PRESET_SEEDS`，并在 `LiquidOrb.ts` 的 `AUDIO_FLOW_STRENGTH` 里登记对应流场索引。

> ⚠ **必须登记流场索引**，否则音频响应完全不生效。上游只登记了 9/10/11/14/19/21，
> 本项目额外补了 12（custom）与 22（chromatic）。

## 音频 → 视觉

两路取音，都不新增音频管线：

- **用户说话**：复用上行麦克风流，在同一 `MediaStream` 上挂 `AnalyserNode`（不二次授权）
- **AI 说话**：在播放总线上插 `AnalyserNode`，直接从下行 24 kHz PCM 取包络

包络是**非对称**的：起音 45 ms、释放 280 ms（写反过一次，导致"软绵绵动一下"）。
频段 low 20–250 / mid 250–2k / high 2k–8k / all 来自 RMS。

映射方式：

| 通道 | 驱动 |
|---|---|
| mid | `warp`（局部鼓起/凹陷）、`ridgeAmt`（波纹脊线）、`sharp` |
| low | `contourDeform`（轮廓扭曲）；另驱动呼吸包络 |
| high | `sheen`（边缘高光） |
| all | `speed`、`exposure`（有上限）、原生 `edgeGlow`（声场光晕） |
| 陡增 | 一次强调脉冲（emph） |

呼吸包络作用于上游原生形变参数（warp / ridgeAmt / contourDeform），**不缩放整颗球**。
半径只保留弹簧约 ±1.5% 的余量。曝光有总闸：不超过当前形态基准的 1.15 倍。

`auraMode` 三档：

```js
orb.setOptions({ auraMode: 'native' });  // 默认：上游 mfEdgeGlow 连续衰减光
orb.setOptions({ auraMode: 'ring' });    // 旧的 32 段线条环（对比用）
orb.setOptions({ auraMode: 'off' });     // 关闭
```

## 主题

组件用一套 token（`--orb-text` / `--orb-accent` / `--orb-scrim` / `--orb-hairline` 等），
`theme: 'light' | 'dark' | 'auto'`。`auto` 会读宿主页面背景色算相对亮度自动选。

遮罩不是纯色：`backgroundOpacity`（薄纱）+ `overlayBlur`（22px），且模糊量跟着编排曲线
逐帧推进 —— 展开时背景是"逐渐晕开"，不是突然失焦。

## 主要可调参数

见 `web/src/orb/options.ts`，常用的几个：

| 参数 | 默认 | 说明 |
|---|---|---|
| `dockOrbSize` | 120 | 停靠球直径（px） |
| `dockMarginX` / `dockMarginY` | 32 / 44 | 停靠边距 |
| `activeOrbRatio` | 0.28 | 活跃态球直径 = 屏高 × 该值 × `activeRadiusScale` |
| `activeOrbCenterY` | 0.48 | 活跃态球心纵向位置（屏高比例） |
| `overlayBlur` | 22 | 背景模糊半径 |
| `backgroundOpacity` | 0.5 | 薄纱不透明度 |
| `chatMaxWidth` | 680 | 对话区宽度 |
| `chatGap` | 24 | 对话流与球顶的间距 |
| `streamCps` | 42 | 打字机速度（字/秒） |
| `idleSleepMs` | 90000 | 静默多久进入睡眠 |
| `particlesEnabled` | true | 粒子背景 |

## 组件事件

| 事件 | 方向 | 用途 |
|---|---|---|
| `orb:submit` | 组件 → 宿主 | 输入框提交，`detail.text` |
| `orb:phase` | 组件 → 宿主 | 展开/收起，`detail.phase`、`detail.voice` |
| `orb:takeover` | 组件 → 宿主 | 跟随页双击球，请求接管语音 |
| `orb:interrupt` | 组件 → 宿主 | 活跃态单击球 |
| `orb:voice` | 组件 → 宿主 | 语音状态变化 |
| `orb:ready` | 组件 → 宿主 | 渲染体初始化完成 |
| `orb:settled` | 组件 → 宿主 | 编排动画结束（此时才允许聚焦/布局相关操作） |

宿主 API：`activate()` / `activateSilent()` / `deactivate()` / `toggle()` / `setOptions()` /
`setVoiceState()` / `setAudioBands()` / `setAudioSpectrum()` / `pulse()` / `reloadOrb()`，
以及对话层转发 `addMessage` / `startStream` / `setAssistantLive` / `addToolChip` 等。
