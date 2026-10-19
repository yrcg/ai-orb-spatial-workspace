import type { SurfaceSpec } from '../types';
import type { RendererAdapter, SurfaceView } from './base';

function asRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

function svg<K extends keyof SVGElementTagNameMap>(tag: K): SVGElementTagNameMap[K] {
  return document.createElementNS(SVG_NS, tag);
}

/** 稳定的伪随机：同一份数据每次渲染完全一致，方便截图对比 */
function hash(n: number): number {
  let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967295;
}

// ───────────────────────────── scene3d ─────────────────────────────

/**
 * 3D 场景挂载点（P0 占位实现：等距园区视图）。
 *
 * 真正接入 three.js 时不需要改协议：实现一个新的 RendererAdapter，
 * 在 create() 里挂 WebGPU/WebGL 上下文，update() 里接收场景描述即可。
 * 模型始终只传「相机/图层/数据/样式」，不传可执行代码。
 *
 * 这里用 SVG 画等距方块而不是放一个 wireframe 立方体，是因为后者在
 * 全屏时会显得空。等距视图有体积、有纵深，也天然贴合"漂浮"的调性。
 */
class Scene3DView implements SurfaceView {
  readonly el: HTMLElement;
  #svg: SVGSVGElement;
  #caption: HTMLElement;
  #layers: HTMLElement;
  #signature = '';

  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'sp-scene3d';
    this.#svg = svg('svg');
    this.#svg.classList.add('sp-scene3d-svg');
    this.#caption = document.createElement('div');
    this.#caption.className = 'sp-scene3d-caption';
    this.#layers = document.createElement('div');
    this.#layers.className = 'sp-scene3d-layers';
    this.el.append(this.#svg, this.#caption, this.#layers);
  }

  update(spec: SurfaceSpec, size: { w: number; h: number }): void {
    const raw = asRecord(spec.data);
    const signature = `${size.w}x${size.h}:${JSON.stringify(raw ?? null)}`;
    if (signature === this.#signature) return;
    this.#signature = signature;

    const caption = typeof raw?.caption === 'string' ? raw.caption : spec.title ?? '3D 场景';
    this.#caption.textContent = caption;

    const layers = Array.isArray(raw?.layers)
      ? raw.layers.filter((l): l is string => typeof l === 'string').slice(0, 8)
      : [];
    this.#layers.replaceChildren(...layers.map((name) => {
      const chip = document.createElement('span');
      chip.textContent = name;
      return chip;
    }));
    this.#layers.hidden = layers.length === 0;

    this.#draw(size);
  }

  #draw(size: { w: number; h: number }): void {
    const w = Math.max(160, Math.round(size.w));
    const h = Math.max(120, Math.round(size.h));
    this.#svg.setAttribute('width', String(w));
    this.#svg.setAttribute('height', String(h));
    this.#svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    this.#svg.replaceChildren();

    const N = 11;
    // 等距网格的包围盒：宽 N*tileW、高 N*tileH；再给建筑留约 0.9*N*tileH 的竖向余量
    const tileW = Math.min(w / (N * 1.05), h / (N * 0.78), 84);
    const tileH = tileW * 0.5;
    const cx = w / 2;
    const cy = h * 0.46;
    const toX = (gx: number, gy: number): number => cx + (gx - gy) * tileW / 2;
    const toY = (gx: number, gy: number): number => cy + (gx + gy) * tileH / 2;

    // 地面网格：只画稀疏的线，让空间有纵深但不抢内容
    const grid = svg('g');
    grid.setAttribute('stroke', 'var(--sp-grid)');
    grid.setAttribute('stroke-width', '1');
    grid.setAttribute('fill', 'none');
    for (let i = 0; i <= N; i += 1) {
      for (const dir of [0, 1] as const) {
        const line = svg('line');
        if (dir === 0) {
          line.setAttribute('x1', toX(i, 0).toFixed(1));
          line.setAttribute('y1', toY(i, 0).toFixed(1));
          line.setAttribute('x2', toX(i, N).toFixed(1));
          line.setAttribute('y2', toY(i, N).toFixed(1));
        } else {
          line.setAttribute('x1', toX(0, i).toFixed(1));
          line.setAttribute('y1', toY(0, i).toFixed(1));
          line.setAttribute('x2', toX(N, i).toFixed(1));
          line.setAttribute('y2', toY(N, i).toFixed(1));
        }
        grid.append(line);
      }
    }
    this.#svg.append(grid);

    // 建筑：确定性生成，按 (gx+gy) 从后往前画，保证遮挡关系正确
    const blocks: Array<{ gx: number; gy: number; hgt: number; palm: number; hot: boolean }> = [];
    for (let gx = 1; gx < N; gx += 1) {
      for (let gy = 1; gy < N; gy += 1) {
        const r = hash(gx * 131 + gy * 977);
        if (r < 0.52) continue;
        const hgt = 0.35 + hash(gx * 37 + gy * 53) * 1.5;
        blocks.push({
          gx, gy, hgt,
          palm: Math.floor(hash(gx * 19 + gy * 71) * 4),
          hot: hash(gx * 7 + gy * 23) > 0.93,
        });
      }
    }
    blocks.sort((a, b) => (a.gx + a.gy) - (b.gx + b.gy));

    // 全场只强调一个重点：多个"重点"等于没有重点
    const hotIndex = blocks.reduce((best, b, i) => (b.hot && (best < 0 || b.hgt > blocks[best].hgt) ? i : best), -1);
    const hotPick = hotIndex >= 0 ? blocks[hotIndex] : null;

    const blockSize = 0.62;
    for (const b of blocks) {
      const x = toX(b.gx, b.gy);
      const y = toY(b.gx, b.gy);
      const hw = (tileW / 2) * blockSize;
      const hh = (tileH / 2) * blockSize;
      const top = b.hgt * tileH * 1.15;
      const idx = b.palm + 1;
      const isHot = hotPick != null && b === hotPick;

      const g = svg('g');
      g.setAttribute('opacity', isHot ? '0.92' : '0.5');

      // 左面（暗）
      const left = svg('path');
      left.setAttribute('d', `M ${x - hw} ${y} L ${x} ${y + hh} L ${x} ${y + hh - top} L ${x - hw} ${y - top} Z`);
      left.setAttribute('fill', `color-mix(in srgb, var(--sp-series-${idx}) 22%, transparent)`);
      g.append(left);

      // 右面（更暗）
      const right = svg('path');
      right.setAttribute('d', `M ${x + hw} ${y} L ${x} ${y + hh} L ${x} ${y + hh - top} L ${x + hw} ${y - top} Z`);
      right.setAttribute('fill', `color-mix(in srgb, var(--sp-series-${idx}) 13%, transparent)`);
      g.append(right);

      // 顶面（最亮）
      const topFace = svg('path');
      topFace.setAttribute('d', `M ${x} ${y - top - hh} L ${x + hw} ${y - top} L ${x} ${y - top + hh} L ${x - hw} ${y - top} Z`);
      topFace.setAttribute('fill', isHot
        ? 'color-mix(in srgb, var(--sp-accent) 78%, transparent)'
        : `color-mix(in srgb, var(--sp-series-${idx}) 40%, transparent)`);
      g.append(topFace);

      if (isHot) {
        const glow = svg('ellipse');
        glow.setAttribute('cx', String(x));
        glow.setAttribute('cy', String(y + hh));
        glow.setAttribute('rx', String(hw * 1.9));
        glow.setAttribute('ry', String(hh * 1.6));
        glow.setAttribute('fill', 'color-mix(in srgb, var(--sp-accent) 10%, transparent)');
        g.insertBefore(glow, g.firstChild);
        this.#svg.append(g);

        const label = svg('text');
        label.setAttribute('x', String(x));
        label.setAttribute('y', String(y - top - hh - 10));
        label.setAttribute('text-anchor', 'middle');
        label.setAttribute('font-size', '10.5');
        label.setAttribute('letter-spacing', '0.08em');
        label.setAttribute('fill', 'var(--sp-text)');
        label.textContent = '重点区域';
        this.#svg.append(label);
      } else {
        this.#svg.append(g);
      }
    }

    // 一条扫描弧线：给静态画面一点"正在计算"的暗示
    const scan = svg('ellipse');
    scan.setAttribute('cx', String(cx));
    scan.setAttribute('cy', String(cy + tileH * (N / 2) * 0.86));
    scan.setAttribute('rx', String(tileW * 2.1));
    scan.setAttribute('ry', String(tileH * 1.0));
    scan.setAttribute('fill', 'none');
    scan.setAttribute('stroke', 'color-mix(in srgb, var(--sp-accent) 26%, transparent)');
    scan.setAttribute('stroke-width', '1');
    this.#svg.append(scan);
  }

  dispose(): void {
    this.el.remove();
  }
}

export const scene3dRenderer: RendererAdapter = {
  kind: 'scene3d',
  capabilities: {
    min: [360, 260],
    pref: [900, 560],
    max: [2200, 1600],
    interaction: 'inspect',
    cost: 'high',
    fullscreen: true,
  },
  create: () => new Scene3DView(),
};

// ───────────────────────────── html ─────────────────────────────

/**
 * 可选的安全 HTML 展示源（默认不用于主路径）。
 *
 * 信任边界：
 * - 只用 srcdoc，不加载外部 URL；
 * - sandbox="allow-scripts"，不给 allow-same-origin → 拿不到父页存储/DOM；
 * - 不给 allow-top-navigation / allow-popups / allow-modals；
 * - 高度由布局决定，内容不能反向撑大容器。
 */
class HtmlView implements SurfaceView {
  readonly el: HTMLElement;
  #frame: HTMLIFrameElement;
  #html = '';

  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'sp-html';
    const badge = document.createElement('span');
    badge.className = 'sp-html-badge';
    badge.textContent = '沙箱内容';
    this.#frame = document.createElement('iframe');
    this.#frame.setAttribute('sandbox', 'allow-scripts');
    this.#frame.setAttribute('referrerpolicy', 'no-referrer');
    this.#frame.setAttribute('loading', 'lazy');
    this.#frame.title = 'AI 生成的交互内容';
    this.el.append(badge, this.#frame);
  }

  update(spec: SurfaceSpec): void {
    const raw = asRecord(spec.data);
    const html = typeof raw?.html === 'string' ? raw.html : '';
    if (html === this.#html) return;
    this.#html = html;
    this.#frame.srcdoc = html || '<!doctype html><meta charset="utf-8"><body style="font:13px system-ui;color:#64748b;display:grid;place-items:center;height:100vh;margin:0">暂无 HTML 内容</body>';
  }

  dispose(): void {
    this.#frame.srcdoc = '';
    this.el.remove();
  }
}

export const htmlRenderer: RendererAdapter = {
  kind: 'html',
  capabilities: {
    min: [280, 180],
    pref: [600, 380],
    max: [1600, 1200],
    interaction: 'inspect',
    cost: 'medium',
    fullscreen: true,
  },
  create: () => new HtmlView(),
};
