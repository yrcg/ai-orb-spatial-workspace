import type { SurfaceSpec } from '../types';
import type { RendererAdapter, SurfaceSize, SurfaceView } from './base';

function asRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function emptyState(text: string): HTMLElement {
  const el = document.createElement('div');
  el.className = 'sp-empty';
  el.textContent = text;
  return el;
}

// ───────────────────────────── table ─────────────────────────────

interface TableColumn {
  key: string;
  label: string;
  align?: 'left' | 'right' | 'center';
}

function readTable(data: unknown): { columns: TableColumn[]; rows: Record<string, unknown>[] } | null {
  const raw = asRecord(data);
  if (!raw || !Array.isArray(raw.columns) || !Array.isArray(raw.rows)) return null;
  const columns = raw.columns.flatMap((c) => {
    const cr = asRecord(c);
    if (!cr || typeof cr.key !== 'string') return [];
    return [{
      key: cr.key,
      label: typeof cr.label === 'string' ? cr.label : cr.key,
      align: cr.align === 'right' || cr.align === 'center' ? cr.align : 'left',
    } as TableColumn];
  });
  if (!columns.length) return null;
  const rows = raw.rows.filter((r) => asRecord(r) != null) as Record<string, unknown>[];
  return { columns, rows };
}

function cellContent(value: unknown): string | Node {
  const cell = asRecord(value);
  if (cell && typeof cell.text === 'string') {
    const badge = document.createElement('span');
    badge.className = 'sp-badge';
    badge.dataset.tone = typeof cell.tone === 'string' ? cell.tone : 'idle';
    badge.textContent = cell.text;
    return badge;
  }
  if (value == null) return '—';
  return String(value);
}

class TableView implements SurfaceView {
  readonly el: HTMLElement;
  #table: HTMLTableElement;
  #head: HTMLTableSectionElement;
  #body: HTMLTableSectionElement;
  #signature = '';

  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'sp-table';
    this.#table = document.createElement('table');
    this.#head = document.createElement('thead');
    this.#body = document.createElement('tbody');
    this.#table.append(this.#head, this.#body);
    this.el.append(this.#table);
  }

  update(spec: SurfaceSpec): void {
    const parsed = readTable(spec.data);
    const signature = JSON.stringify(parsed ?? spec.data ?? null);
    if (signature === this.#signature) return;
    this.#signature = signature;

    if (!parsed) {
      this.#head.replaceChildren();
      this.#body.replaceChildren();
      this.el.replaceChildren(emptyState('表格数据需要 { columns, rows }'));
      return;
    }
    if (!this.el.firstElementChild || (this.el.firstElementChild as HTMLElement).className === 'sp-empty') {
      this.el.replaceChildren(this.#table);
    }

    const headRow = document.createElement('tr');
    for (const col of parsed.columns) {
      const th = document.createElement('th');
      th.textContent = col.label;
      th.style.textAlign = col.align ?? 'left';
      headRow.append(th);
    }
    this.#head.replaceChildren(headRow);

    this.#body.replaceChildren();
    for (const row of parsed.rows) {
      const tr = document.createElement('tr');
      for (const col of parsed.columns) {
        const td = document.createElement('td');
        td.style.textAlign = col.align ?? 'left';
        const content = cellContent(row[col.key]);
        if (typeof content === 'string') td.textContent = content;
        else td.append(content);
        tr.append(td);
      }
      this.#body.append(tr);
    }
  }

  dispose(): void {
    this.el.remove();
  }
}

export const tableRenderer: RendererAdapter = {
  kind: 'table',
  capabilities: {
    min: [280, 170],
    pref: [520, 320],
    max: [1200, 1400],
    interaction: 'hover',
    cost: 'low',
    fullscreen: true,
  },
  create: () => new TableView(),
};

// ───────────────────────────── cards ─────────────────────────────

interface CardItem {
  label: string;
  value: string;
  delta?: string;
  tone?: 'up' | 'down' | 'flat';
  hint?: string;
}

function readCards(data: unknown): CardItem[] | null {
  const raw = asRecord(data);
  if (!raw || !Array.isArray(raw.items)) return null;
  return raw.items.flatMap((item) => {
    const it = asRecord(item);
    if (!it || typeof it.label !== 'string') return [];
    return [{
      label: it.label,
      value: typeof it.value === 'string' || typeof it.value === 'number' ? String(it.value) : '—',
      delta: typeof it.delta === 'string' ? it.delta : undefined,
      tone: it.tone === 'up' || it.tone === 'down' ? it.tone : 'flat',
      hint: typeof it.hint === 'string' ? it.hint : undefined,
    } as CardItem];
  });
}

class CardsView implements SurfaceView {
  readonly el: HTMLElement;
  #signature = '';

  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'sp-cards';
  }

  update(spec: SurfaceSpec): void {
    const items = readCards(spec.data);
    const signature = JSON.stringify(items ?? spec.data ?? null);
    if (signature === this.#signature) return;
    this.#signature = signature;

    if (!items || !items.length) {
      this.el.replaceChildren(emptyState('卡片数据需要 { items: [...] }'));
      return;
    }

    this.el.replaceChildren(...items.map((item) => {
      const card = document.createElement('div');
      card.className = 'sp-card';

      const label = document.createElement('div');
      label.className = 'sp-card-label';
      label.textContent = item.label;

      const value = document.createElement('div');
      value.className = 'sp-card-value';
      value.textContent = item.value;

      card.append(label, value);

      if (item.delta) {
        const delta = document.createElement('div');
        delta.className = 'sp-card-delta';
        delta.dataset.tone = item.tone ?? 'flat';
        delta.textContent = item.delta;
        card.append(delta);
      }
      if (item.hint) {
        const hint = document.createElement('div');
        hint.className = 'sp-card-hint';
        hint.textContent = item.hint;
        card.append(hint);
      }
      return card;
    }));
  }

  dispose(): void {
    this.el.remove();
  }
}

export const cardsRenderer: RendererAdapter = {
  kind: 'cards',
  capabilities: {
    min: [190, 130],
    pref: [300, 240],
    max: [900, 900],
    interaction: 'hover',
    cost: 'low',
    fullscreen: true,
  },
  create: () => new CardsView(),
};

// ───────────────────────────── text ─────────────────────────────

interface TextData {
  paragraphs: string[];
  bullets: string[];
}

function readText(data: unknown): TextData {
  if (typeof data === 'string') return { paragraphs: [data], bullets: [] };
  const raw = asRecord(data);
  if (!raw) return { paragraphs: [], bullets: [] };
  return {
    paragraphs: Array.isArray(raw.paragraphs)
      ? raw.paragraphs.filter((p): p is string => typeof p === 'string').slice(0, 20)
      : [],
    bullets: Array.isArray(raw.bullets)
      ? raw.bullets.filter((p): p is string => typeof p === 'string').slice(0, 24)
      : [],
  };
}

class TextView implements SurfaceView {
  readonly el: HTMLElement;
  #signature = '';

  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'sp-text';
  }

  update(spec: SurfaceSpec): void {
    const data = readText(spec.data);
    const signature = JSON.stringify(data);
    if (signature === this.#signature) return;
    this.#signature = signature;
    this.el.replaceChildren();

    for (const paragraph of data.paragraphs) {
      const p = document.createElement('p');
      p.textContent = paragraph;
      this.el.append(p);
    }
    if (data.bullets.length) {
      const ul = document.createElement('ul');
      for (const bullet of data.bullets) {
        const li = document.createElement('li');
        li.textContent = bullet;
        ul.append(li);
      }
      this.el.append(ul);
    }
    if (!data.paragraphs.length && !data.bullets.length) {
      this.el.append(emptyState('暂无文本内容'));
    }
  }

  dispose(): void {
    this.el.remove();
  }
}

export const textRenderer: RendererAdapter = {
  kind: 'text',
  capabilities: {
    min: [220, 120],
    pref: [360, 260],
    max: [1000, 1600],
    interaction: 'none',
    cost: 'low',
    fullscreen: true,
  },
  create: () => new TextView(),
};

/** 供 stage 判断内容是否真的需要尺寸变化 */
export type { SurfaceSize };
