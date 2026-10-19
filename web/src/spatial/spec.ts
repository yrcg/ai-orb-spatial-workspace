import {
  MAX_SCENE_SURFACES,
  type SceneMode,
  type SceneSpec,
  type SizeSpec,
  type SurfacePermissions,
  type SurfaceRole,
  type SurfaceSpec,
} from './types';

const MODES: ReadonlySet<SceneMode> = new Set<SceneMode>([
  'companion', 'split-left', 'split-right', 'stage', 'immersive', 'focus',
]);

const ROLES: ReadonlySet<SurfaceRole> = new Set<SurfaceRole>([
  'focus', 'support', 'ambient', 'control', 'dialogue',
]);

const PREFERENCES = new Set(['auto', 'left', 'right', 'center', 'corner', 'rail']);
const INTERACTIONS = new Set(['none', 'hover', 'inspect', 'edit']);
const LIFECYCLES = new Set(['turn', 'session', 'pinned']);

function asRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function finite(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function pair(value: unknown): [number, number] | undefined {
  if (!Array.isArray(value) || value.length < 2) return undefined;
  const a = finite(value[0], NaN);
  const b = finite(value[1], NaN);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return undefined;
  return [clamp(a, 120, 2400), clamp(b, 80, 2000)];
}

function normalizeSize(value: unknown): SizeSpec | undefined {
  const raw = asRecord(value);
  if (!raw) return undefined;
  const out: SizeSpec = {};
  const min = pair(raw.min);
  const pref = pair(raw.pref);
  const max = pair(raw.max);
  if (min) out.min = min;
  if (pref) out.pref = pref;
  if (max) out.max = max;
  return Object.keys(out).length ? out : undefined;
}

function normalizePermissions(value: unknown): SurfacePermissions | undefined {
  const raw = asRecord(value);
  if (!raw) return undefined;
  const out: SurfacePermissions = {};
  if (raw.maxAreaPct != null) {
    const v = finite(raw.maxAreaPct, 1);
    out.maxAreaPct = clamp(v > 1 ? v / 100 : v, 0.05, 1);
  }
  if (typeof raw.fullscreen === 'boolean') out.fullscreen = raw.fullscreen;
  if (raw.maxZ != null) out.maxZ = clamp(Math.round(finite(raw.maxZ, 1)), 0, 10);
  if (raw.ttlMs != null) out.ttlMs = clamp(Math.round(finite(raw.ttlMs, 0)), 0, 600000);
  return Object.keys(out).length ? out : undefined;
}

function normalizeSurface(value: unknown, index: number): SurfaceSpec | null {
  const raw = asRecord(value);
  if (!raw) return null;
  const id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim().slice(0, 80) : `surface-${index}`;
  const kind = typeof raw.kind === 'string' && raw.kind.trim() ? raw.kind.trim().slice(0, 60) : 'text';
  const role = typeof raw.role === 'string' && ROLES.has(raw.role as SurfaceRole)
    ? raw.role as SurfaceRole
    : 'support';
  const prefer = typeof raw.prefer === 'string' && PREFERENCES.has(raw.prefer)
    ? raw.prefer as SurfaceSpec['prefer']
    : 'auto';
  const interaction = typeof raw.interaction === 'string' && INTERACTIONS.has(raw.interaction)
    ? raw.interaction as SurfaceSpec['interaction']
    : 'none';
  const lifecycle = typeof raw.lifecycle === 'string' && LIFECYCLES.has(raw.lifecycle)
    ? raw.lifecycle as SurfaceSpec['lifecycle']
    : 'turn';

  return {
    id,
    kind,
    role,
    priority: clamp(Math.round(finite(raw.priority, 2)), 0, 3),
    title: typeof raw.title === 'string' ? raw.title.slice(0, 120) : undefined,
    subtitle: typeof raw.subtitle === 'string' ? raw.subtitle.slice(0, 200) : undefined,
    prefer,
    size: normalizeSize(raw.size),
    data: raw.data,
    source: typeof raw.source === 'string' && raw.source.trim() ? raw.source.trim().slice(0, 40) : 'inline',
    interaction,
    lifecycle,
    permissions: normalizePermissions(raw.permissions),
    actions: Array.isArray(raw.actions)
      ? raw.actions.slice(0, 12).flatMap((a) => {
          const ar = asRecord(a);
          if (!ar || typeof ar.id !== 'string' || typeof ar.label !== 'string') return [];
          const kind = ar.kind === 'navigate' || ar.kind === 'focus' ? ar.kind : 'submit';
          return [{ id: ar.id, label: ar.label.slice(0, 40), kind } as const];
        })
      : undefined,
    why: typeof raw.why === 'string' ? raw.why.slice(0, 240) : undefined,
  };
}

/**
 * 把不可信的输入（模型输出 / 外部消息）收敛成安全可用的 SceneSpec。
 * 非法字段一律降级，不抛异常——展示失败只能退化成文本，不能打断语音。
 */
export function normalizeScene(input: unknown, fallbackRev = 0): SceneSpec {
  const raw = asRecord(input) ?? {};
  const mode = typeof raw.mode === 'string' && MODES.has(raw.mode as SceneMode)
    ? raw.mode as SceneMode
    : 'companion';

  const seen = new Set<string>();
  const surfaces: SurfaceSpec[] = [];
  const list = Array.isArray(raw.surfaces) ? raw.surfaces.slice(0, MAX_SCENE_SURFACES) : [];
  for (let i = 0; i < list.length; i++) {
    const surface = normalizeSurface(list[i], i);
    if (!surface) continue;
    let id = surface.id;
    let suffix = 2;
    while (seen.has(id)) id = `${surface.id}-${suffix++}`;
    seen.add(id);
    surfaces.push({ ...surface, id });
  }

  const focusIdRaw = typeof raw.focusId === 'string' ? raw.focusId : null;
  const focusId = focusIdRaw && seen.has(focusIdRaw) ? focusIdRaw : null;
  const chat = raw.chat === 'compact' || raw.chat === 'hidden' ? raw.chat : 'center';
  const transition = raw.transition === 'gentle' || raw.transition === 'cinematic'
    ? raw.transition
    : 'standard';

  const orbRaw = asRecord(raw.orb);
  const corner = orbRaw?.preferredCorner;
  const preferredCorner: 'br' | 'bl' | 'tr' | 'tl' | undefined =
    corner === 'bl' || corner === 'tr' || corner === 'tl' || corner === 'br'
      ? corner
      : undefined;
  const orb = orbRaw ? {
    maxDiameterPx: orbRaw.maxDiameterPx != null
      ? clamp(Math.round(finite(orbRaw.maxDiameterPx, 0)), 44, 240)
      : undefined,
    pinned: orbRaw.pinned === true,
    hidden: orbRaw.hidden === true,
    preferredCorner,
  } : undefined;

  return {
    rev: Math.max(0, Math.round(finite(raw.rev, fallbackRev))),
    mode,
    surfaces,
    focusId,
    orb,
    chat,
    transition,
    provenance: asRecord(raw.provenance) as SceneSpec['provenance'],
    label: typeof raw.label === 'string' ? raw.label.slice(0, 40) : undefined,
  };
}
