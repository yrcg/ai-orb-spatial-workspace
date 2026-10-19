import { DEFAULT_OPTIONS, type OrbOptions } from './options';
import { ChatLayer, type ChatMessage, type ChatRole } from './ChatLayer';
import type { AudioBands, OrbRenderer, OrbVisualState } from './renderers';
import { getOrbFactory } from './renderers';
import type { LayoutPlan } from '../spatial/types';

/** 界面阶段：只有「空闲」与「活跃」两态 */
export type OrbPhase = 'idle' | 'active';
/** 语音/交互状态：与界面阶段正交 */
export type VoiceState = 'idle' | 'thinking' | 'user' | 'ai';

interface Pose {
  tx: number;
  ty: number;
  scale: number;
  /** 半径 uniform 倍率 */
  radius: number;
  /** 曝光 uniform 倍率 */
  exposure: number;
  /** 边缘辉光绝对值 */
  glow: number;
  /** 遮罩不透明度 0-1 */
  overlay: number;
}

interface Keyframe extends Pose {
  /** 累计时间（ms） */
  t: number;
  ease: (p: number) => number;
}

/**
 * 原生声场（方案 A）：把音频包络映射到上游自带的边缘辉光。
 *
 * liquid-orb 的 mfEdgeGlow() 会从球体轮廓向外画一层 exp(-d*11) 的连续衰减光，
 * 颜色取 glowColor。它和球体共用同一套轮廓/柔边计算，所以光晕永远贴着球走，
 * 不会像独立线条环那样"浮"在外面。
 *
 * 上限 0.42：再高会在浅色背景上糊成一团白；0.42 在深色底也足够看清。
 */
const NATIVE_AURA_GAIN = 0.42;
/** 光晕响应的起音/释放：比主包络更慢一点，让"光"有余韵而不是抽动 */
const AURA_ATTACK = 0.09;
const AURA_RELEASE = 0.34;

const linear = (p: number): number => p;const easeIn = (p: number): number => p * p;
const easeOut = (p: number): number => 1 - (1 - p) ** 2;
const easeOutBack = (p: number): number => {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * (p - 1) ** 3 + c1 * (p - 1) ** 2;
};

/** 把 rgb/rgba 字符串里的 RGB 分量取出来并算相对亮度（0-1） */
function luminanceOf(color: string): number | null {
  const m = /rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(color);
  if (!m) return null;
  const [r, g, b] = [Number(m[1]), Number(m[2]), Number(m[3])].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * 猜宿主页面的明暗。逐层向上找第一个有实际底色的元素，
 * 全透明（例如只挂了组件、背景在 iframe 外）就退回系统偏好。
 */
function detectTheme(): 'light' | 'dark' {
  const roots: Element[] = [document.body, document.documentElement];
  // 组件自身若挂在某个容器里，也看看那个容器的底色
  const host = document.querySelector('ai-orb-chat')?.parentElement;
  if (host) roots.unshift(host);
  for (const el of roots) {
    if (!el) continue;
    const bg = getComputedStyle(el).backgroundColor;
    if (!bg || bg === 'transparent' || /rgba?\([^)]*,\s*0(\.0*)?\)$/.test(bg)) continue;
    const l = luminanceOf(bg);
    if (l != null) return l > 0.55 ? 'light' : 'dark';
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

const STYLES = `
:host {
  position: fixed;
  inset: 0;
  z-index: 2147483646;
  pointer-events: none;
  --orb-canvas: 480px;
  --dock-scale: 0.45;
  --active-scale: 1;
  --orb-tx: 0px;
  --orb-ty: 0px;
  --orb-scale: 0.45;
  --orb-fly-ms: 0ms;
  /* 主题 token（由 setOptions 的 theme 覆盖；这里是浅色默认值） */
  --orb-text: rgba(22, 32, 48, 0.9);
  --orb-text-dim: rgba(22, 32, 48, 0.52);
  --orb-text-faint: rgba(22, 32, 48, 0.34);
  --orb-accent: rgba(38, 112, 214, 0.78);
  --orb-scrim: 248, 250, 253;
  --orb-hairline: rgba(22, 32, 48, 0.12);
  --orb-particle: 40, 92, 170;
  --orb-aura: 46, 106, 196;
  --orb-close-bg: rgba(22, 32, 48, 0.05);
  --orb-close-bg-hover: rgba(22, 32, 48, 0.1);
  --orb-panel-bg: rgba(255, 255, 255, 0.86);
}
:host([data-theme='dark']) {
  --orb-text: rgba(238, 242, 248, 0.9);
  --orb-text-dim: rgba(232, 235, 240, 0.42);
  --orb-text-faint: rgba(232, 235, 240, 0.28);
  --orb-accent: rgba(143, 216, 255, 0.8);
  --orb-scrim: 8, 9, 11;
  --orb-hairline: rgba(255, 255, 255, 0.1);
  --orb-particle: 180, 210, 255;
  --orb-aura: 168, 206, 255;
  --orb-close-bg: rgba(255, 255, 255, 0.05);
  --orb-close-bg-hover: rgba(255, 255, 255, 0.1);
  --orb-panel-bg: rgba(14, 16, 20, 0.88);
}
.canvas {
  position: absolute;
  left: 50%;
  top: 50%;
  width: var(--orb-canvas);
  height: var(--orb-canvas);
  margin-left: calc(var(--orb-canvas) / -2);
  margin-top: calc(var(--orb-canvas) / -2);
  display: block;
  transform-origin: center center;
  transform: translate(var(--orb-tx), var(--orb-ty)) scale(var(--orb-scale));
  pointer-events: auto;
  cursor: pointer;
  /* 层级：遮罩(0) < 粒子/舞台(1-2) < 光晕(3) < 球(4) < 对话(6) */
  z-index: 4;
}
:host([data-phase='active']) .canvas { cursor: default; }
.particles {
  position: absolute;
  inset: 0;
  z-index: 1;
  width: 100%;
  height: 100%;
  opacity: 0;
  transition: opacity 520ms ease;
  pointer-events: none;
}
:host([data-phase='active']) .particles { opacity: 1; }
/* 声场环（方案 C）：画在球外圈，随频谱起伏。2D canvas 比改 WGSL 便宜得多，
   而且线宽可以保持恒定 —— 这正是「余光也能看见」所需要的。 */
.aura {
  position: absolute;
  left: 50%;
  top: 50%;
  z-index: 3;
  display: block;
  pointer-events: none;
  opacity: 0;
  transition: opacity 420ms ease;
  will-change: transform, opacity;
}
:host([data-phase='active']) .aura { opacity: 1; }
.overlay {
  position: absolute;
  inset: 0;
  z-index: 0;
  /* 薄纱色由主题 token 决定；模糊半径由 JS 跟随编排曲线逐帧写入
     （--orb-blur-cur = 遮罩进度 × 目标模糊），所以是「越来越糊」，
     而不是先蒙一层白纱再突然失焦。 */
  background: rgba(var(--orb-scrim), var(--orb-background-opacity, 0.5));
  backdrop-filter: blur(var(--orb-blur-cur, 0px)) saturate(0.94);
  -webkit-backdrop-filter: blur(var(--orb-blur-cur, 0px)) saturate(0.94);
  opacity: 0;
  pointer-events: none;
  will-change: opacity, backdrop-filter;
}
.trail {
  position: absolute;
  left: 50%;
  top: 50%;
  z-index: 5;
  width: 46px;
  height: 46px;
  margin: -23px 0 0 -23px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(200, 230, 255, 0.85), rgba(140, 192, 255, 0.25) 45%, rgba(140, 192, 255, 0) 70%);
  opacity: 0;
  transform: translate(var(--orb-tx), var(--orb-ty));
  pointer-events: none;
  will-change: opacity, transform;
}
/* 激活/关闭时从核心扩散的一圈能量环：让"坍缩→核心"这一步有明确的物理回应 */
.shock {
  position: absolute;
  left: 50%;
  top: 50%;
  z-index: 5;
  width: 40px;
  height: 40px;
  margin: -20px 0 0 -20px;
  border-radius: 50%;
  border: 1px solid rgba(180, 215, 255, 0.7);
  box-shadow: 0 0 18px rgba(140, 192, 255, 0.45), inset 0 0 12px rgba(180, 220, 255, 0.35);
  opacity: 0;
  transform: translate(var(--orb-tx), var(--orb-ty)) scale(0.2);
  pointer-events: none;
  will-change: opacity, transform;
}
.hint {
  position: absolute;
  z-index: 3;
  right: var(--orb-dock-margin-x, 32px);
  bottom: calc(var(--orb-dock-margin-y, 44px) - 24px);
  width: var(--orb-dock-size, 168px);
  text-align: center;
  font-size: 11px;
  letter-spacing: 0.14em;
  color: var(--orb-text-faint);
  pointer-events: none;
  user-select: none;
  transition: opacity 400ms ease;
}
:host([data-phase='active']) .hint { opacity: 0; }
.close-hint {
  position: absolute;
  z-index: 7;
  left: 50%;
  bottom: 22px;
  transform: translateX(-50%);
  width: 24px;
  height: 24px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  color: var(--orb-text-dim);
  background: var(--orb-close-bg);
  pointer-events: none;
  opacity: 0;
  cursor: pointer;
  transition: opacity 300ms ease, color 200ms ease, background 200ms ease;
}
:host([data-phase='active']) .close-hint { opacity: 1; pointer-events: auto; }
.close-hint:hover { color: var(--orb-text); background: var(--orb-close-bg-hover); }
.close-hint svg { width: 12px; height: 12px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; }
.unsupported {
  position: absolute;
  right: var(--orb-dock-margin-x, 32px);
  bottom: var(--orb-dock-margin-y, 44px);
  width: 220px;
  padding: 10px 12px;
  border: 1px solid var(--orb-hairline);
  border-radius: 8px;
  background: var(--orb-panel-bg);
  color: var(--orb-text-dim);
  font: 11px/1.6 system-ui, -apple-system, sans-serif;
  letter-spacing: 0.04em;
  pointer-events: auto;
  backdrop-filter: blur(8px);
}
.unsupported b { display: block; color: var(--orb-text); font-weight: 500; margin-bottom: 2px; }
`;

const TEMPLATE = `
<style>${STYLES}</style>
<div class="overlay" part="overlay"></div>
<!-- 空间舞台插槽：放在遮罩之上、球与对话层之下。
     这样面板会被"浮起"而不是被遮罩糊掉，同时球和字幕仍然在面板之上。 -->
<slot name="stage"></slot>
<canvas class="particles" part="particles" aria-hidden="true"></canvas>
<canvas class="aura" part="aura" aria-hidden="true"></canvas>
<canvas class="canvas" part="canvas" role="button" tabindex="0" aria-label="双击唤起 AI 对话"></canvas>
<div class="trail" part="trail" aria-hidden="true"></div>
<div class="shock" part="shock" aria-hidden="true"></div>
<div class="close-hint" part="close" role="button" tabindex="0" aria-label="挂断并收起">
  <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" /></svg>
</div>
<div class="hint">双击唤起</div>
<div class="unsupported" hidden>
  <b>当前浏览器不支持 WebGPU</b>
  液态球无法渲染，对话功能不受影响。<br />建议使用 Chrome / Edge 113+、Safari 26+ 或 Firefox 141+（Windows）。
</div>
`;

/**
 * <ai-orb-chat> —— 可嵌入任意页面的悬浮液态球对话组件。
 *
 * 三件事：两态切换与激活编排、内置对话层、语音状态 → 悬浮球形态。
 * 悬浮球渲染体通过 renderers.ts 的注册表解耦（Q11），默认 'liquid'（液态球）。
 *
 * 双正交状态机：
 * - 界面阶段 phase：idle（右下停靠）| active（屏心展开）
 * - 语音状态 voice：idle / thinking / user / ai
 *
 * 组件不含 LLM 逻辑：宿主监听 `orb:submit` 接管，或用 addMessage / startStream /
 * appendStream / endStream / addToolChip 把内容推进来。
 */
export class AIOrbChat extends HTMLElement {
  static get observedAttributes(): string[] {
    return [
      'dock-size', 'dock-margin-x', 'dock-margin-y', 'background-opacity', 'overlay-blur',
      'glow-intensity', 'breathing-amplitude', 'motion-speed', 'zoom', 'glass-opacity',
      'chat-enabled', 'orb', 'orb-preset', 'particles-enabled',
    ];
  }

  #options: OrbOptions = { ...DEFAULT_OPTIONS };
  #root: ShadowRoot;
  #canvas: HTMLCanvasElement;
  #particles: HTMLCanvasElement;
  #aura: HTMLCanvasElement;
  #trail: HTMLDivElement;
  #shock: HTMLDivElement;
  #overlay: HTMLDivElement;
  #unsupported: HTMLDivElement;
  #closeHint: HTMLDivElement;
  #orb: OrbRenderer | null = null;
  #chat: ChatLayer | null = null;
  #phase: OrbPhase = 'idle';
  #voiceState: VoiceState = 'idle';
  #theme: 'light' | 'dark' = 'light';
  #radiusFactor = 0.72;
  #resizeTimer = 0;
  #chatShowTimer = 0;
  #trailTimers: number[] = [];

  #clock = 0;
  #raf = 0;
  #last = 0;
  #running = false;

  // 几何（每帧/每次布局更新）
  #vw = 1;
  #vh = 1;
  #canvasPx = 480;
  #orbPx = 346;
  #dockScale = 0.45;
  #dockTx = 0;
  #dockTy = 0;
  #dockCx = 0;
  #dockCy = 0;
  #dockPx = 168;
  #activeScale = 1;
  #activeTx = 0;
  #activeTy = 0;
  /** 空间编排结果（null = 使用默认两态布局） */
  #spatialPlan: LayoutPlan | null = null;
  /** 正在应用新的空间计划：此时 #applyLayout 不要直接把姿态写到终点 */
  #settling = false;

  // 动画
  #anim: { frames: Keyframe[]; start: number; dur: number; from: Pose; onDone?: () => void } | null = null;
  /** 编排用定时器驱动：rAF 在后台/被遮挡的窗口里可能被节流到几乎不跑，
      而位置/缩放不能因此卡住（实测会出现「界面开了、球还在右下角」）。 */
  #animTimer = 0;
  /** 当前实际呈现的姿态（动画中途再次触发时作为新动画起点） */
  #shown: Pose = { tx: 0, ty: 0, scale: 1, radius: 1, exposure: 1, glow: 0, overlay: 0 };

  /** 停靠态指针靠近程度（0-1），让球在鼠标接近时有轻微"注意到你"的回应 */
  #hover = 0;
  #hoverTarget = 0;

  /** 一次性能量脉冲（接通成功、工具完成等节点给一个可见的"回应"） */
  #pulseAt = -1e9;
  #pulseAmp = 0;
  #shockTimers: number[] = [];
  /** 姿态缓存：值没变就不写 CSS 变量 */
  #lastPose: Pose = { tx: 0, ty: 0, scale: 1, radius: 1, exposure: 1, glow: 0, overlay: 0 };
  #poseDirty = true;
  /** 遮罩透明度缓存：同上 */
  #lastOverlay = -1;
  #lastActivity = 0;
  #pctx: CanvasRenderingContext2D | null = null;
  #pDots: Array<{ x: number; y: number; vx: number; vy: number; r: number }> = [];

  /** 原生光晕包络（0-1）与目标值 */
  #nativeAura = 0;
  #auraTarget = 0;
  /** 声场环数据与绘制状态（ring 模式用） */
  #spectrum = new Float32Array(32);
  #actx: CanvasRenderingContext2D | null = null;
  #auraEnergy = 0;

  constructor() {
    super();
    this.dataset.phase = 'idle';
    this.dataset.voice = 'idle';
    this.#root = this.attachShadow({ mode: 'open' });
    this.#root.innerHTML = TEMPLATE;
    this.#canvas = this.#root.querySelector('.canvas') as HTMLCanvasElement;
    this.#particles = this.#root.querySelector('.particles') as HTMLCanvasElement;
    this.#aura = this.#root.querySelector('.aura') as HTMLCanvasElement;
    this.#trail = this.#root.querySelector('.trail') as HTMLDivElement;
    this.#shock = this.#root.querySelector('.shock') as HTMLDivElement;
    this.#overlay = this.#root.querySelector('.overlay') as HTMLDivElement;
    this.#unsupported = this.#root.querySelector('.unsupported') as HTMLDivElement;
    this.#closeHint = this.#root.querySelector('.close-hint') as HTMLDivElement;
  }

  connectedCallback(): void {
    this.#initChat();
    this.#applyLayout();
    this.#applyOptions();
    this.#canvas.addEventListener('dblclick', this.#onDoubleClick);
    this.#canvas.addEventListener('click', this.#onCanvasClick);
    this.#canvas.addEventListener('keydown', this.#onCanvasKey);
    this.#root.querySelector('.close-hint')?.addEventListener('click', this.#onCloseHint);
    document.addEventListener('keydown', this.#onDocumentKey);
    window.addEventListener('resize', this.#onResize);
    window.addEventListener('pointermove', this.#onPointerMove, { passive: true });
    document.addEventListener('visibilitychange', this.#onVisibility);
    this.#lastActivity = performance.now();
    void this.#initOrb();
  }

  disconnectedCallback(): void {
    this.#canvas.removeEventListener('dblclick', this.#onDoubleClick);
    this.#canvas.removeEventListener('click', this.#onCanvasClick);
    this.#canvas.removeEventListener('keydown', this.#onCanvasKey);
    this.#root.querySelector('.close-hint')?.removeEventListener('click', this.#onCloseHint);
    document.removeEventListener('keydown', this.#onDocumentKey);
    window.removeEventListener('resize', this.#onResize);
    window.removeEventListener('pointermove', this.#onPointerMove);
    document.removeEventListener('visibilitychange', this.#onVisibility);
    this.#cancelTrail();
    window.clearTimeout(this.#chatShowTimer);
    this.#stopLoop();
    this.#orb?.destroy();
    this.#orb = null;
  }

  attributeChangedCallback(name: string, _old: string | null, value: string | null): void {
    if (value == null) return;
    const num = (): number => Number(value);
    switch (name) {
      case 'dock-size': this.setOptions({ dockOrbSize: num() }); break;
      case 'dock-margin-x': this.setOptions({ dockMarginX: num() }); break;
      case 'dock-margin-y': this.setOptions({ dockMarginY: num() }); break;
      case 'background-opacity': this.setOptions({ backgroundOpacity: num() }); break;
      case 'overlay-blur': this.setOptions({ overlayBlur: num() }); break;
      case 'glow-intensity': this.setOptions({ glowIntensity: num() }); break;
      case 'breathing-amplitude': this.setOptions({ breathingAmplitude: num() }); break;
      case 'motion-speed': this.setOptions({ motionSpeed: num() }); break;
      case 'zoom': this.setOptions({ zoom: num() }); break;
      case 'glass-opacity': this.setOptions({ glassOpacity: num() }); break;
      case 'chat-enabled': this.setOptions({ chatEnabled: value !== 'false' }); break;
      case 'orb': this.setOptions({ orb: value }); break;
      case 'orb-preset': this.setOptions({ orbPreset: value }); break;
      case 'particles-enabled': this.setOptions({ particlesEnabled: value !== 'false' }); break;
      default: break;
    }
  }

  get phase(): OrbPhase { return this.#phase; }
  get voiceState(): VoiceState { return this.#voiceState; }
  get orb(): OrbRenderer | null { return this.#orb; }
  get options(): Readonly<OrbOptions> { return { ...this.#options }; }
  /** 对话层实例（chatEnabled=false 时为 null） */
  get chat(): ChatLayer | null { return this.#chat; }

  /**
   * 空间编排结果：由 <ai-spatial-stage> 计算后交进来。
   *
   * 传 null = 回到默认布局（右下停靠 + 屏心展开）。
   * 这个入口让 orb 本身完全不知道"场景/展示面"的存在——它只接收最终的
   * 位置、直径、对话区矩形，保持组件可独立使用。
   */
  setSpatialPlan(plan: LayoutPlan | null): void {
    const changed = this.#spatialPlan !== plan;
    this.#spatialPlan = plan;
    // 先记下当前实际姿态：新版 #applyLayout 会因为 #settling 跳过"瞬移到终点"，
    // 这样 #startAnim 才能从旧位置缓动到新位置（否则起点就是终点，看起来像瞬移）。
    this.#settling = true;
    try { this.#applyLayout(); } finally { this.#settling = false; }
    // 收起/展开过程中不打断：那两段编排本身已经在动。
    if (changed && this.#phase === 'active' && !this.#anim) this.#animateToRest(240);
  }

  /** 短距离让位：从当前姿态缓动到新的静止姿态 */
  #animateToRest(ms: number): void {
    this.#startAnim([{ t: ms, ...this.#restPose(), ease: easeOut }]);
  }

  setOptions(patch: Partial<OrbOptions>): void {
    const prevOrb = this.#options.orb;
    const prevPreset = this.#options.orbPreset;
    this.#options = { ...this.#options, ...patch };
    this.#applyLayout();
    this.#applyOptions();
    // 渲染体或形态预设变了 → 重建悬浮球（换球/换形态无需刷新页面）
    if (patch.orb !== undefined && patch.orb !== prevOrb
      || patch.orbPreset !== undefined && patch.orbPreset !== prevPreset) {
      void this.reloadOrb();
    }
  }

  /** 重建悬浮球渲染体（换渲染体 / 换形态预设时用） */
  async reloadOrb(): Promise<void> {
    this.#stopLoop();
    this.#orb?.destroy();
    this.#orb = null;
    this.#unsupported.hidden = true;
    this.#canvas.style.display = '';
    this.#anim = null;
    this.#shown = this.#restPose();
    this.#applyPoseCss(this.#shown);
    this.#applyOverlay(this.#shown.overlay);
    await this.#initOrb();
  }

  /** 进入活跃态（双击）：四段编排 —— 坍缩 → 高能量核心 → 短光迹到屏心 → 展开 */
  activate(): void {
    this.#activate(true);
  }

  /**
   * 展开但不接通语音。文字输入等场景用这个，避免"打字提问"顺手把麦克风打开。
   * 事件 detail 里带 voice:false，宿主据此跳过 startVoice。
   */
  activateSilent(): void {
    this.#activate(false);
  }

  #activate(withVoice: boolean): void {
    if (this.#phase === 'active') {
      if (withVoice) this.#notifyActivity();
      return;
    }
    this.#phase = 'active';
    this.#notifyActivity();
    this.#runActivation();
    // 通知宿主立即开始接通语音：动画与连接并行，缩短"按下后没反应"的空窗
    this.dispatchEvent(new CustomEvent('orb:phase', {
      detail: { phase: 'active', voice: withVoice }, bubbles: true, composed: true,
    }));
  }

  /** 回到空闲态：三段编排 —— 坍缩成核心 → 短光迹回停靠位 → 微弹落定 */
  deactivate(): void {
    if (this.#phase === 'idle') return;
    this.#phase = 'idle';
    this.#notifyActivity();
    this.setVoiceState('idle');
    this.#runDeactivation();
    this.dispatchEvent(new CustomEvent('orb:phase', { detail: { phase: 'idle' }, bubbles: true, composed: true }));
  }

  toggle(): void {
    if (this.#phase === 'idle') this.activate();
    else this.deactivate();
  }

  setVoiceState(state: VoiceState): void {
    if (state !== 'idle') this.#notifyActivity();
    this.#voiceState = state;
    this.dataset.voice = state;
    this.#orb?.setVisualState(this.#resolveState());
    // 思考中的呼吸点：即使还没有任何文字，也让用户看到"它在想"。
    // 'user' 也要收起——真正开口后由监听波形接管，否则接通后会一直挂着三个点。
    this.#chat?.setThinking(state === 'thinking' && this.#phase === 'active');
    // 聆听波形只在真正收音时出现；转入 AI/思考/待机必须收起，避免动画卡住
    if (state !== 'user') this.#chat?.setListening(false);
    this.#syncAria();
    this.dispatchEvent(new CustomEvent('orb:voice', { detail: { state }, bubbles: true, composed: true }));
  }

  /** 音频频段（0-1，由宿主平滑；传空停止律动） */
  setAudioBands(bands?: Partial<AudioBands>): void {
    this.#orb?.setAudioBands(bands);
    // 原生光晕的目标值：响度为主，高频补一点（齿音/气声让边缘更"活"）。
    // 这里只记目标，真正的快起慢落在 #tick 里做，避免和渲染体各自的包络打架。
    const all = bands?.all ?? 0;
    const high = bands?.high ?? 0;
    this.#auraTarget = Math.min(1, Math.max(0, all * 0.82 + high * 0.18));
  }

  /** 32 段对数频谱（0-1），驱动声场环 */
  setAudioSpectrum(levels?: Float32Array): void {
    if (!levels) {
      this.#spectrum.fill(0);
      return;
    }
    const n = Math.min(this.#spectrum.length, levels.length);
    for (let i = 0; i < n; i++) this.#spectrum[i] = levels[i];
  }

  /** 任意交互都会唤醒睡眠态 */
  notifyActivity(): void {
    this.#notifyActivity();
  }

  /**
   * 一次性能量脉冲：约 600ms 内让球"亮一下"，用于接通成功、工具查完这类节点，
   * 让用户感到系统确实收到了动作，而不是只有文字变化。
   */
  pulse(strength = 1): void {
    this.#pulseAt = performance.now();
    this.#pulseAmp = Math.max(this.#pulseAmp, Math.min(1.4, strength));
    this.#notifyActivity();
    this.#shockWave(0.55 * Math.min(1, strength));
  }

  /** 从球心扩散的一圈能量环 */
  #shockWave(strength = 1): void {
    const el = this.#shock;
    for (const id of this.#shockTimers) window.clearTimeout(id);
    this.#shockTimers = [];
    const s0 = this.#boundingScale();
    el.style.transition = 'none';
    el.style.opacity = '0';
    el.style.transform = `translate(var(--orb-tx), var(--orb-ty)) scale(${(s0 * 0.5).toFixed(3)})`;
    this.#shockTimers.push(window.setTimeout(() => {
      el.style.transition = 'opacity 620ms cubic-bezier(0.16, 0.84, 0.44, 1), transform 620ms cubic-bezier(0.16, 0.84, 0.44, 1)';
      el.style.opacity = String(0.55 * strength);
      el.style.transform = `translate(var(--orb-tx), var(--orb-ty)) scale(${(s0 * 2.2).toFixed(3)})`;
      this.#shockTimers.push(window.setTimeout(() => { el.style.opacity = '0'; }, 520));
    }, 16));
  }

  /** 冲击环起始尺寸：按当前球在屏幕上的视觉直径归一化 */
  #boundingScale(): number {
    return Math.max(0.4, this.#shown.scale * (this.#orbPx / 40));
  }

  // ---- 对话层快捷方法 ----

  addMessage(role: ChatRole, content: string, kind?: string): void { this.#chat?.addMessage(role, content, kind); }
  addMessages(list: ChatMessage[]): void { this.#chat?.addMessages(list); }
  clearMessages(): void { this.#chat?.clearMessages(); }
  get messages(): ChatMessage[] { return this.#chat?.messages ?? []; }
  addToolChip(name: string, callId: string | null, label: string): void { this.#chat?.addToolChip(name, callId, label); }
  finishToolChip(name: string, ok: boolean, callId: string | null, label: string): void { this.#chat?.finishToolChip(name, ok, callId, label); }
  startStream(): void { this.#chat?.startStream(); }
  appendStream(chunk: string): void { this.#chat?.appendStream(chunk); }
  endStream(): void { this.#chat?.endStream(); }
  setAssistantLive(text: string): void { this.#chat?.setAssistantLive(text); }
  beginLive(role: ChatRole, kind?: string): void { this.#chat?.beginLive(role, kind); }
  setLive(text: string): void { this.#chat?.setLive(text); }
  commitLive(content: string): void { this.#chat?.commitLive(content); }
  discardLive(): void { this.#chat?.discardLive(); }
  setThinking(on: boolean): void { this.#chat?.setThinking(on); }
  setListening(on: boolean): void { this.#chat?.setListening(on); }
  clearInput(): void { this.#chat?.clearInput(); }

  // ---------- 内部 ----------

  #notifyActivity(): void {
    this.#lastActivity = performance.now();
  }

  /** 让读屏软件也能听到状态变化（视觉反馈之外的第二通道） */
  #syncAria(): void {
    if (this.#phase === 'idle') {
      this.#canvas.setAttribute('aria-label', '双击唤起 AI 对话');
      return;
    }
    const label: Record<VoiceState, string> = {
      idle: 'AI 对话已展开，双击收起',
      thinking: 'AI 正在思考',
      user: '正在聆听你说话',
      ai: 'AI 正在回答',
    };
    this.#canvas.setAttribute('aria-label', label[this.#voiceState]);
  }

  #initChat(): void {
    if (!this.#options.chatEnabled || this.#chat) return;
    this.#chat = new ChatLayer(this.#root, this, this.#options);
    this.#chat.setOptions(this.#options);
  }

  async #initOrb(): Promise<void> {
    const factory = getOrbFactory(this.#options.orb);
    if (!factory) {
      console.warn(`[ai-orb-chat] 未注册的渲染体：${this.#options.orb}`);
      this.#fallback();
      return;
    }
    const renderer = factory(this.#canvas, this.#options);
    this.#orb = renderer;
    this.#radiusFactor = (renderer as unknown as { radiusFactor?: number }).radiusFactor ?? 0.72;
    const ok = await renderer.init();
    if (!ok) {
      renderer.destroy();
      this.#orb = null;
      this.#fallback();
      return;
    }
    this.dataset.engine = 'ready';
    this.#applyLayout();
    renderer.setVisualState(this.#resolveState());
    this.#startLoop();
    this.dispatchEvent(new CustomEvent('orb:ready', { bubbles: true, composed: true }));
  }

  #fallback(): void {
    this.#unsupported.hidden = false;
    this.#canvas.style.display = 'none';
    this.dataset.engine = 'unsupported';
    // 无球时也让对话层可用：直接以活跃态呈现
    this.#phase = 'active';
    this.dataset.phase = 'active';
    this.#setCss('--orb-scale', '0');
  }

  #resolveState(): OrbVisualState {
    // 停靠态用独立的 dock 形态：配色取「思考中」（用户反馈 idle 太灰暗），
    // 但流速/形变折中，保持角落里的克制感。
    if (this.#phase === 'idle') return 'dock';
    const map: Record<VoiceState, OrbVisualState> = {
      idle: 'active',
      thinking: 'thinking',
      user: 'listening',
      ai: 'speaking',
    };
    return map[this.#voiceState];
  }

  /**
   * 跟随页（data-follower）双击不是「收起」，而是「请求接管语音」。
   * 跟随页的展开态是从主控页镜像来的，本地 toggle 会把它关掉，
   * 还会通过广播把主控页也关掉（实测形成回环）。
   */
  #onDoubleClick = (): void => {
    if (this.hasAttribute('data-follower')) {
      this.dispatchEvent(new CustomEvent('orb:takeover', { bubbles: true, composed: true }));
      return;
    }
    this.toggle();
  };

  /** 活跃态单击球 = 打断当前这句话（双击的第一次 click 也会进来，宿主需幂等） */
  #onCanvasClick = (): void => {
    if (this.#phase !== 'active') return;
    this.dispatchEvent(new CustomEvent('orb:interrupt', { bubbles: true, composed: true }));
  };

  #onCloseHint = (): void => { this.deactivate(); };

  #onCanvasKey = (event: KeyboardEvent): void => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); this.toggle(); }
  };

  #onDocumentKey = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape') return;
    // 设置面板打开时，Esc 先关面板，不要顺手把通话挂掉
    if (document.documentElement.dataset.panelOpen === '1') return;
    this.deactivate();
  };

  #onResize = (): void => {
    window.clearTimeout(this.#resizeTimer);
    this.#resizeTimer = window.setTimeout(() => this.#applyLayout(), 150);
  };

  /** 停靠态下鼠标靠近 → 轻微提亮，让球"注意到你" */
  #onPointerMove = (event: PointerEvent): void => {
    if (this.#phase === 'active') { this.#hoverTarget = 0; return; }
    const dx = event.clientX - this.#dockCx;
    const dy = event.clientY - this.#dockCy;
    const d = Math.hypot(dx, dy);
    const r = Math.max(24, this.#dockPx / 2);
    this.#hoverTarget = d < r * 1.5
      ? Math.min(1, Math.max(0, 1 - Math.max(0, d - r * 0.72) / (r * 0.78)))
      : 0;
  };

  #onVisibility = (): void => {
    // 切到后台只重置时间基准；通话与对话状态保持（用户可能只是去查资料）
    if (!document.hidden) this.#last = performance.now();
  };

  // ---- 编排 ----

  #dockFrames(): { tx: number; ty: number; scale: number } {
    return { tx: this.#dockTx, ty: this.#dockTy, scale: this.#dockScale };
  }
  #activeFrames(): { tx: number; ty: number; scale: number } {
    return { tx: this.#activeTx, ty: this.#activeTy, scale: this.#activeScale };
  }

  /** 静止姿态：由 phase 直接决定 */
  #restPose(): Pose {
    const f = this.#phase === 'active' ? this.#activeFrames() : this.#dockFrames();
    return {
      ...f,
      radius: 1,
      exposure: 1,
      glow: this.#baseGlow(),
      overlay: this.#phase === 'active' ? 1 : 0,
    };
  }

  #runActivation(): void {
    const dock = this.#dockFrames();
    const center = this.#activeFrames();
    const tiny = dock.scale * 0.16;
    const o = this.#options;
    const frames: Keyframe[] = [
      { t: o.collapseMs, tx: dock.tx, ty: dock.ty, scale: tiny, radius: 0.25, exposure: 2.4, glow: 0.55, overlay: 0.12, ease: easeIn },
      { t: o.collapseMs + o.coreMs, tx: dock.tx, ty: dock.ty, scale: tiny * 0.92, radius: 0.2, exposure: 3.1, glow: 0.95, overlay: 0.3, ease: easeOut },
      { t: o.collapseMs + o.coreMs + o.trailMs, tx: center.tx, ty: center.ty, scale: Math.max(tiny * 1.4, center.scale * 0.22), radius: 0.45, exposure: 2.2, glow: 0.6, overlay: 0.62, ease: easeOut },
      { t: o.collapseMs + o.coreMs + o.trailMs + o.expandMs, tx: center.tx, ty: center.ty, scale: center.scale, radius: 1, exposure: 1, glow: this.#baseGlow(), overlay: 1, ease: easeOutBack },
    ];
    this.#startAnim(frames, () => {
      if (this.#phase !== 'active') return;
      this.#revealChat();
      this.#orb?.setVisualState(this.#resolveState());
      // 故意不自动聚焦输入框：输入框默认隐藏，用户用鼠标靠近才浮现。
      // 自动聚焦会让 :focus-within 把它永久点亮，等于取消了"默认隐藏"。
      this.dispatchEvent(new CustomEvent('orb:settled', { detail: { phase: 'active' }, bubbles: true, composed: true }));
    });
    // 光迹只在中段出现；到达核心那一刻来一圈冲击环
    this.#flashTrail(o.collapseMs + o.coreMs, o.trailMs);
    window.setTimeout(() => { if (this.#phase === 'active') this.#shockWave(1); }, o.collapseMs + Math.round(o.coreMs * 0.5));

    // 对话层不必等完全展开：球抵达屏心、开始展开时就淡入（约 560ms）
    window.clearTimeout(this.#chatShowTimer);
    this.#chatShowTimer = window.setTimeout(() => {
      if (this.#phase === 'active') this.#revealChat();
    }, o.collapseMs + o.coreMs + o.trailMs);
  }

  #revealChat(): void {
    if (this.dataset.phase === 'active') return;
    this.dataset.phase = 'active';
    this.#chat?.setThinking(this.#voiceState === 'thinking');
    // 入场时重新贴底（历史可能刚被浏览器重排过）
    this.#chat?.snapToBottom();
    this.#syncAria();
  }

  #runDeactivation(): void {
    const dock = this.#dockFrames();
    const center = this.#activeFrames();
    const tiny = center.scale * 0.16;
    const o = this.#options;
    window.clearTimeout(this.#chatShowTimer);
    this.dataset.phase = 'idle';   // 对话层立即开始淡出（遮罩最后落到 0）
    this.#orb?.setVisualState(this.#resolveState());
    this.#syncAria();
    const frames: Keyframe[] = [
      { t: o.closeCollapseMs, tx: center.tx, ty: center.ty, scale: tiny, radius: 0.25, exposure: 2.6, glow: 0.7, overlay: 0.6, ease: easeIn },
      { t: o.closeCollapseMs + o.closeTrailMs, tx: dock.tx, ty: dock.ty, scale: Math.max(tiny, dock.scale * 0.42), radius: 0.5, exposure: 1.7, glow: 0.4, overlay: 0.18, ease: easeOut },
      { t: o.closeCollapseMs + o.closeTrailMs + o.closeSettleMs, tx: dock.tx, ty: dock.ty, scale: dock.scale, radius: 1, exposure: 1, glow: this.#baseGlow(), overlay: 0, ease: easeOutBack },
    ];
    this.#startAnim(frames, () => {
      if (this.#phase !== 'idle') return;
      this.#orb?.setVisualState(this.#resolveState());
      this.dispatchEvent(new CustomEvent('orb:settled', { detail: { phase: 'idle' }, bubbles: true, composed: true }));
    });
    this.#flashTrail(o.closeCollapseMs, o.closeTrailMs);
    window.setTimeout(() => { if (this.#phase === 'idle') this.#shockWave(0.5); }, o.closeCollapseMs);
  }

  #cancelTrail(): void {
    for (const id of this.#trailTimers) window.clearTimeout(id);
    this.#trailTimers = [];
    this.#trail.style.transition = 'none';
    this.#trail.style.opacity = '0';
  }

  #flashTrail(delay: number, dur: number): void {
    this.#cancelTrail();
    const t = this.#trail;
    const fade = Math.round(dur * 0.5);
    this.#trailTimers.push(window.setTimeout(() => {
      t.style.transition = `opacity ${fade}ms ease`;
      t.style.opacity = '0.9';
      this.#trailTimers.push(window.setTimeout(() => { t.style.opacity = '0'; }, fade));
    }, delay));
  }

  #baseGlow(): number {
    return 0;
  }

  #startAnim(frames: Keyframe[], onDone?: () => void): void {
    const total = frames[frames.length - 1].t;
    // 关键：起点用"当前实际姿态"，中途反向（如展开到一半按 Esc）不会跳回右下角
    this.#anim = { frames, start: performance.now(), dur: Math.max(1, total), from: { ...this.#shown }, onDone };
    this.#notifyActivity();
    this.#stepAnim();
    window.clearInterval(this.#animTimer);
    this.#animTimer = window.setInterval(() => this.#stepAnim(), 16);
  }

  /** 编排步进：由定时器驱动，保证窗口被节流时位置也能走完 */
  #stepAnim(): void {
    const a = this.#anim;
    if (!a) { window.clearInterval(this.#animTimer); this.#animTimer = 0; return; }
    const now = performance.now();
    const pose = this.#sampleAnim(now);
    if (!pose) return;
    this.#shown = pose;
    this.#applyPoseCss(pose);
    this.#applyOverlay(pose.overlay);
    // 落地后停掉定时器（onDone 已在 #sampleAnim 内触发）
    if (!this.#anim) { window.clearInterval(this.#animTimer); this.#animTimer = 0; }
  }

  /** 依关键帧计算当前姿态（起点 = 动画启动瞬间的实际姿态） */
  #sampleAnim(now: number): Pose | null {
    const a = this.#anim;
    if (!a) return null;
    const elapsed = now - a.start;
    if (elapsed >= a.dur) {
      const last = a.frames[a.frames.length - 1];
      const pose: Pose = {
        tx: last.tx, ty: last.ty, scale: last.scale,
        radius: last.radius, exposure: last.exposure, glow: last.glow, overlay: last.overlay,
      };
      this.#anim = null;
      a.onDone?.();
      return pose;
    }
    let prev: Keyframe = { t: 0, ...a.from, ease: linear };
    for (const k of a.frames) {
      if (elapsed <= k.t) {
        const span = Math.max(1, k.t - prev.t);
        const p = k.ease((elapsed - prev.t) / span);
        return {
          tx: prev.tx + (k.tx - prev.tx) * p,
          ty: prev.ty + (k.ty - prev.ty) * p,
          scale: prev.scale + (k.scale - prev.scale) * p,
          radius: prev.radius + (k.radius - prev.radius) * p,
          exposure: prev.exposure + (k.exposure - prev.exposure) * p,
          glow: prev.glow + (k.glow - prev.glow) * p,
          overlay: prev.overlay + (k.overlay - prev.overlay) * p,
        };
      }
      prev = k;
    }
    return null;
  }

  #applyPoseCss(pose: Pose): void {
    this.#setCss('--orb-tx', `${pose.tx.toFixed(1)}px`);
    this.#setCss('--orb-ty', `${pose.ty.toFixed(1)}px`);
    this.#setCss('--orb-scale', pose.scale.toFixed(4));
    this.#lastPose = pose;
    this.#poseDirty = false;
  }

  /**
   * 遮罩不透明度 + 背景模糊同步推进。
   * 模糊量是「进度 × 目标值」的线性映射：0→0px、0.62→14px、1→22px，
   * 用户看到的是背景一点点晕开，而不是闪一下。
   */
  #applyOverlay(opacity: number): void {
    const v = Math.min(1, Math.max(0, opacity));
    if (Math.abs(v - this.#lastOverlay) < 0.004) return;
    this.#lastOverlay = v;
    this.#overlay.style.opacity = String(v);
    const blurPx = v * this.#options.overlayBlur;
    this.#setCss('--orb-blur-cur', `${blurPx.toFixed(1)}px`);
  }

  /** 画布固定单尺寸 + 停靠/活跃两个几何目标（Q3 版式） */
  #applyLayout(): void {
    const o = this.#options;
    const vw = Math.max(1, window.innerWidth);
    const vh = Math.max(1, window.innerHeight);
    this.#vw = vw; this.#vh = vh;

    const canvasPx = Math.round(Math.min(Math.max(vh * o.orbCanvasRatio, 280), 620));
    const orbPx = canvasPx * this.#radiusFactor;
    this.#canvasPx = canvasPx; this.#orbPx = orbPx;
    this.#setCss('--orb-canvas', `${canvasPx}px`);

    // 停靠：orb 直径 = dockOrbSize（窄屏缩到 dockOrbSizeMin）
    const dockSize = vw < o.narrowWidth ? Math.max(o.dockOrbSizeMin, o.dockOrbSize * 0.8) : o.dockOrbSize;
    this.#setCss('--orb-dock-size', `${dockSize}px`);
    this.#setCss('--orb-dock-margin-x', `${o.dockMarginX}px`);
    this.#setCss('--orb-dock-margin-y', `${o.dockMarginY}px`);
    this.#dockScale = dockSize / orbPx;
    const dockCx = vw - o.dockMarginX - dockSize / 2;
    const dockCy = vh - o.dockMarginY - dockSize / 2;
    this.#dockTx = dockCx - vw / 2;
    this.#dockTy = dockCy - vh / 2;
    this.#dockCx = dockCx;
    this.#dockCy = dockCy;
    this.#dockPx = dockSize;

    // 活跃：球心移到 activeOrbCenterY（默认 0.48，真居中）
    const activeRatio = vw < o.narrowWidth ? o.activeOrbRatioNarrow : o.activeOrbRatio;
    const activeOrbPx = vh * activeRatio * o.activeRadiusScale;
    this.#activeScale = activeOrbPx / orbPx;
    this.#activeTx = 0;
    this.#activeTy = (o.activeOrbCenterY - 0.5) * vh;

    // 空间编排覆盖：位置与直径由 SLO 决定（球让位/缩小/停靠左下都在这里生效）
    const spatial = this.#spatialPlan;
    if (spatial) {
      this.#activeScale = Math.max(24, spatial.orb.diameter) / orbPx;
      this.#activeTx = spatial.orb.x - vw / 2;
      this.#activeTy = spatial.orb.y - vh / 2;
      this.#canvas.style.opacity = spatial.orb.hidden ? '0' : '';
      this.#canvas.style.pointerEvents = spatial.orb.hidden ? 'none' : '';
    } else {
      this.#canvas.style.opacity = '';
      this.#canvas.style.pointerEvents = '';
    }

    // 静态态（无动画时）直接落到对应目标。
    // #settling 时故意不写：调用方会用 #startAnim 从旧姿态补一段让位动画。
    if (!this.#anim && !this.#settling) {
      this.#shown = this.#restPose();
      this.#applyPoseCss(this.#shown);
      this.#applyOverlay(this.#shown.overlay);
    }

    // 对话层：空间模式下用 SLO 的矩形，否则回到"球上方对话流 / 球下方输入框"
    if (this.#chat && spatial) {
      this.#chat.layoutSpatial(spatial.chat);
      // 关闭按钮跟着对话列走：模式切换后不该还留在屏幕底部正中
      const cx = spatial.chat.composerX + spatial.chat.composerW / 2;
      this.#closeHint.style.left = `${Math.round(cx)}px`;
      this.#closeHint.style.top = `${Math.round(spatial.chat.composerY + 52)}px`;
      this.#closeHint.style.bottom = 'auto';
    } else {
      this.#closeHint.style.removeProperty('left');
      this.#closeHint.style.removeProperty('top');
      this.#closeHint.style.removeProperty('bottom');
      if (this.#chat) {
        const activeOrbPxNow = this.#activeScale * orbPx;
        const orbTop = vh * o.activeOrbCenterY - activeOrbPxNow / 2;
        const orbBottom = vh * o.activeOrbCenterY + activeOrbPxNow / 2;
        this.#chat.layout(o.chatTop, Math.max(120, orbTop - o.chatTop - o.chatGap), orbBottom + 22);
      }
    }
  }

  #applyOptions(): void {
    const o = this.#options;
    this.#setCss('--orb-background-opacity', String(o.backgroundOpacity));
    this.#setCss('--orb-overlay-blur', `${o.overlayBlur}px`);
    this.#setCss('--orb-dock-margin-x', `${o.dockMarginX}px`);
    this.#setCss('--orb-dock-margin-y', `${o.dockMarginY}px`);
    this.#applyTheme(o.theme);
    // ring 以外的模式不画独立画布；顺手清掉可能残留的旧帧
    this.#aura.style.display = o.auraMode === 'ring' ? '' : 'none';
    if (this.#chat) this.#chat.setOptions(o);
    if (!o.particlesEnabled) this.#pctx = null;
  }

  /**
   * 主题落地：浅色后台里不能再用「黑底浅字」，否则嵌进去像一块补丁。
   * 'auto' 从宿主页面（body → html）的背景色推亮度，取不到就用系统偏好。
   */
  #applyTheme(theme: OrbOptions['theme']): void {
    const resolved = theme === 'auto' ? detectTheme() : theme;
    if (this.dataset.theme !== resolved) this.dataset.theme = resolved;
    this.#theme = resolved;
  }

  #setCss(name: string, value: string): void {
    this.style.setProperty(name, value);
  }

  #startLoop(): void {
    if (this.#running) return;
    this.#running = true;
    this.#last = performance.now();
    this.#raf = requestAnimationFrame(this.#tick);
  }

  #stopLoop(): void {
    this.#running = false;
    cancelAnimationFrame(this.#raf);
    window.clearInterval(this.#animTimer);
    this.#animTimer = 0;
  }

  #tick = (now: number): void => {
    if (!this.#running) return;
    this.#raf = requestAnimationFrame(this.#tick);
    const dt = Math.min(0.05, Math.max(0.001, (now - this.#last) / 1000));
    this.#last = now;
    this.#clock += dt;

    const o = this.#options;

    // 睡眠：长时间静默 + 非说话/思考 → 退到低亮度慢呼吸（Q5）
    const sleeping = this.#phase === 'active'
      && this.#voiceState === 'idle'
      && (now - this.#lastActivity) > o.idleSleepMs;

    // 姿态：动画期间由 #stepAnim（定时器）维护 #shown；这里不再自己采样，
    // 否则 rAF 恢复时会与定时器互相覆盖。
    const pose = this.#anim ? this.#shown : this.#restPose();
    if (!this.#anim) this.#shown = pose;
    // ⚠ 只在值真的变化时写 CSS 变量：每帧无条件写会持续触发样式重算（笔记本掉电元凶）
    if (this.#poseDirty || pose.tx !== this.#lastPose.tx) this.#setCss('--orb-tx', `${pose.tx.toFixed(1)}px`);
    if (this.#poseDirty || pose.ty !== this.#lastPose.ty) this.#setCss('--orb-ty', `${pose.ty.toFixed(1)}px`);
    if (this.#poseDirty || pose.scale !== this.#lastPose.scale) this.#setCss('--orb-scale', pose.scale.toFixed(4));
    this.#poseDirty = false;
    this.#lastPose = pose;

    // 常驻呼吸（两态都生效）
    const breathAmp = o.breathingAmplitude * (sleeping ? o.sleepBreathScale : 1);
    const breath = 1 + breathAmp * Math.sin((this.#clock / o.breathePeriod) * Math.PI * 2);
    const speedScale = o.motionSpeed * (sleeping ? o.sleepSpeedScale : 1);
    const exposureScale = pose.exposure * (sleeping ? o.sleepExposureScale : 1);
    const radiusScale = breath * pose.radius;
    const glow = pose.glow;

    // 悬停回应：接近停靠球时轻微提亮（细节，不改变布局）
    this.#hover += (this.#hoverTarget - this.#hover) * Math.min(1, dt * 10);

    // 一次性脉冲：指数衰减，约 600ms 收干净
    let pulse = 0;
    if (this.#pulseAmp > 0.001) {
      const age = (now - this.#pulseAt) / 1000;
      pulse = this.#pulseAmp * Math.exp(-age / 0.22);
      if (pulse < 0.002) this.#pulseAmp = 0;
    }

    // 原生光晕包络：起音稍慢、释放更慢，光比声"留得住"
    {
      const tau = this.#auraTarget > this.#nativeAura ? AURA_ATTACK : AURA_RELEASE;
      this.#nativeAura += (this.#auraTarget - this.#nativeAura) * (1 - Math.exp(-dt / tau));
      if (this.#nativeAura < 0.0015) this.#nativeAura = 0;
    }

    const byIndex: Record<number, number> = {};
    if (o.zoom != null) byIndex[5] = o.zoom;
    if (o.glassOpacity != null) byIndex[20] = o.glassOpacity;

    this.#orb?.setOverrides({
      radiusScale: radiusScale * (1 + this.#hover * 0.012 + pulse * 0.02),
      speedScale: speedScale * (1 + pulse * 0.6),
      exposureScale: exposureScale * (1 + this.#hover * 0.08 + pulse * 0.22),
      edgeGlow: glow + o.glowIntensity * 0.12 + this.#hover * 0.3 + pulse * 0.5
        + (o.auraMode === 'native' ? this.#nativeAura * NATIVE_AURA_GAIN : 0),
      byIndex,
    });
    this.#applyOverlay(pose.overlay);

    // 声场：默认走原生辉光（方案 A）。ring 模式保留旧线条环用于对比。
    if (o.auraMode === 'ring' && (this.#phase === 'active' || this.#anim)) this.#drawAura(pose, dt);
    if (o.particlesEnabled && (this.#phase === 'active' || this.#anim)) this.#drawParticles(dt);
  };

  /**
   * 声场环（方案 C）：32 段对数频谱画成绕球的一圈细线，向外辐射。
   * 只加不减：即使频谱全静音，也保留一圈极淡的「待命环」，让球不会孤零零浮着。
   * 线宽恒定（不随缩放变粗），这是它比球面形变更容易被余光注意到的原因。
   */
  #drawAura(pose: Pose, dt: number): void {
    const cv = this.#aura;
    // 环的绘制半径 = 球可见半径，随姿态缩放（展开过程中跟着球一起长大）
    const orbPxNow = this.#orbPx * pose.scale;
    const base = orbPxNow * 0.5;
    const pad = 64;
    const size = Math.ceil((base + pad) * 2);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const px = Math.floor(size * dpr);
    if (cv.width !== px || cv.height !== px) {
      cv.width = px; cv.height = px;
      cv.style.width = `${size}px`;
      cv.style.height = `${size}px`;
      cv.style.marginLeft = `${-size / 2}px`;
      cv.style.marginTop = `${-size / 2}px`;
      this.#actx = null;
    }
    if (!this.#actx) this.#actx = cv.getContext('2d');
    const ctx = this.#actx;
    if (!ctx) return;

    // 与球体同一套 transform，视觉上完全贴合
    cv.style.transform = `translate(${pose.tx.toFixed(1)}px, ${pose.ty.toFixed(1)}px)`;

    let energy = 0;
    for (let i = 0; i < this.#spectrum.length; i++) energy += this.#spectrum[i];
    energy /= this.#spectrum.length;
    this.#auraEnergy += (energy - this.#auraEnergy) * Math.min(1, dt * 12);

    const cx = px / 2;
    const cy = px / 2;
    const n = this.#spectrum.length;
    const rBase = base * dpr;
    const active = this.#voiceState === 'ai' || this.#voiceState === 'user';

    ctx.clearRect(0, 0, px, px);
    ctx.lineCap = 'round';

    // 底色环：始终存在（待命环），保证即使全静音也有一圈"在等你说话"的轮廓
    ctx.beginPath();
    ctx.arc(cx, cy, rBase + 9 * dpr, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(${this.#auraRgb()}, ${(0.10 + this.#auraEnergy * 0.30).toFixed(3)})`;
    ctx.lineWidth = 1.1 * dpr;
    ctx.stroke();

    // 频谱条：从环向外发散。长度差是"看得见"的关键——静音时也留一点长度，
    // 这样相邻条的高低差才形成梳状轮廓，而不是全体归零后消失。
    const amp = 10 + 34 * Math.min(1, this.#auraEnergy * 2.2);
    for (let i = 0; i < n; i++) {
      const v = this.#spectrum[i];
      const a = (i / n) * Math.PI * 2 - Math.PI / 2;
      const r0 = rBase + 9 * dpr;
      const len = (1.2 + v * amp) * dpr;
      const x0 = cx + Math.cos(a) * r0;
      const y0 = cy + Math.sin(a) * r0;
      const x1 = cx + Math.cos(a) * (r0 + len);
      const y1 = cy + Math.sin(a) * (r0 + len);
      // 说话时更亮；待机时保留极淡的呼吸感
      const alpha = active ? 0.28 + v * 0.62 : 0.10 + v * 0.30;
      ctx.strokeStyle = `rgba(${this.#auraRgb()}, ${alpha.toFixed(3)})`;
      ctx.lineWidth = 2.0 * dpr;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    }
  }

  /** 声场环配色：浅色底用较深的蓝，深色底用浅蓝，保证对比度 */
  #auraRgb(): string {
    return this.#theme === 'light' ? '46, 106, 196' : '168, 206, 255';
  }

  #drawParticles(dt: number): void {
    const cv = this.#particles;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.floor(this.#vw * dpr);
    const h = Math.floor(this.#vh * dpr);
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    if (!this.#pctx) this.#pctx = cv.getContext('2d');
    const ctx = this.#pctx;
    if (!ctx) return;
    const o = this.#options;
    if (this.#pDots.length !== o.particleCount) {
      this.#pDots = Array.from({ length: o.particleCount }, () => ({
        x: Math.random() * w, y: Math.random() * h,
        vx: (Math.random() - 0.5) * 6 * dpr, vy: (Math.random() - 0.5) * 6 * dpr,
        r: (Math.random() * 1.1 + 0.3) * dpr,
      }));
    }
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = `rgba(${this.#theme === 'light' ? '40, 92, 170' : '180, 210, 255'}, ${o.particleOpacity})`;
    for (const d of this.#pDots) {
      d.x += d.vx * dt; d.y += d.vy * dt;
      if (d.x < 0) d.x += w; else if (d.x > w) d.x -= w;
      if (d.y < 0) d.y += h; else if (d.y > h) d.y -= h;
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
