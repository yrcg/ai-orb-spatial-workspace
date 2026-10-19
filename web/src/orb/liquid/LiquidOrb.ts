import { EFFECT_WGSL } from './effect.wgsl';
import { PRESET_SEEDS, UNIFORM_FLOATS, DEFAULT_PRESET, type PresetSeeds } from './seeds';
import type { AudioBands, OrbRenderer, OrbVisualState, UniformOverrides } from '../renderers';

/**
 * liquid-orb 的 WebGPU 液态球运行时封装。
 *
 * 上游：https://github.com/stdexception/liquid-orb（MIT License, (c) stdexception）
 * 视觉主体是上游导出产物里的 WGSL；本文件负责管线、状态插值、音频映射，
 * 并额外补上本项目的「柔性膜」动态（Q7）：
 *   · 待机缓慢呼吸（由组件经 setOverrides 下发 radiusScale）
 *   · 说话时局部鼓起/凹陷（mid → warp/ridge/sharp 权重最高）
 *   · 重音能量脉冲（响度陡增 → 一次瞬态超调）
 *   · 柔性回弹（radius/exposure 走弹簧阻尼，不是线性归零）
 *
 * 渲染方式：全屏三角形 + 片元光线步进，成本 ∝ 画布像素数。
 * 所以画布固定单一尺寸，位置与缩放交给 CSS transform（见 component.ts）。
 */

const ACTIVATION_DURATION_MS = 770;
const SETTLE_DURATION_MS = 1350;

/**
 * 音频 → uniform 映射（本项目口径，Q5）。
 * 索引含义：3=speed 6=warp 7=ridgeAmt 8=sharp 10=sheen 14=exposure 21=contourDeform。
 * 刻意**不**直接调 radius(4) —— 避免整颗球机械地同步缩放；半径起伏改由弹簧层
 * （下方 #spring*）以 ±4% 的幅度施加。
 * 每项格式：[uniform 索引, 频段, 加性, 比例, 上限]
 *
 * ⚠ 关键：AUDIO_FLOW_STRENGTH 必须登记本项目所用预设的流场索引，否则音频响应
 * 完全不生效（上游只登记了 9/10/11/14/19/21；voiceWave=19 已在其中，
 * 但若换到 custom(chrome)=12 就必须补这一行）。
 */
const AUDIO_RULES: Array<[number, keyof AudioBands, number, number, number]> = [
  [6, 'mid', 1.45, 0, 8],      // warp      —— 局部鼓起/凹陷的主权重
  [7, 'mid', 0, 1.05, 1],      // ridgeAmt  —— 波纹脊线
  [8, 'mid', 0, 1.0, 8],       // sharp     —— 局部锐度
  [21, 'low', 0, 0.85, 1],     // contourDeform —— 轮廓扭曲
  [10, 'high', 0.22, 0, 2],    // sheen     —— 边缘高光
  [3, 'all', 0, 0.85, 5],      // speed     —— 整体流速
  [14, 'all', 0, 0.10, 4],     // exposure  —— 整体能量（压低：过亮会发白）
];
const AUDIO_FLOW_STRENGTH: Record<number, number> = {
  9: 0.8, 10: 0.65, 11: 0.65, 14: 0.75, 19: 1, 21: 0.7,   // 上游 6 个原生预设
  12: 0.85,                                               // 本项目 custom（chrome）
  22: 0.85,                                               // 本项目 chromatic（chromaticMetal，上游未登记）
};

/** 噪声门：任一带低于此值一律视为 0，避免静音时的细微抖动。
    取 0.07：FFT 均值在正常说话时约 0.2-0.5，门太高会把轻声也切掉（实测 0.12 偏钝）。 */
const GATE = 0.07;
/** 弹簧阻尼（Q7）：k=170 / c=13 → 约 420ms 稳定，过冲一次后回位 */
const SPRING_K = 170;
const SPRING_C = 13;
/** 强调脉冲（Q7）：响度陡增触发一次瞬态超调。
    包络修成快起慢落之后斜率明显变大，阈值相应上调，避免每顿一下都触发。 */
const EMPH_JUMP = 2.6;
const EMPH_FLOOR = 0.35;
/** 强调只加一点点亮度：之前 0.3 在响度峰值时会把球烧白 */
const EMPH_EXPOSURE = 0.16;
/**
 * 呼吸包络（原生形变版）：不再缩放整颗球，而是喂给上游自带的表面形变参数。
 * 整颗球等比放大会像"镜头推拉"，和球体的光照/边缘脱节；
 * 改成 warp / ridgeAmt / contourDeform 后，起伏发生在球面上，观感与上游一致。
 */
const CONTOUR_WARP = 0.55;      // warp 加性：局部鼓起/凹陷
const CONTOUR_RIDGE = 0.22;     // ridgeAmt 比例：波纹脊线
const CONTOUR_DEFORM = 0.32;    // contourDeform 加性：轮廓扭曲
const CONTOUR_ATTACK = 0.05;
const CONTOUR_RELEASE = 0.22;
/** 曝光总闸：音频/脉冲/弹簧叠加后，最多比当前形态基准亮 15% */
const EXPOSURE_CEIL = 1.15;

const clamp01 = (v: number): number => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

function srgbToLinear(v: number): number {
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}
function linearToSrgb(v: number): number {
  return v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055;
}
/** 颜色分量在 sRGB 空间插值（与上游一致，避免过渡中发灰） */
function mixSrgb(from: number, to: number, p: number): number {
  return linearToSrgb(srgbToLinear(from) + (srgbToLinear(to) - srgbToLinear(from)) * p);
}

/** 颜色区起点（uniform 40 之后是 24 组 RGBA） */
const COLORS_START = 40;
/** glowColor 是第 12 组颜色（colorA/B/C/D, highlight, shell×4, sheen, spec, canvas, glow） */
const GLOW_COLOR_INDEX = COLORS_START + 11 * 4;

/**
 * 取四段主色里饱和度最高的一支作为光晕色。
 *
 * 为什么不用预设自带的 glowColor：custom 预设导出的 glowColor 是灰蓝色
 * (0.455, 0.478, 0.482)，画出来的光晕像一圈灰雾，不像"球体发出的光"。
 * 而主色（colorA–colorD）才是这颗球真正的色相，用它染光晕，光才像从球里透出来的。
 */
function accentFromPalette(values: number[]): [number, number, number] {
  let best: [number, number, number] = [values[COLORS_START], values[COLORS_START + 1], values[COLORS_START + 2]];
  let bestSat = -1;
  for (let n = 0; n < 4; n++) {
    const i = COLORS_START + n * 4;
    const c: [number, number, number] = [values[i], values[i + 1], values[i + 2]];
    const sat = Math.max(...c) - Math.min(...c);
    // 太暗的颜色（接近黑）不适合做光，跳过
    if (sat > bestSat && Math.max(...c) > 0.25) { bestSat = sat; best = c; }
  }
  // 提到足够亮，否则在深色底上看不见
  const peak = Math.max(...best);
  if (peak > 0.001) {
    const k = Math.min(2.4, 0.95 / peak);
    best = [best[0] * k, best[1] * k, best[2] * k].map((v) => Math.min(1, v)) as [number, number, number];
  }
  return best;
}

/** 把光晕色写进某个形态种子（原地修改） */
function applyGlowColor(seed: number[], rgb: [number, number, number]): void {
  seed[GLOW_COLOR_INDEX] = rgb[0];
  seed[GLOW_COLOR_INDEX + 1] = rgb[1];
  seed[GLOW_COLOR_INDEX + 2] = rgb[2];
  seed[GLOW_COLOR_INDEX + 3] = 1;
}

/**
 * 由预设的 idle / thinking 两种种子派生 6 种形态。
 * 派生维度：流速、表面形变、曝光、边缘辉光、半径——都只是可用初值，
 * 想更精确请在上游编辑器里调好再替换 seeds.ts。
 */
function deriveSeeds(preset: PresetSeeds): Record<OrbVisualState, number[]> {
  const idle = preset.idle.slice();
  const thinking = preset.thinking.slice();
  const build = (
    speed: number, deform: number, exposure: number, glow: number, radiusScale = 1,
  ): number[] => {
    const s = idle.slice();
    const lerp = (i: number, t: number): void => {
      s[i] = idle[i] + (thinking[i] - idle[i]) * t;
    };
    s[3] = speed;      // speed
    lerp(6, deform);   // warp
    lerp(7, deform);   // ridgeAmt
    lerp(8, deform);   // sharp
    lerp(21, deform);  // contourDeform
    s[14] = exposure;  // exposure
    s[17] = glow;      // edgeGlow
    s[4] = idle[4] * radiusScale; // radius
    return s;
  };
  // 停靠态：用户反馈 idle 配色偏灰、发闷。这里直接采用「思考中」的整套配色，
  // 但 speed / 形变只取 45%–55%，避免在 120px 尺寸下显得躁动。
  const dock = idle.slice();
  for (let i = COLORS_START; i < dock.length; i++) dock[i] = thinking[i];
  const mix = (i: number, t: number): void => { dock[i] = idle[i] + (thinking[i] - idle[i]) * t; };
  mix(3, 0.55);   // speed
  mix(6, 0.50);   // warp
  mix(7, 0.50);   // ridgeAmt
  mix(8, 0.40);   // sharp
  mix(21, 0.40);  // contourDeform
  mix(14, 0.70);  // exposure
  mix(17, 0.60);  // edgeGlow

  // 所有形态统一用主色派生的光晕色：光晕才不会在切状态时突然变灰
  const accent = accentFromPalette(idle);
  const states: Record<OrbVisualState, number[]> = {
    idle,
    dock,
    // 活跃（展开、待机）：比 idle 稍快、稍亮，明确区别于「缩在右下角」
    active: build(3.2, 1.0, 0.92, 0.09, 0.9),
    // 思考/工具调用中：内部缓慢流动，速度约为活跃的一半，更内敛
    thinking: build(1.5, 0.75, 0.8, 0.07, 0.86),
    // 用户说话：球面活跃但克制（中央相对平静，语音律动主要交给音频带）
    listening: build(1.6, 0.42, 0.86, 0.05, 0.92),
    // AI 发声：更亮、更有能量、边缘更明显
    speaking: build(2.4, 0.68, 1.0, 0.12, 0.94),
  };
  for (const seed of Object.values(states)) applyGlowColor(seed, accent);
  return states;
}

export class LiquidOrb implements OrbRenderer {
  #canvas: HTMLCanvasElement;
  #device: GPUDevice | null = null;
  #context: GPUCanvasContext | null = null;
  #pipeline: GPURenderPipeline | null = null;
  #uniformBuffer: GPUBuffer | null = null;
  #bindGroup: GPUBindGroup | null = null;
  #format: GPUTextureFormat = 'bgra8unorm';

  #seeds: Record<OrbVisualState, number[]>;
  #values = new Float32Array(UNIFORM_FLOATS);
  #from = new Float32Array(UNIFORM_FLOATS);
  #target = new Float32Array(UNIFORM_FLOATS);
  #displayed = new Float32Array(UNIFORM_FLOATS);

  #state: OrbVisualState = 'idle';
  #transitionTo: OrbVisualState = 'idle';
  #transitionStart = 0;
  #transitionMs = 0;
  #motionPhase = 0;
  #lastFrame = 0;
  #raf = 0;
  #running = false;
  #destroyed = false;
  #maxPixelRatio = 2;

  #audioBands: AudioBands = { low: 0, mid: 0, high: 0, all: 0 };
  #prevAll = 0;
  #emph = 0;                     // 强调脉冲余量（0-1 衰减）
  #springPos = 0;                // 半径/曝光弹簧位移
  #springVel = 0;
  /** 轮廓呼吸包络（与音频同源，但更慢、更平滑，专门驱动半径） */
  #contour = 0;
  #overrides: UniformOverrides = {};

  constructor(canvas: HTMLCanvasElement, preset: string = DEFAULT_PRESET) {
    this.#canvas = canvas;
    const chosen = PRESET_SEEDS[preset] ?? PRESET_SEEDS[DEFAULT_PRESET];
    this.#seeds = deriveSeeds(chosen);
    this.#values.set(this.#seeds.idle);
    this.#from.set(this.#seeds.idle);
    this.#target.set(this.#seeds.idle);
    this.#displayed.set(this.#seeds.idle);
  }

  /** 球直径占画布的比例（由种子的 radius 决定：voiceWave=0.70 / custom=0.72） */
  get radiusFactor(): number {
    return this.#seeds.idle[4];
  }

  get state(): OrbVisualState {
    return this.#state;
  }

  /**
   * 当前叙事包络（调试 / 调参用）：
   * contour = 轮廓呼吸（0-1，乘 GAIN 后才是半径倍率），
   * emph = 强调脉冲余量，spring = 弹簧位移。
   */
  get envelope(): { contour: number; emph: number; spring: number } {
    return { contour: this.#contour, emph: this.#emph, spring: this.#springPos };
  }

  /** 只读快照：调参/验收用（曝光是否被压住、停靠态配色是否真的取了 thinking） */
  get uniformsSnapshot(): {
    exposure: number; radius: number; warp: number; ridge: number; deform: number;
    edgeGlow: number; colorA: [number, number, number]; glowColor: [number, number, number];
  } {
    const v = this.#values;
    return {
      exposure: v[14], radius: v[4], warp: v[6], ridge: v[7], deform: v[21],
      edgeGlow: v[17],
      colorA: [v[40], v[41], v[42]],
      // 颜色区从 40 开始，每组 RGBA；glowColor 是第 12 组 → 40 + 11*4
      glowColor: [v[84], v[85], v[86]],
    };
  }

  /** 初始化 WebGPU；返回 false 表示环境不支持（调用方负责降级提示） */
  async init(): Promise<boolean> {
    const gpu = (navigator as Navigator & { gpu?: GPU }).gpu;
    if (!gpu) return false;
    let device: GPUDevice;
    let context: GPUCanvasContext | null = null;
    try {
      const adapter = await gpu.requestAdapter();
      if (!adapter) return false;
      device = await adapter.requestDevice();
      context = this.#canvas.getContext('webgpu');
      if (!context) return false;
      this.#format = gpu.getPreferredCanvasFormat();
      context.configure({ device, format: this.#format, alphaMode: 'premultiplied' });
    } catch (err) {
      console.warn('[liquid-orb] WebGPU 初始化失败', err);
      return false;
    }
    this.#device = device;
    this.#context = context;

    device.lost.then((info) => {
      console.warn('[liquid-orb] WebGPU device lost:', info.message || info.reason);
      this.#stop();
    });
    device.addEventListener('uncapturederror', (event) => {
      console.error('[liquid-orb] WebGPU error:', (event as GPUUncapturedErrorEvent).error.message);
    });

    try {
      this.#buildPipelines();
    } catch (err) {
      console.warn('[liquid-orb] 管线创建失败', err);
      return false;
    }
    this.#start();
    return true;
  }

  #buildPipelines(): void {
    const device = this.#device;
    if (!device) return;
    const module = device.createShaderModule({ code: EFFECT_WGSL });
    const blendPremultiplied: GPUBlendState = {
      color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
      alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
    };
    this.#pipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: { module, entryPoint: 'vs_main' },
      fragment: { module, entryPoint: 'fs_main', targets: [{ format: this.#format, blend: blendPremultiplied }] },
      primitive: { topology: 'triangle-list' },
    });

    const values = new Float32Array(this.#displayed);
    this.#uniformBuffer = device.createBuffer({
      size: values.byteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.#bindGroup = device.createBindGroup({
      layout: this.#pipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: this.#uniformBuffer } }],
    });
  }

  /** 切换形态（active 用三次方缓入快速激活，其余 smoothstep） */
  setVisualState(next: OrbVisualState): void {
    if (next === this.#state || !this.#seeds[next]) return;
    const now = performance.now();
    this.#sampleTransition(now);
    this.#from.set(this.#displayed);
    this.#target.set(this.#seeds[next]);
    this.#transitionTo = next;
    this.#transitionStart = now;
    this.#transitionMs = next === 'active' ? ACTIVATION_DURATION_MS : SETTLE_DURATION_MS;
    this.#state = next;
  }

  /** 兼容写法 */
  setState(next: OrbVisualState): void {
    this.setVisualState(next);
  }

  /** 音频频段（0-1，已由调用方平滑）；传空对象停止 */
  setAudioBands(bands?: Partial<AudioBands>): void {
    const g = (v: number | undefined): number => {
      const x = clamp01(v ?? 0);
      return x < GATE ? 0 : x;
    };
    this.#audioBands = {
      low: g(bands?.low), mid: g(bands?.mid), high: g(bands?.high), all: g(bands?.all),
    };
  }

  /** 每帧覆写（呼吸包络、面板参数） */
  setOverrides(o: UniformOverrides): void {
    this.#overrides = o;
  }

  setMaxPixelRatio(r: number): void {
    this.#maxPixelRatio = Math.max(1, Math.min(3, r));
  }

  #sampleTransition(now: number): void {
    if (this.#transitionMs <= 0) return;
    const raw = Math.min(1, Math.max(0, (now - this.#transitionStart) / this.#transitionMs));
    const p = this.#transitionTo === 'thinking' ? 1 - (1 - raw) ** 3 : raw * raw * (3 - 2 * raw);
    for (let i = 3; i < this.#displayed.length; i++) {
      const isColor = i >= 40 && (i - 40) % 4 < 3;
      this.#displayed[i] = isColor
        ? mixSrgb(this.#from[i], this.#target[i], p)
        : this.#from[i] + (this.#target[i] - this.#from[i]) * p;
    }
  }

  #applyAudio(values: Float32Array): void {
    const strength = AUDIO_FLOW_STRENGTH[Math.round(values[15])] ?? 0;
    if (!strength) return;
    for (const [index, band, additive, proportional, ceiling] of AUDIO_RULES) {
      const level = this.#audioBands[band] * strength;
      if (!level) continue;
      const base = values[index];
      values[index] = Math.min(ceiling, Math.max(base, base * (1 + proportional * level) + additive * level));
    }
  }

  /**
   * 柔性膜叙事层（Q7）：重音脉冲 + 弹簧回弹。
   * 只作用在 radius(4) 与 exposure(14) 上，幅度受控（半径 ±6% 上限），
   * 因此不会出现「整颗球机械同步缩放」。
   */
  #applyNarrative(values: Float32Array, dt: number): void {
    const all = this.#audioBands.all;
    // 强调：响度陡增且越过阈值 → 充一次能量
    const jump = dt > 0 ? (all - this.#prevAll) / dt : 0;
    if (jump > EMPH_JUMP && all > EMPH_FLOOR) this.#emph = Math.min(1, this.#emph + 0.9);
    this.#prevAll = all;
    this.#emph = Math.max(0, this.#emph - dt * 2.2);        // ~450ms 衰减

    // 呼吸包络：快起慢落，单独一层，不经过弹簧，避免叠加后抖
    const cTau = all > this.#contour ? CONTOUR_ATTACK : CONTOUR_RELEASE;
    if (dt > 0) {
      const k = 1 - Math.exp(-dt / cTau);
      this.#contour += (all - this.#contour) * k;
    }
    const contour = Math.min(1, Math.max(0, this.#contour));

    // 原生形变（推荐方案 A）：起伏发生在球面上，而不是整颗球被缩放。
    // 这三个 uniform 正是上游自己用来表达「有生命感的膜」的参数，
    // 因此形变和光照、边缘高光天然是一套。
    values[6] += CONTOUR_WARP * contour;                                   // warp
    values[7] = Math.min(1, values[7] * (1 + CONTOUR_RIDGE * contour));    // ridgeAmt
    values[21] = Math.min(1, values[21] + CONTOUR_DEFORM * contour);       // contourDeform

    // 弹簧：目标随响度，起音快、释放靠阻尼自然衰减
    const target = all * 0.5 + this.#emph;
    if (dt > 0) {
      this.#springVel += (target - this.#springPos) * SPRING_K * dt - this.#springVel * SPRING_C * dt;
      this.#springPos += this.#springVel * dt;
      this.#springPos = Math.max(-0.06, Math.min(0.06, this.#springPos));
    }
    // 半径只保留弹簧的余量（约 ±1.5%）：不做整体胀缩，避免和待机呼吸打架
    values[4] *= 1 + this.#springPos * 0.25;
    values[14] *= 1 + this.#springPos * 0.10 + this.#emph * EMPH_EXPOSURE;
  }

  #applyOverrides(values: Float32Array): void {
    const o = this.#overrides;
    if (o.byIndex) {
      for (const key of Object.keys(o.byIndex)) {
        values[Number(key)] = o.byIndex[Number(key)] as number;
      }
    }
    if (o.radiusScale !== undefined) values[4] *= o.radiusScale;
    if (o.speedScale !== undefined) values[3] *= o.speedScale;
    if (o.exposureScale !== undefined) values[14] *= o.exposureScale;
    if (o.edgeGlow !== undefined) values[17] = o.edgeGlow;
  }

  #start(): void {
    if (this.#running || this.#destroyed) return;
    this.#running = true;
    this.#lastFrame = 0;
    this.#raf = requestAnimationFrame(this.#frame);
  }

  #stop(): void {
    this.#running = false;
    cancelAnimationFrame(this.#raf);
  }

  #frame = (now: number): void => {
    if (this.#destroyed) return;
    this.#raf = requestAnimationFrame(this.#frame);
    const device = this.#device;
    const context = this.#context;
    if (!device || !context) return;

    // 画布尺寸跟随 CSS（组件固定单尺寸，这里只处理 DPR 与 resize）
    const dpr = Math.min(window.devicePixelRatio || 1, this.#maxPixelRatio);
    const width = Math.max(1, Math.floor(this.#canvas.clientWidth * dpr));
    const height = Math.max(1, Math.floor(this.#canvas.clientHeight * dpr));
    if (this.#canvas.width !== width || this.#canvas.height !== height) {
      this.#canvas.width = width;
      this.#canvas.height = height;
    }

    const dt = this.#lastFrame === 0 ? 0 : Math.min(0.1, Math.max(0, (now - this.#lastFrame) / 1000));
    this.#lastFrame = now;

    this.#sampleTransition(now);
    const values = this.#values;
    values.set(this.#displayed);
    const baseExposure = this.#displayed[14];
    this.#applyAudio(values);
    this.#applyNarrative(values, dt);
    this.#applyOverrides(values);
    // 曝光总闸：无论音频、强调脉冲、弹簧怎么叠加，都不让球体发白。
    // 上限是「当前形态基准」的 1.15 倍，因此切形态时依然保留各自的明暗关系。
    if (baseExposure > 0.001) values[14] = Math.min(values[14], baseExposure * EXPOSURE_CEIL);

    const speed = Math.max(values[3], 0);
    this.#motionPhase += dt * speed;
    values[0] = width;
    values[1] = height;
    values[2] = this.#motionPhase / Math.max(speed, 0.001);
    device.queue.writeBuffer(this.#uniformBuffer!, 0, values);

    try {
      const encoder = device.createCommandEncoder();
      const pass = encoder.beginRenderPass({
        colorAttachments: [{ view: context.getCurrentTexture().createView(), clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: 'clear', storeOp: 'store' }],
      });
      pass.setPipeline(this.#pipeline!);
      pass.setBindGroup(0, this.#bindGroup!);
      pass.draw(3);
      pass.end();
      device.queue.submit([encoder.finish()]);
    } catch (err) {
      console.error('[liquid-orb] 渲染出错', err);
      this.#stop();
    }
  };

  destroy(): void {
    this.#destroyed = true;
    this.#stop();
    this.#uniformBuffer?.destroy();
    this.#device?.destroy();
    this.#device = null;
    this.#context = null;
  }
}
