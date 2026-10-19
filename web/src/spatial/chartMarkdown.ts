import type { SurfaceKind, SurfaceSpec } from './types';

/**
 * Markdown 图表协议（轻量捕获方案）
 *
 * 约定：回答正文之后，用围栏代码块给出图表数据。
 *
 *   ```chart
 *   title: 各部门工单分布
 *   type: bars
 *   unit: 件
 *   | 部门 | 工单数 |
 *   | --- | --- |
 *   | 研发 | 286 |
 *   ```
 *
 * 也接受纯 JSON（便于模型直接产出结构化数据）：
 *
 *   ```chart
 *   { "type": "line", "title": "近七日处理量",
 *     "labels": ["周一","周二"], "series": [{"name":"完成","values":[142,168]}] }
 *   ```
 *
 * 关键点：**图表块必须在送入语音模型之前被剥离**。
 * 语音模型只会念 `text`，不会念数据；否则它会把 JSON 当正文读出来。
 */

export interface ChartBlock {
  kind: SurfaceKind;
  title?: string;
  subtitle?: string;
  unit?: string;
  data: unknown;
  /** 原始围栏内容，便于日志与回放 */
  raw: string;
}

export interface ExtractResult {
  /** 剥离图表块后的正文（可直接塞给语音/文字模型） */
  text: string;
  charts: ChartBlock[];
  /** 是否检测到未闭合的围栏（流式输出中途） */
  openFence: boolean;
}

const FENCE = /```(chart|view|md-chart)(?:[:：]([a-zA-Z0-9_-]+))?[ \t]*\r?\n([\s\S]*?)```/g;
const OPEN_FENCE = /```(chart|view|md-chart)(?:[:：][a-zA-Z0-9_-]+)?[ \t]*\r?\n[\s\S]*$/;

const CHART_KINDS = new Set<string>(['bars', 'line', 'table', 'cards', 'text', 'scene3d']);

function asRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

/** 解析 md 表格：首行表头，第二行分隔符，其余为数据 */
export function parseMarkdownTable(body: string): { headers: string[]; rows: string[][] } | null {
  const lines = body
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.startsWith('|'));
  if (lines.length < 3) return null;

  const cells = (line: string): string[] => line
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());

  const headers = cells(lines[0]);
  const sep = cells(lines[1]);
  if (!headers.length || sep.length !== headers.length) return null;
  if (!sep.every((c) => /^:?-{2,}:?$/.test(c))) return null;

  const rows = lines.slice(2).map(cells).filter((r) => r.some((c) => c !== ''));
  if (!rows.length) return null;
  return { headers, rows };
}

function toNumber(raw: string): number | null {
  const cleaned = raw.replace(/[,\s%]/g, '').replace(/[^\d.+-]/g, '');
  if (!cleaned || cleaned === '-' || cleaned === '.') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** md 表格 → bars/line 的 data（首列作标签，其余数值列作系列） */
function tableToChart(
  headers: string[],
  rows: string[][],
  kind: 'bars' | 'line',
  unit?: string,
): { labels: string[]; series: Array<{ name: string; values: number[] }>; unit?: string } | null {
  const labels = rows.map((r) => r[0] ?? '');
  const series: Array<{ name: string; values: number[] }> = [];

  for (let col = 1; col < headers.length; col++) {
    const values = rows.map((r) => toNumber(r[col] ?? ''));
    if (values.every((v) => v == null)) continue;
    series.push({
      name: headers[col] || `系列${series.length + 1}`,
      values: values.map((v) => v ?? 0),
    });
  }
  if (!series.length) return null;
  return unit ? { labels, series, unit } : { labels, series };
}

/** md 表格 → table 的 data（保留原始单元格） */
function tableToData(headers: string[], rows: string[][]): { columns: Array<{ key: string; label: string }>; rows: Array<Record<string, unknown>> } {
  const columns = headers.map((label, i) => ({ key: `c${i}`, label }));
  return {
    columns,
    rows: rows.map((r) => Object.fromEntries(r.map((cell, i) => [`c${i}`, cell]))),
  };
}

/** 从 key: value 头解析元信息（title / type / unit / subtitle） */
function readHeader(body: string): { meta: Record<string, string>; rest: string } {
  const map: Record<string, string> = {};
  const lines = body.split(/\r?\n/);
  let i = 0;
  for (; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const m = /^([a-zA-Z_][\w-]*)\s*[:：]\s*(.+)$/.exec(line);
    if (!m) break;
    map[m[1].toLowerCase()] = m[2].trim();
  }
  return { meta: map, rest: lines.slice(i).join('\n') };
}

function parseBlock(body: string, forcedKind?: string): ChartBlock | null {
  const trimmed = body.trim();
  if (!trimmed) return null;

  // ① JSON 形态
  if (trimmed.startsWith('{')) {
    let raw: unknown;
    try { raw = JSON.parse(trimmed); } catch { return null; }
    const obj = asRecord(raw);
    if (!obj) return null;
    const type = String(obj.type ?? obj.kind ?? forcedKind ?? 'bars');
    const kind: SurfaceKind = CHART_KINDS.has(type) ? type : 'bars';

    // JSON 既可以给完整 data，也可以只给 labels/series（此时直接作为 data）
    const data = obj.data ?? (
      obj.labels || obj.series ? { labels: obj.labels, series: obj.series, unit: obj.unit } : null
    );
    if (!data) return null;
    return {
      kind,
      title: typeof obj.title === 'string' ? obj.title : undefined,
      subtitle: typeof obj.subtitle === 'string' ? obj.subtitle : undefined,
      unit: typeof obj.unit === 'string' ? obj.unit : undefined,
      data,
      raw: trimmed,
    };
  }

  // ② key: value 头 + md 表格
  const { meta, rest } = readHeader(trimmed);
  const table = parseMarkdownTable(rest);
  if (!table) return null;

  const type = (meta.type || forcedKind || '').toLowerCase();
  const unit = meta.unit;

  if (type === 'table') {
    return {
      kind: 'table',
      title: meta.title,
      subtitle: meta.subtitle,
      unit,
      data: tableToData(table.headers, table.rows),
      raw: trimmed,
    };
  }

  const kind: 'bars' | 'line' = type === 'line' ? 'line' : 'bars';
  const data = tableToChart(table.headers, table.rows, kind, unit);
  if (!data) return null;
  return {
    kind,
    title: meta.title,
    subtitle: meta.subtitle,
    unit,
    data,
    raw: trimmed,
  };
}

/**
 * 从任意文本中捕获图表块。
 * 返回的 `text` 已剔除围栏；脚本仍保留换行结构，避免正文粘连。
 */
export function extractChartBlocks(input: string): ExtractResult {
  if (!input || !input.includes('```')) {
    return { text: input ?? '', charts: [], openFence: false };
  }

  const charts: ChartBlock[] = [];
  let text = input.replace(FENCE, (_all, _tag, forced, body) => {
    const block = parseBlock(String(body), forced ? String(forced) : undefined);
    if (block) charts.push(block);
    // 用空行替换，避免前后句子粘在一起
    return '\n';
  });

  // 未闭合围栏：流式输出中途常见。正文里不要暴露原始数据。
  const open = OPEN_FENCE.exec(text);
  if (open) {
    text = text.slice(0, open.index);
  }

  text = text.replace(/\n{3,}/g, '\n\n').trim();
  return { text, charts, openFence: Boolean(open) };
}

/**
 * 把捕获到的图表转成 SurfaceSpec。
 * 1 块 → 右分栏；2 块及以上 → 全局。
 */
export function chartsToSurfaces(charts: ChartBlock[], rev: number): SurfaceSpec[] {
  return charts.map((chart, i) => ({
    id: `chart-${rev}-${i}`,
    kind: chart.kind,
    role: i === 0 ? 'focus' : 'support',
    priority: i === 0 ? 0 : Math.min(3, i),
    title: chart.title ?? (charts.length > 1 ? `图表 ${i + 1}` : '数据视图'),
    subtitle: chart.subtitle,
    prefer: 'auto',
    size: chart.kind === 'table'
      ? { min: [300, 200], pref: [560, 420] }
      : { min: [300, 200], pref: [620, 380] },
    data: chart.data,
    interaction: 'hover',
    lifecycle: 'session',
    why: '对话中的数据',
  }));
}

/** 选择空间形态：展示少用右分栏，展示多用全局 */
export function modeForCount(count: number): 'split-right' | 'immersive' {
  return count >= 2 ? 'immersive' : 'split-right';
}
