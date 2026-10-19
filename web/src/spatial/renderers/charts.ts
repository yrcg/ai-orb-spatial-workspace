import type { SurfaceSpec } from '../types';
import type { RendererAdapter, SurfaceSize, SurfaceView } from './base';

const SVG_NS = 'http://www.w3.org/2000/svg';

interface Series {
  name: string;
  values: number[];
  color?: string;
}

interface ChartData {
  labels: string[];
  series: Series[];
  unit?: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function readChart(data: unknown): ChartData | null {
  const raw = asRecord(data);
  if (!raw || !Array.isArray(raw.labels) || !Array.isArray(raw.series)) return null;
  const labels = raw.labels.filter((l): l is string => typeof l === 'string').slice(0, 64);
  const series = raw.series.flatMap((s) => {
    const sr = asRecord(s);
    if (!sr || !Array.isArray(sr.values)) return [];
    const values = sr.values
      .slice(0, labels.length)
      .map((v) => {
        const n = typeof v === 'number' ? v : Number(v);
        return Number.isFinite(n) ? n : 0;
      });
    if (!values.length) return [];
    return [{
      name: typeof sr.name === 'string' ? sr.name : '系列',
      values,
      color: typeof sr.color === 'string' ? sr.color : undefined,
    } as Series];
  });
  if (!labels.length || !series.length) return null;
  return {
    labels,
    series,
    unit: typeof raw.unit === 'string' ? raw.unit : undefined,
  };
}

function svg<K extends keyof SVGElementTagNameMap>(tag: K): SVGElementTagNameMap[K] {
  return document.createElementNS(SVG_NS, tag);
}

function niceMax(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1;
  const exp = Math.floor(Math.log10(value));
  const base = 10 ** exp;
  const n = value / base;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * base;
}

function formatTick(value: number): string {
  if (Math.abs(value) >= 10000) return `${Math.round(value / 1000)}k`;
  if (Math.abs(value) >= 100) return String(Math.round(value));
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function addSoftGradient(
  root: SVGSVGElement,
  id: string,
  color: string,
  vertical: boolean,
): void {
  const defs = svg('defs');
  const grad = svg('linearGradient');
  grad.setAttribute('id', id);
  grad.setAttribute('x1', '0');
  grad.setAttribute('y1', '0');
  grad.setAttribute('x2', vertical ? '0' : '1');
  grad.setAttribute('y2', vertical ? '1' : '0');
  for (const [offset, opacity] of [['0', '0.55'], ['1', '0.08']] as const) {
    const stop = svg('stop');
    stop.setAttribute('offset', offset);
    stop.setAttribute('stop-color', color);
    stop.setAttribute('stop-opacity', opacity);
    grad.append(stop);
  }
  defs.append(grad);
  root.append(defs);
}

function seriesColor(index: number, explicit?: string): string {
  if (explicit) return explicit;
  return `var(--sp-series-${(index % 4) + 1})`;
}

interface Box {
  x: number; y: number; w: number; h: number;
}

function plotBox(size: SurfaceSize): Box {
  const left = 46;
  const right = 10;
  const top = 12;
  const bottom = 30;
  return {
    x: left,
    y: top,
    w: Math.max(40, size.w - left - right),
    h: Math.max(40, size.h - top - bottom),
  };
}

/**
 * 轻量坐标：不画整张网格，只留一条基线 + 起止刻度。
 * 目的是让图表"浮在背景里"，而不是变成一张带框的报表。
 */
function drawAxes(
  root: SVGSVGElement,
  data: ChartData,
  size: SurfaceSize,
  max: number,
): Box {
  const box = plotBox(size);

  const baseline = svg('line');
  baseline.setAttribute('x1', String(box.x));
  baseline.setAttribute('x2', String(box.x + box.w));
  baseline.setAttribute('y1', String(box.y + box.h));
  baseline.setAttribute('y2', String(box.y + box.h));
  baseline.setAttribute('stroke', 'var(--sp-line)');
  baseline.setAttribute('stroke-width', '1');
  root.append(baseline);

  for (const [value, y] of [[0, box.y + box.h], [max, box.y]] as const) {
    const label = svg('text');
    label.setAttribute('x', String(box.x - 10));
    label.setAttribute('y', (y + 3.5).toFixed(1));
    label.setAttribute('text-anchor', 'end');
    label.setAttribute('font-size', '10');
    label.setAttribute('letter-spacing', '0.06em');
    label.setAttribute('fill', 'var(--sp-faint)');
    label.textContent = formatTick(value);
    root.append(label);
  }

  const last = data.labels.length - 1;
  const keep = new Set([0, Math.floor(last / 2), last]);
  const band = box.w / Math.max(1, data.labels.length);
  data.labels.forEach((text, i) => {
    if (!keep.has(i)) return;
    const label = svg('text');
    const anchor = i === 0 ? 'start' : i === last ? 'end' : 'middle';
    const x = i === 0 ? box.x : i === last ? box.x + box.w : box.x + band * (i + 0.5);
    label.setAttribute('x', x.toFixed(1));
    label.setAttribute('y', String(box.y + box.h + 18));
    label.setAttribute('text-anchor', anchor);
    label.setAttribute('font-size', '10');
    label.setAttribute('letter-spacing', '0.06em');
    label.setAttribute('fill', 'var(--sp-faint)');
    label.textContent = text;
    root.append(label);
  });

  return box;
}

/** 峰值标注：整个图表只强调一个点 */
function annotatePeak(
  root: SVGSVGElement,
  x: number,
  y: number,
  value: number,
  unit?: string,
): void {
  const ring = svg('circle');
  ring.setAttribute('cx', x.toFixed(1));
  ring.setAttribute('cy', y.toFixed(1));
  ring.setAttribute('r', '5');
  ring.setAttribute('fill', 'none');
  ring.setAttribute('stroke', 'var(--sp-accent)');
  ring.setAttribute('stroke-width', '1.4');
  ring.setAttribute('opacity', '0.55');
  root.append(ring);

  const dot = svg('circle');
  dot.setAttribute('cx', x.toFixed(1));
  dot.setAttribute('cy', y.toFixed(1));
  dot.setAttribute('r', '2.4');
  dot.setAttribute('fill', 'var(--sp-accent)');
  root.append(dot);

  const text = svg('text');
  text.setAttribute('x', x.toFixed(1));
  text.setAttribute('y', (y - 14).toFixed(1));
  text.setAttribute('text-anchor', 'middle');
  text.setAttribute('font-size', '11');
  text.setAttribute('font-weight', '500');
  text.setAttribute('fill', 'var(--sp-text)');
  text.textContent = unit ? `${formatTick(value)}${unit}` : formatTick(value);
  root.append(text);
}

abstract class ChartView implements SurfaceView {
  readonly el: HTMLElement;
  protected svgEl: SVGSVGElement;
  protected legend: HTMLElement;
  #signature = '';

  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'sp-chart';
    this.legend = document.createElement('div');
    this.legend.className = 'sp-legend';
    this.svgEl = svg('svg');
    this.svgEl.classList.add('sp-svg');
    this.el.append(this.legend, this.svgEl);
  }

  update(spec: SurfaceSpec, size: SurfaceSize): void {
    const data = readChart(spec.data);
    const signature = `${size.w}x${size.h}:${JSON.stringify(data ?? spec.data ?? null)}`;
    if (signature === this.#signature) return;
    this.#signature = signature;

    this.legend.replaceChildren();
    this.svgEl.replaceChildren();

    if (!data) {
      const empty = document.createElement('div');
      empty.className = 'sp-empty';
      empty.textContent = '图表数据需要 { labels, series }';
      this.el.replaceChildren(empty);
      return;
    }
    if (this.el.firstElementChild?.classList.contains('sp-empty')) {
      this.el.replaceChildren(this.legend, this.svgEl);
    }

    const w = Math.max(120, Math.round(size.w));
    const h = Math.max(100, Math.round(size.h));
    this.svgEl.setAttribute('width', String(w));
    this.svgEl.setAttribute('height', String(h));
    this.svgEl.setAttribute('viewBox', `0 0 ${w} ${h}`);

    if (data.unit) {
      const unit = document.createElement('span');
      unit.className = 'sp-unit';
      unit.textContent = data.unit;
      this.legend.append(unit);
    }
    data.series.forEach((series, index) => {
      const item = document.createElement('span');
      item.className = 'sp-legend-item';
      const dot = document.createElement('i');
      dot.style.background = seriesColor(index, series.color);
      item.append(dot, document.createTextNode(series.name));
      this.legend.append(item);
    });

    const max = niceMax(Math.max(...data.series.flatMap((s) => s.values)));
    this.draw(data, size, max);
  }

  protected abstract draw(data: ChartData, size: SurfaceSize, max: number): void;

  dispose(): void {
    this.el.remove();
  }
}

class BarsView extends ChartView {
  protected draw(data: ChartData, size: SurfaceSize, max: number): void {
    const box = drawAxes(this.svgEl, data, size, max);
    const band = box.w / data.labels.length;
    const group = Math.min(band * 0.58, 34 * data.series.length);
    const barW = Math.max(3, group / data.series.length - 3);

    data.series.forEach((_series, si) => {
      addSoftGradient(this.svgEl, `sp-grad-bar-${si}`, `var(--sp-series-${(si % 4) + 1})`, true);
    });

    let peak = { value: -1, x: 0, y: 0 };
    data.labels.forEach((_label, i) => {
      data.series.forEach((series, si) => {
        const value = Math.max(0, series.values[i] ?? 0);
        const barH = max > 0 ? (value / max) * box.h : 0;
        const x = box.x + band * i + (band - group) / 2 + si * (barW + 3);
        const y = box.y + box.h - barH;
        const rect = svg('rect');
        rect.setAttribute('x', x.toFixed(1));
        rect.setAttribute('y', y.toFixed(1));
        rect.setAttribute('width', barW.toFixed(1));
        rect.setAttribute('height', Math.max(0.5, barH).toFixed(1));
        rect.setAttribute('rx', String(Math.min(4, barW / 2)));
        rect.setAttribute('fill', si === 0
          ? `url(#sp-grad-bar-${si})`
          : `color-mix(in srgb, var(--sp-series-${(si % 4) + 1}) 34%, transparent)`);
        this.svgEl.append(rect);
        if (si === 0 && value > peak.value) peak = { value, x: x + barW / 2, y };
      });
    });

    if (peak.value >= 0 && data.series.length) {
      annotatePeak(this.svgEl, peak.x, peak.y, peak.value, data.unit);
    }
  }
}

class LineView extends ChartView {
  protected draw(data: ChartData, size: SurfaceSize, max: number): void {
    const box = drawAxes(this.svgEl, data, size, max);
    const band = box.w / Math.max(1, data.labels.length - 1);
    const xOf = (i: number): number => box.x + band * i + (data.labels.length === 1 ? box.w / 2 : 0);
    const yOf = (v: number): number => box.y + box.h - (max > 0 ? (Math.max(0, v) / max) * box.h : 0);

    addSoftGradient(this.svgEl, 'sp-grad-area', 'var(--sp-series-1)', true);
    addSoftGradient(this.svgEl, 'sp-grad-line', 'var(--sp-series-1)', false);

    let peak = { value: -Infinity, x: 0, y: 0 };

    data.series.forEach((series, si) => {
      const color = seriesColor(si, series.color);
      const points = series.values.map((v, i) => `${xOf(i).toFixed(1)},${yOf(v).toFixed(1)}`);

      if (si === 0) {
        const d = `M ${xOf(0).toFixed(1)} ${(box.y + box.h).toFixed(1)} L ${points.join(' L ')} L ${xOf(series.values.length - 1).toFixed(1)} ${(box.y + box.h).toFixed(1)} Z`;
        const area = svg('path');
        area.setAttribute('d', d);
        area.setAttribute('fill', 'url(#sp-grad-area)');
        this.svgEl.append(area);
      }

      const line = svg('polyline');
      line.setAttribute('points', points.join(' '));
      line.setAttribute('fill', 'none');
      line.setAttribute('stroke', si === 0 ? 'url(#sp-grad-line)' : color);
      line.setAttribute('stroke-width', si === 0 ? '2.2' : '1.2');
      line.setAttribute('stroke-linejoin', 'round');
      line.setAttribute('stroke-linecap', 'round');
      line.setAttribute('opacity', si === 0 ? '1' : '0.5');
      this.svgEl.append(line);

      if (si === 0) {
        series.values.forEach((v, i) => {
          if (v > peak.value) peak = { value: v, x: xOf(i), y: yOf(v) };
        });
      }
    });

    if (Number.isFinite(peak.value)) {
      annotatePeak(this.svgEl, peak.x, peak.y, peak.value, data.unit);
    }
  }
}

export const barsRenderer: RendererAdapter = {
  kind: 'bars',
  capabilities: {
    min: [250, 170],
    pref: [640, 380],
    max: [1400, 900],
    interaction: 'hover',
    cost: 'low',
    fullscreen: true,
  },
  create: () => new BarsView(),
};

export const lineRenderer: RendererAdapter = {
  kind: 'line',
  capabilities: {
    min: [250, 170],
    pref: [640, 380],
    max: [1400, 900],
    interaction: 'hover',
    cost: 'low',
    fullscreen: true,
  },
  create: () => new LineView(),
};
