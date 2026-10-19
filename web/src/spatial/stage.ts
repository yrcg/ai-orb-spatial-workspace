import { normalizeScene } from './spec';
import { planLayout } from './orchestrator';
import { capabilitiesOf, createFallbackView, getRenderer, type SurfaceView } from './renderers';
import { resolveSurfaceData } from './sources';
import type {
  Insets,
  LayoutPlan,
  Rect,
  SceneSpec,
  SurfaceSpec,
} from './types';

/**
 * <ai-spatial-stage> —— AI 编排的空间舞台。
 *
 * 它只做三件事：
 * 1. 接场景（SceneSpec）→ 调 SLO → 应用矩形；
 * 2. 管理 surface 的挂载/更新/卸载，并做 FLIP 过渡；
 * 3. 把「球应该在哪、多大、对话区在哪」通过事件交给宿主 / orb 组件。
 *
 * 不负责：内容生成、模型调用、语音。
 */

const STYLES = `
:host {
  position: fixed;
  inset: 0;
  /* 层级必须低于球(4)与对话层(6)：舞台是"桌面"，不是浮在球上面的 HUD */
  z-index: 2;
  pointer-events: none;
  --sp-text: rgba(22, 32, 48, 0.9);
  --sp-dim: rgba(22, 32, 48, 0.56);
  --sp-faint: rgba(22, 32, 48, 0.36);
  --sp-line: rgba(22, 32, 48, 0.08);
  --sp-panel: rgba(255, 255, 255, 0.5);
  --sp-panel-solid: #ffffff;
  --sp-grid: rgba(22, 32, 48, 0.06);
  --sp-accent: #2f6fd0;
  --sp-series-1: #2f6fd0;
  --sp-series-2: #4fa3a0;
  --sp-series-3: #c9a04a;
  --sp-series-4: #9a7bd0;
  --sp-feather: 26px;
  font-family: -apple-system, 'Segoe UI', 'Microsoft YaHei', 'PingFang SC', sans-serif;
}
:host([data-theme='dark']) {
  --sp-text: rgba(238, 242, 248, 0.92);
  --sp-dim: rgba(232, 235, 240, 0.6);
  --sp-faint: rgba(232, 235, 240, 0.38);
  --sp-line: rgba(255, 255, 255, 0.08);
  --sp-panel: rgba(18, 22, 28, 0.42);
  --sp-panel-solid: #12161c;
  --sp-grid: rgba(255, 255, 255, 0.06);
  --sp-accent: #8fd8ff;
  --sp-series-1: #8fd8ff;
  --sp-series-2: #6fd8c0;
  --sp-series-3: #e9c46a;
  --sp-series-4: #c3a6f5;
}

/* ---------------------------------------------------------------
   无边界浮层：没有卡片底、没有描边、没有投影。
   边缘用 mask 羽化，让内容像从模糊背景里浮出来，而不是贴在上面。
   只有文字、数据和一个极淡的径向光晕。
   --------------------------------------------------------------- */
.surface {
  position: absolute;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  padding: 26px 30px 28px;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  color: var(--sp-text);
  pointer-events: auto;
  overflow: hidden;
  contain: layout style;
  will-change: transform, opacity;
  transform-origin: 50% 50%;
  -webkit-mask-image:
    linear-gradient(to right, transparent 0, #000 var(--sp-feather), #000 calc(100% - var(--sp-feather)), transparent 100%),
    linear-gradient(to bottom, transparent 0, #000 var(--sp-feather), #000 calc(100% - var(--sp-feather)), transparent 100%);
  -webkit-mask-composite: source-in;
  mask-image:
    linear-gradient(to right, transparent 0, #000 var(--sp-feather), #000 calc(100% - var(--sp-feather)), transparent 100%),
    linear-gradient(to bottom, transparent 0, #000 var(--sp-feather), #000 calc(100% - var(--sp-feather)), transparent 100%);
  mask-composite: intersect;
}
/* 极淡的色雾：左上和右下各一点，制造"有体积"的错觉 */
.surface::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  background:
    radial-gradient(62% 58% at 22% 8%, color-mix(in srgb, var(--sp-accent) 8%, transparent), transparent 72%),
    radial-gradient(46% 44% at 92% 102%, color-mix(in srgb, var(--sp-accent) 5%, transparent), transparent 70%);
}
.surface > * { position: relative; z-index: 1; }

/* 空间表面里不要可见滚动条：内容该"浮"着，不是"装"在框里 */
.surface ::-webkit-scrollbar { width: 0; height: 0; }
.surface * { scrollbar-width: none; }
.surface[data-entering='1'] { opacity: 0; transform: translateY(10px); }
.surface[data-leaving='1'] { opacity: 0; pointer-events: none; }
.surface[data-role='focus'] { padding: 30px 36px 32px; }
:host([data-mode='immersive']) .surface[data-role='focus'] {
  padding: 34px 44px 36px;
}
:host([data-mode='stage']) .surface[data-role='focus'] {
  padding: 26px 40px 30px;
}

/* 标题：轻声细语，不抢数据 */
.head {
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex: 0 0 auto;
  margin-bottom: 16px;
  min-width: 0;
}
.head .title {
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.12em;
  color: var(--sp-dim);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}
.head .subtitle {
  font-size: 11px;
  color: var(--sp-faint);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}
.head .why {
  margin-left: auto;
  flex: 0 0 auto;
  font-size: 10px;
  letter-spacing: 0.14em;
  color: var(--sp-faint);
  opacity: 0.8;
}
.body {
  flex: 1 1 auto;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* ---- 基础渲染器 ---- */
.sp-empty {
  display: grid;
  place-items: center;
  height: 100%;
  font-size: 12px;
  color: var(--sp-faint);
  text-align: center;
  padding: 12px;
}

/* 表格：只留极淡的行分隔，表头不铺底 */
.sp-table { overflow: auto; flex: 1 1 auto; min-height: 0; }
.sp-table table { width: 100%; border-collapse: collapse; font-size: 13px; }
.sp-table th {
  position: sticky; top: 0; z-index: 1;
  text-align: left; font-weight: 400; color: var(--sp-faint);
  font-size: 10.5px; letter-spacing: 0.14em;
  padding: 0 10px 10px;
  /* 表头只靠一条细线区分，不铺一条白色带子（那会让"无边界"露馅） */
  background: transparent;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  border-bottom: 1px solid var(--sp-line);
  white-space: nowrap;
}
.sp-table td {
  padding: 11px 10px; color: var(--sp-dim);
  border-bottom: 1px solid var(--sp-grid);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 260px;
}
.sp-table td:first-child {
  color: var(--sp-text);
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em;
}
.sp-table tr:last-child td { border-bottom: none; }
.sp-table tbody tr { transition: background-color 160ms ease; }
.sp-table tbody tr:hover { background: color-mix(in srgb, var(--sp-accent) 4%, transparent); }
.sp-badge {
  display: inline-block; padding: 1px 8px; border-radius: 999px; font-size: 11px;
  background: var(--sp-grid); color: var(--sp-dim);
}
.sp-badge[data-tone='ok'] { background: rgba(47, 158, 107, 0.1); color: #2f9e6b; }
.sp-badge[data-tone='warn'] { background: rgba(192, 122, 42, 0.12); color: #c07a2a; }
.sp-badge[data-tone='bad'] { background: rgba(198, 76, 84, 0.12); color: #c64c54; }
.sp-badge[data-tone='idle'] { background: var(--sp-grid); color: var(--sp-faint); }

/* 指标：没有卡片框，只有大数字和细标签 */
.sp-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(96px, 1fr));
  gap: 18px 20px;
  overflow: auto;
  flex: 1 1 auto;
  min-height: 0;
  align-content: start;
}
.sp-card { min-width: 0; padding: 0; }
.sp-card-label {
  font-size: 10.5px; letter-spacing: 0.12em; color: var(--sp-faint);
}
.sp-card-value {
  font-size: 26px; font-weight: 500; line-height: 1.1;
  margin-top: 7px; color: var(--sp-text);
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.02em;
}
.sp-card-delta { font-size: 11.5px; margin-top: 7px; color: var(--sp-faint); }
.sp-card-delta[data-tone='up'] { color: #2f9e6b; }
.sp-card-delta[data-tone='down'] { color: #c64c54; }
.sp-card-hint { font-size: 11px; color: var(--sp-faint); margin-top: 4px; }

.sp-text { overflow: auto; flex: 1 1 auto; min-height: 0; font-size: 13.5px; line-height: 1.8; color: var(--sp-dim); }
.sp-text p { margin: 0 0 14px; }
.sp-text p:last-child { margin-bottom: 0; }
.sp-text ul { margin: 0; padding-left: 16px; }
.sp-text li { margin-bottom: 8px; }
.sp-text li::marker { color: var(--sp-accent); }

/* 图表：无网格、无轴框，只留一条基线和一个重点标注 */
.sp-chart { display: flex; flex-direction: column; gap: 8px; flex: 1 1 auto; min-height: 0; }
.sp-svg { overflow: visible; flex: 1 1 auto; min-height: 0; }
.sp-legend { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; font-size: 10.5px; letter-spacing: 0.06em; color: var(--sp-faint); }
.sp-legend-item { display: inline-flex; align-items: center; gap: 5px; }
.sp-legend-item i { width: 5px; height: 5px; border-radius: 50%; display: inline-block; }
.sp-unit { margin-right: auto; }

/* 3D 场景：没有容器框，网格本身就是空间 */
.sp-scene3d {
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
  border-radius: 0;
  overflow: hidden;
  background:
    radial-gradient(58% 54% at 50% 46%, color-mix(in srgb, var(--sp-accent) 9%, transparent), transparent 70%);
}
.sp-scene3d-svg { display: block; width: 100%; height: 100%; }
.sp-scene3d-caption {
  /* 左下角停靠球，说明文字放右下，避免压住球 */
  position: absolute; right: 2px; bottom: 2px;
  font-size: 10.5px; letter-spacing: 0.12em; color: var(--sp-faint);
}
.sp-scene3d-layers {
  position: absolute; right: 2px; top: 0;
  display: flex; flex-direction: column; gap: 6px; align-items: flex-end;
}
.sp-scene3d-layers span {
  font-size: 10px; letter-spacing: 0.1em;
  padding: 0; color: var(--sp-faint);
}

.sp-html { position: relative; flex: 1 1 auto; min-height: 0; }
.sp-html iframe {
  width: 100%; height: 100%; border: 0; border-radius: 12px;
  background: transparent;
}
.sp-html-badge {
  position: absolute; right: 0; top: -2px; z-index: 2;
  font-size: 9.5px; letter-spacing: 0.12em;
  padding: 0; color: var(--sp-faint);
}

.sp-fallback {
  display: grid; place-items: center; height: 100%;
  font-size: 12px; color: var(--sp-faint);
}

/* 折叠 chip：同样无边框，只有一层很淡的雾 */
.chips {
  position: absolute;
  left: 132px;
  bottom: 24px;
  display: flex;
  gap: 10px;
  max-width: calc(100vw - 220px);
  overflow-x: auto;
  pointer-events: none;
}
.chips::-webkit-scrollbar { width: 0; height: 0; }
.chip {
  pointer-events: auto;
  display: inline-flex; align-items: center; gap: 7px;
  font: inherit; font-size: 11px; letter-spacing: 0.08em;
  padding: 5px 12px; border-radius: 999px;
  border: 0;
  background: color-mix(in srgb, var(--sp-panel-solid) 36%, transparent);
  color: var(--sp-dim);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  cursor: pointer;
  white-space: nowrap;
  animation: sp-chip-in 240ms ease both;
}
.chip:hover { color: var(--sp-text); }
.chip i { width: 4px; height: 4px; border-radius: 50%; background: var(--sp-accent); opacity: 0.7; }
@keyframes sp-chip-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }

@media (prefers-reduced-motion: reduce) {
  .surface { transition: opacity 120ms linear !important; }
  .sp-scene3d-core { animation: none; }
}
`;

const TEMPLATE = `
<style>${STYLES}</style>
<div class="planes"></div>
<div class="chips" role="list" aria-label="未展开的内容"></div>
`;

interface SurfaceEntry {
  spec: SurfaceSpec;
  el: HTMLElement;
  body: HTMLElement;
  view: SurfaceView;
  /** 与当前渲染器能力对应的 key，kind 变化时重建 */
  rendererKind: string;
  lastRect: Rect | null;
  dataAbort: AbortController | null;
  ttlTimer: number;
  entering: boolean;
}

export interface SpatialStageEventDetail {
  scene: SceneSpec;
  plan: LayoutPlan;
}

export class SpatialStage extends HTMLElement {
  #root: ShadowRoot;
  #planes: HTMLElement;
  #chips: HTMLElement;
  #surfaces = new Map<string, SurfaceEntry>();
  #scene: SceneSpec = normalizeScene({ rev: 0, mode: 'companion', surfaces: [] });
  #plan: LayoutPlan | null = null;
  #insets: Insets = { top: 0, right: 0, bottom: 0, left: 0 };
  #enabled = false;
  #theme: 'light' | 'dark' = 'light';
  #resizeTimer = 0;
  #reduceMotion = false;

  constructor() {
    super();
    this.#root = this.attachShadow({ mode: 'open' });
    this.#root.innerHTML = TEMPLATE;
    this.#planes = this.#root.querySelector('.planes') as HTMLElement;
    this.#chips = this.#root.querySelector('.chips') as HTMLElement;
    this.#reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  }

  connectedCallback(): void {
    window.addEventListener('resize', this.#onResize);
    this.#applyTheme(this.#theme);
    if (this.#enabled) this.refresh();
  }

  disconnectedCallback(): void {
    window.removeEventListener('resize', this.#onResize);
    for (const entry of this.#surfaces.values()) {
      entry.dataAbort?.abort();
      window.clearTimeout(entry.ttlTimer);
      entry.view.dispose();
      entry.el.remove();
    }
    this.#surfaces.clear();
  }

  get scene(): SceneSpec { return this.#scene; }
  get plan(): LayoutPlan | null { return this.#plan; }
  get enabled(): boolean { return this.#enabled; }

  /** 安全区（给宿主的顶栏/底栏让位） */
  setInsets(insets: Partial<Insets>): void {
    this.#insets = {
      top: Math.max(0, insets.top ?? this.#insets.top),
      right: Math.max(0, insets.right ?? this.#insets.right),
      bottom: Math.max(0, insets.bottom ?? this.#insets.bottom),
      left: Math.max(0, insets.left ?? this.#insets.left),
    };
    this.refresh();
  }

  setTheme(theme: 'light' | 'dark'): void {
    this.#theme = theme;
    this.#applyTheme(theme);
  }

  /** 总开关：关闭时舞台不占位、不拦截指针，也不改球的位置 */
  setEnabled(on: boolean): void {
    if (this.#enabled === on) return;
    this.#enabled = on;
    this.#root.host.toggleAttribute('data-enabled', on);
    if (!on) this.#clearAll();
    else this.refresh();
  }

  /**
   * 应用场景。这是唯一入口：
   * - 先规划，再 diff（增/删/改），最后统一提交样式；
   * - 同一轮里批量写入，避免多次强制布局。
   */
  setScene(input: unknown): LayoutPlan {
    const next = normalizeScene(input, this.#scene.rev);
    this.#scene = next;
    return this.refresh();
  }

  /** 布局重算（视口/安全区变化时也可以直接调用） */
  refresh(): LayoutPlan {
    const plan = planLayout({
      viewport: {
        w: window.innerWidth,
        h: window.innerHeight,
        dpr: Math.min(window.devicePixelRatio || 1, 2.5),
      },
      insets: this.#insets,
      scene: this.#scene,
      capabilities: capabilitiesOf,
      reducedMotion: this.#reduceMotion,
    });
    this.#plan = plan;
    this.dataset.mode = plan.mode;
    this.#syncSurfaces(plan);
    this.dispatchEvent(new CustomEvent<SpatialStageEventDetail>('spatial:layout', {
      detail: { scene: this.#scene, plan },
      bubbles: true,
      composed: true,
    }));
    return plan;
  }

  /** 让某个 surface 进入 focus（点击 chip / 卡片时用） */
  focusSurface(id: string): void {
    if (!this.#scene.surfaces.some((s) => s.id === id)) return;
    this.setScene({ ...this.#scene, focusId: id, rev: this.#scene.rev + 1 });
  }

  #applyTheme(theme: 'light' | 'dark'): void {
    this.dataset.theme = theme;
  }

  #onResize = (): void => {
    if (!this.#enabled) return;
    window.clearTimeout(this.#resizeTimer);
    this.#resizeTimer = window.setTimeout(() => this.refresh(), 90);
  };

  /**
   * 同步 surface 集合。
   * 关键：先测量旧位置（oldRects），再写新位置，最后做 FLIP。
   */
  #syncSurfaces(plan: LayoutPlan): void {
    if (!this.#enabled) return;

    const wanted = new Map(this.#scene.surfaces.map((s) => [s.id, s]));
    const oldRects = new Map<string, Rect>();
    for (const [id, entry] of this.#surfaces) {
      const box = entry.el.getBoundingClientRect();
      oldRects.set(id, { x: box.left, y: box.top, w: box.width, h: box.height });
    }

    // 1) 移除不再出现的 surface
    for (const [id, entry] of this.#surfaces) {
      if (wanted.has(id)) continue;
      this.#retire(id, entry, plan.transitionMs);
    }

    // 2) 新增/更新
    for (const spec of this.#scene.surfaces) {
      const rect = plan.rects[spec.id];
      if (!rect) {
        const entry = this.#surfaces.get(spec.id);
        if (entry) this.#retire(spec.id, entry, plan.transitionMs);
        continue;
      }
      let entry = this.#surfaces.get(spec.id);
      if (!entry) {
        entry = this.#createEntry(spec);
        this.#surfaces.set(spec.id, entry);
      }
      this.#updateEntry(entry, spec, rect, oldRects.get(spec.id) ?? null, plan.transitionMs);
    }

    // 3) 折叠 chip
    this.#renderChips(plan);
  }

  #createEntry(spec: SurfaceSpec): SurfaceEntry {
    const el = document.createElement('section');
    el.className = 'surface';
    el.dataset.id = spec.id;
    el.dataset.kind = spec.kind;
    el.dataset.role = spec.role ?? 'support';
    el.setAttribute('part', `surface surface-${spec.id}`);
    el.setAttribute('role', 'region');
    el.setAttribute('aria-label', spec.title || spec.kind);

    const head = document.createElement('div');
    head.className = 'head';
    const title = document.createElement('div');
    title.className = 'title';
    const subtitle = document.createElement('div');
    subtitle.className = 'subtitle';
    head.append(title, subtitle);

    const body = document.createElement('div');
    body.className = 'body';
    el.append(head, body);
    this.#planes.append(el);

    // 先按目标尺寸建视图，再挂载，避免 0 宽时 SVG 画错
    const renderer = getRenderer(spec.kind);
    const view = renderer ? renderer.create() : createFallbackView(spec.kind);
    body.append(view.el);

    const entry: SurfaceEntry = {
      spec,
      el,
      body,
      view,
      rendererKind: spec.kind,
      lastRect: null,
      dataAbort: null,
      ttlTimer: 0,
      entering: true,
    };

    el.dataset.entering = '1';
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.dataset.entering = '0';
        entry.entering = false;
      });
    });
    return entry;
  }

  #updateEntry(
    entry: SurfaceEntry,
    spec: SurfaceSpec,
    rect: Rect,
    oldRect: Rect | null,
    transitionMs: number,
  ): void {
    // kind 变了 → 重建视图
    if (entry.rendererKind !== spec.kind) {
      entry.view.dispose();
      const renderer = getRenderer(spec.kind);
      entry.view = renderer ? renderer.create() : createFallbackView(spec.kind);
      entry.body.replaceChildren(entry.view.el);
      entry.rendererKind = spec.kind;
    }
    entry.spec = spec;
    entry.el.dataset.role = spec.role ?? 'support';
    entry.el.dataset.kind = spec.kind;

    const head = entry.el.querySelector('.head') as HTMLElement;
    const title = head.querySelector('.title') as HTMLElement;
    const subtitle = head.querySelector('.subtitle') as HTMLElement;
    const showHead = Boolean(spec.title || spec.subtitle || spec.why);
    head.hidden = !showHead;
    title.textContent = spec.title ?? '';
    subtitle.textContent = spec.subtitle ?? '';
    title.hidden = !spec.title;
    subtitle.hidden = !spec.subtitle;
    let why = head.querySelector('.why') as HTMLElement | null;
    if (spec.why) {
      if (!why) {
        why = document.createElement('span');
        why.className = 'why';
        head.append(why);
      }
      why.textContent = spec.why;
    } else if (why) {
      why.remove();
    }

    // FLIP：记录旧位置 → 立即改布局 → 用 transform 反向位移 → 播回 0
    const isFirst = oldRect == null;
    const deltaX = oldRect ? oldRect.x - rect.x : 0;
    const deltaY = oldRect ? oldRect.y - rect.y : 0;
    const scaleX = oldRect && oldRect.w > 0 ? oldRect.w / Math.max(1, rect.w) : 1;
    const scaleY = oldRect && oldRect.h > 0 ? oldRect.h / Math.max(1, rect.h) : 1;

    entry.el.style.width = `${rect.w}px`;
    entry.el.style.height = `${rect.h}px`;
    entry.el.style.left = `${rect.x}px`;
    entry.el.style.top = `${rect.y}px`;

    if (!isFirst && transitionMs > 0 && (Math.abs(deltaX) > 0.5 || Math.abs(deltaY) > 0.5
      || Math.abs(scaleX - 1) > 0.004 || Math.abs(scaleY - 1) > 0.004)) {
      entry.el.style.transition = 'none';
      entry.el.style.transform = `translate(${deltaX.toFixed(1)}px, ${deltaY.toFixed(1)}px) scale(${scaleX.toFixed(4)}, ${scaleY.toFixed(4)})`;
      // 强制读一次布局，确保 transform 生效后再切换到 0
      void entry.el.offsetWidth;
      entry.el.style.transition = `transform ${transitionMs}ms cubic-bezier(0.2, 0, 0, 1)`;
      entry.el.style.transform = 'translate(0, 0) scale(1, 1)';
    } else {
      entry.el.style.transition = '';
      entry.el.style.transform = '';
    }

    entry.lastRect = rect;

    // 内容解析（异步来源）
    this.#resolveData(entry, spec);
    // TTL
    window.clearTimeout(entry.ttlTimer);
    if (spec.permissions?.ttlMs && spec.permissions.ttlMs > 0) {
      entry.ttlTimer = window.setTimeout(() => { this.#collapseLocal(spec.id); }, spec.permissions.ttlMs);
    }
    // 已在场的内容立即按尺寸重绘（图表对尺寸敏感）。
    // 注意要传"内容盒子"而不是 surface 外框：外框含 padding 和标题，
    // 直接传外框会让 SVG 比容器宽，右侧坐标轴被裁掉。
    entry.view.update(spec, this.#contentSize(entry));
  }

  #resolveData(entry: SurfaceEntry, spec: SurfaceSpec): void {
    entry.dataAbort?.abort();
    if (!spec.source || spec.source === 'inline') return;
    const abort = new AbortController();
    entry.dataAbort = abort;
    void resolveSurfaceData(spec, abort.signal).then((data) => {
      if (abort.signal.aborted) return;
      // 数据回来后只更新内容，不动布局 → 避免"内容晚到导致整页跳"
      const resolved: SurfaceSpec = { ...spec, data };
      entry.spec = resolved;
      entry.view.update(resolved, this.#contentSize(entry));
    }).catch(() => { /* 取消或失败都保持占位，不打断语音 */ });
  }

  /** 内容区真实尺寸：一次读取，调用点已在本轮写入之后 */
  #contentSize(entry: SurfaceEntry): { w: number; h: number } {
    const w = entry.body.clientWidth;
    const h = entry.body.clientHeight;
    if (w > 0 && h > 0) return { w, h };
    const rect = entry.lastRect;
    return rect ? { w: Math.max(1, rect.w - 72), h: Math.max(1, rect.h - 80) } : { w: 320, h: 200 };
  }

  #retire(id: string, entry: SurfaceEntry, transitionMs: number): void {
    this.#surfaces.delete(id);
    entry.dataAbort?.abort();
    window.clearTimeout(entry.ttlTimer);
    if (transitionMs > 0) {
      entry.el.dataset.leaving = '1';
      window.setTimeout(() => {
        entry.view.dispose();
        entry.el.remove();
      }, transitionMs);
    } else {
      entry.view.dispose();
      entry.el.remove();
    }
  }

  #clearAll(): void {
    for (const [id, entry] of this.#surfaces) {
      this.#surfaces.delete(id);
      entry.dataAbort?.abort();
      window.clearTimeout(entry.ttlTimer);
      entry.view.dispose();
      entry.el.remove();
    }
    this.#chips.replaceChildren();
  }

  /** 空间不足时折叠成 chip：内容仍然可达，而不是被静默丢弃 */
  #renderChips(plan: LayoutPlan): void {
    const collapsed = plan.collapsed;
    this.#chips.replaceChildren();
    this.#chips.hidden = collapsed.length === 0;
    for (const id of collapsed) {
      const spec = this.#scene.surfaces.find((s) => s.id === id);
      if (!spec) continue;
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip';
      chip.setAttribute('role', 'listitem');
      chip.title = spec.why || spec.title || spec.kind;
      const dot = document.createElement('i');
      chip.append(dot, document.createTextNode(spec.title || spec.kind));
      chip.addEventListener('click', () => {
        // 折叠态点击 = 把该 surface 提为 focus，SLO 会在下一轮为它腾位置
        this.focusSurface(id);
      });
      this.#chips.append(chip);
    }
  }

  /** 用户直接收起某块内容（本地覆盖，不写回场景） */
  #collapseLocal(id: string): void {
    const spec = this.#scene.surfaces.find((s) => s.id === id);
    if (!spec) return;
    const next: SceneSpec = {
      ...this.#scene,
      rev: this.#scene.rev + 1,
      surfaces: this.#scene.surfaces.filter((s) => s.id !== id),
      focusId: this.#scene.focusId === id ? null : this.#scene.focusId,
    };
    this.setScene(next);
    this.dispatchEvent(new CustomEvent('spatial:dismiss', {
      detail: { id }, bubbles: true, composed: true,
    }));
  }

}

if (!customElements.get('ai-spatial-stage')) {
  customElements.define('ai-spatial-stage', SpatialStage);
}
