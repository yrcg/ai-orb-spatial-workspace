import {
  MAX_VISIBLE_SURFACES,
  type ChatPlan,
  type Insets,
  type LayoutInput,
  type LayoutPlan,
  type OrbPlan,
  type Rect,
  type RendererCapabilities,
  type SceneMode,
  type SceneSpec,
  type SurfacePreference,
  type SurfaceRole,
  type SurfaceSpec,
  type Viewport,
} from './types';

/**
 * Spatial Layout Orchestrator（SLO）
 *
 * 职责：把「展示什么 + 有多重要」变成「放在哪、多大、球让到哪、怎么过渡」。
 *
 * 为什么用离散区域而不是全局约束求解：
 * - 「放哪一侧」是离散决策，连续求解会产生小数坐标和跨轮漂移；
 * - 区域内再用 first-fit + 尺寸收敛，足够稳定，且是亚毫秒级；
 * - 只在区域边界内量化，保证同一输入得到同一输出。
 *
 * 这个文件不读 DOM、不读时间、不用随机数 —— 可以单独做单元测试和回放。
 */

const GAP = 14;
const ORB_CLEARANCE = 16;

interface Slot {
  id: string;
  rect: Rect;
  side: 'left' | 'right' | 'center';
  roles: SurfaceRole[];
  allowOrbOverlap?: boolean;
}

const ROLE_WEIGHT: Record<SurfaceRole, number> = {
  focus: 0,
  control: 1,
  support: 2,
  ambient: 3,
  dialogue: 4,
};

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function hashId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function overlaps(a: Rect, b: Rect, gap = 0): boolean {
  return a.x < b.x + b.w + gap
    && a.x + a.w + gap > b.x
    && a.y < b.y + b.h + gap
    && a.y + a.h + gap > b.y;
}

function splitAreas(mode: SceneMode, ins: Insets, W: number): {
  focusX: number; focusW: number; chatX: number; chatW: number;
} {
  const gap = 16;
  const focusW = Math.round(W * 0.46);
  const chatW = Math.max(240, W - focusW - gap);
  if (mode === 'split-left') {
    return {
      focusX: ins.left,
      focusW,
      chatX: ins.left + focusW + gap,
      chatW,
    };
  }
  return {
    focusX: ins.left + chatW + gap,
    focusW,
    chatX: ins.left,
    chatW,
  };
}

function buildSlots(mode: SceneMode, vp: Viewport, ins: Insets, W: number, H: number): Slot[] {
  if (mode === 'companion') return [];

  if (mode === 'split-left' || mode === 'split-right') {
    const a = splitAreas(mode, ins, W);
    return [{
      id: 'focus',
      rect: { x: a.focusX, y: ins.top, w: a.focusW, h: H },
      side: mode === 'split-left' ? 'left' : 'right',
      roles: ['focus', 'support'],
    }];
  }

  if (mode === 'immersive') {
    return [{
      id: 'full',
      rect: { x: 0, y: 0, w: vp.w, h: vp.h },
      side: 'center',
      roles: ['focus', 'support'],
      allowOrbOverlap: true,
    }];
  }

  if (mode === 'focus') {
    const mainW = clamp(Math.round(W * 0.64), 520, 1000);
    const railW = W - mainW - GAP;
    const mainH = H;
    const slots: Slot[] = [{
      id: 'focus',
      rect: { x: ins.left, y: ins.top, w: mainW, h: mainH },
      side: 'center',
      roles: ['focus', 'support'],
    }];
    if (railW >= 220) {
      const half = Math.floor((mainH - GAP) / 2);
      slots.push({
        id: 'right-top',
        rect: { x: ins.left + mainW + GAP, y: ins.top, w: railW, h: half },
        side: 'right',
        roles: ['support', 'control'],
      });
      slots.push({
        id: 'right-bottom',
        rect: { x: ins.left + mainW + GAP, y: ins.top + half + GAP, w: railW, h: mainH - half - GAP },
        side: 'right',
        roles: ['support', 'ambient'],
      });
    }
    return slots;
  }

  // stage：主内容居中，两侧留出辅助卡位；窄屏时侧栏消失，辅助卡折叠。
  // 0.52 是在 1280 宽下让两侧各留出约 290px —— 正好容得下一张指标卡/小图表。
  const focusW = clamp(Math.round(W * 0.52), 540, 980);
  const focusX = ins.left + Math.round((W - focusW) / 2);
  const sideW = Math.floor((W - focusW - GAP * 2) / 2);
  const focusH = H;
  const slots: Slot[] = [{
    id: 'focus',
    rect: { x: focusX, y: ins.top, w: focusW, h: focusH },
    side: 'center',
    roles: ['focus', 'support'],
  }];
  if (sideW >= 200) {
    const half = Math.floor((focusH - GAP) / 2);
    slots.push({
      id: 'left-top',
      rect: { x: ins.left, y: ins.top, w: sideW, h: half },
      side: 'left',
      roles: ['support', 'control'],
    });
    slots.push({
      id: 'left-bottom',
      rect: { x: ins.left, y: ins.top + half + GAP, w: sideW, h: focusH - half - GAP },
      side: 'left',
      roles: ['support', 'ambient'],
    });
    slots.push({
      id: 'right-top',
      rect: { x: focusX + focusW + GAP, y: ins.top, w: sideW, h: half },
      side: 'right',
      roles: ['support', 'control'],
    });
    slots.push({
      id: 'right-bottom',
      rect: { x: focusX + focusW + GAP, y: ins.top + half + GAP, w: sideW, h: focusH - half - GAP },
      side: 'right',
      roles: ['support', 'ambient'],
    });
  }
  return slots;
}

function planOrb(mode: SceneMode, vp: Viewport, ins: Insets, scene: SceneSpec): OrbPlan {
  const maxD = scene.orb?.maxDiameterPx;
  const cap = (d: number): number => maxD ? Math.min(d, maxD) : d;
  const hidden = scene.orb?.hidden === true;

  if (mode === 'companion') {
    const d = cap(120);
    return {
      x: vp.w - ins.right - d / 2,
      y: vp.h - ins.bottom - d / 2 + 12,
      diameter: d,
      hidden,
    };
  }

  if (mode === 'split-left' || mode === 'split-right') {
    const W = vp.w - ins.left - ins.right;
    const H = vp.h - ins.top - ins.bottom;
    const a = splitAreas(mode, ins, W);
    const d = cap(clamp(Math.round(vp.h * 0.17), 96, 136));
    const y = clamp(
      ins.top + H * 0.66,
      ins.top + 220 + d / 2,
      vp.h - ins.bottom - d / 2 - 88,
    );
    return { x: a.chatX + a.chatW / 2, y, diameter: d, hidden };
  }

  const d = cap(mode === 'immersive' ? 54 : mode === 'stage' ? 62 : 66);
  return {
    x: ins.left + 18 + d / 2,
    y: vp.h - ins.bottom - 18 - d / 2,
    diameter: d,
    hidden,
  };
}

function planChat(mode: SceneMode, vp: Viewport, ins: Insets, orb: OrbPlan, W: number): ChatPlan {
  const hidden: ChatPlan = {
    x: 0, y: 0, w: 0, h: 0,
    composerX: 0, composerY: 0, composerW: 0,
    mode: 'hidden',
  };
  if (mode === 'companion') return { ...hidden, mode: 'center' };

  if (mode === 'split-left' || mode === 'split-right') {
    const a = splitAreas(mode, ins, W);
    const w = Math.max(260, Math.min(620, a.chatW - 16));
    const x = a.chatX + (a.chatW - w) / 2;
    const orbTop = orb.y - orb.diameter / 2;
    const orbBottom = orb.y + orb.diameter / 2;
    return {
      x: Math.round(x),
      y: Math.round(ins.top + 6),
      w: Math.round(w),
      h: Math.round(Math.max(120, orbTop - ins.top - 36)),
      composerX: Math.round(x),
      composerY: Math.round(orbBottom + 18),
      composerW: Math.round(w),
      mode: 'center',
    };
  }

  // 字幕式对话：贴在屏幕下缘，像视频字幕，不横穿图表中部。
  const w = Math.round(Math.max(360, Math.min(760, W - 160)));
  const bottom = vp.h - ins.bottom;
  // 字幕区高度按"两行正文 + 输入行"给的，留出安全边距
  const h = 84;
  const y = Math.round(bottom - h - 34);
  return {
    x: Math.round(ins.left + (W - w) / 2),
    y,
    w,
    h,
    composerX: Math.round(ins.left + (W - w) / 2),
    composerY: Math.round(bottom - 34),
    composerW: w,
    mode: 'compact',
  };
}

function fitRect(
  slot: Rect,
  spec: SurfaceSpec,
  cap: RendererCapabilities,
  allowFullscreen: boolean,
  fillW: boolean,
  fillH: boolean,
): Rect | null {
  if (spec.permissions?.fullscreen === false && allowFullscreen) {
    const insetX = Math.round(slot.w * 0.08);
    const insetY = Math.round(slot.h * 0.08);
    slot = {
      x: slot.x + insetX,
      y: slot.y + insetY,
      w: slot.w - insetX * 2,
      h: slot.h - insetY * 2,
    };
  }

  // 槽位比"最小尺寸"还小时，宁可压缩内容也不要把 surface 整个丢掉：
  // 丢掉会变成 chip，用户会觉得"刚才还能看的东西不见了"。
  const minW = Math.min(Math.max(160, spec.size?.min?.[0] ?? cap.min[0]), Math.max(160, slot.w - 8));
  const minH = Math.min(Math.max(120, spec.size?.min?.[1] ?? cap.min[1]), Math.max(120, slot.h - 8));
  const maxW = Math.min(slot.w, spec.size?.max?.[0] ?? cap.max?.[0] ?? Number.POSITIVE_INFINITY);
  const maxH = Math.min(slot.h, spec.size?.max?.[1] ?? cap.max?.[1] ?? Number.POSITIVE_INFINITY);
  if (maxW + 0.5 < minW || maxH + 0.5 < minH) return null;

  // focus 面板铺满槽位（留呼吸边距）；辅助卡宽度按 pref 居中、但高度铺满。
  // 高度必须铺满，否则 4 条指标会被裁成 2 条 —— 那看起来像 bug，不像留白。
  const targetW = fillW ? slot.w - 12 : (spec.size?.pref?.[0] ?? slot.w);
  const targetH = fillH ? slot.h - 12 : (spec.size?.pref?.[1] ?? slot.h);
  let w = clamp(targetW, minW, maxW);
  let h = clamp(targetH, minH, maxH);

  if (cap.aspect && cap.aspect > 0) {
    h = clamp(w / cap.aspect, minH, maxH);
    w = clamp(h * cap.aspect, minW, maxW);
  }

  const areaLimit = spec.permissions?.maxAreaPct;
  if (areaLimit && w * h > areaLimit * slot.w * slot.h) {
    const scale = Math.sqrt((areaLimit * slot.w * slot.h) / (w * h));
    w = Math.max(minW, w * scale);
    h = Math.max(minH, h * scale);
  }

  if (w + 0.5 < minW || h + 0.5 < minH) return null;
  return {
    x: Math.round(slot.x + (slot.w - w) / 2),
    y: Math.round(slot.y + (slot.h - h) / 2),
    w: Math.round(w),
    h: Math.round(h),
  };
}

/**
 * 球的安全区是"硬禁区"，但不该因此废掉整个槽位。
 *
 * 之前直接 `overlaps ? continue` 会把整块 focus 槽位判死：
 * 球只是停在左下角，表格却被挤到 400px 的侧栏里——这是布局 bug 的典型症状。
 * 这里改为从矩形里切掉与球相交的部分，保留面积最大的可行方案。
 */
function avoidOrb(rect: Rect, orbBlock: Rect, minW: number, minH: number): Rect | null {
  if (!overlaps(rect, orbBlock, 0)) return rect;

  const candidates: Rect[] = [];
  // 1) 从上方缩（球在下半部）
  if (orbBlock.y - rect.y >= minH) {
    candidates.push({ x: rect.x, y: rect.y, w: rect.w, h: orbBlock.y - rect.y - GAP });
  }
  // 2) 从左侧缩（球在右侧）
  if (orbBlock.x - rect.x >= minW) {
    candidates.push({ x: rect.x, y: rect.y, w: orbBlock.x - rect.x - GAP, h: rect.h });
  }
  // 3) 从下方缩（球在上半部）
  const bottomCut = rect.y + rect.h - (orbBlock.y + orbBlock.h);
  if (bottomCut >= minH) {
    candidates.push({ x: rect.x, y: orbBlock.y + orbBlock.h + GAP, w: rect.w, h: bottomCut - GAP });
  }
  // 4) 从右侧缩（球在左侧）
  const rightCut = rect.x + rect.w - (orbBlock.x + orbBlock.w);
  if (rightCut >= minW) {
    candidates.push({ x: orbBlock.x + orbBlock.w + GAP, y: rect.y, w: rightCut - GAP, h: rect.h });
  }

  let best: Rect | null = null;
  let bestArea = 0;
  for (const c of candidates) {
    if (c.w < minW || c.h < minH) continue;
    if (overlaps(c, orbBlock, 0)) continue;
    const area = c.w * c.h;
    if (area > bestArea) { best = c; bestArea = area; }
  }
  return best;
}

function preferRank(slot: Slot, prefer: SurfacePreference | undefined): number {
  if (!prefer || prefer === 'auto') return 0;
  if (prefer === slot.side) return 0;
  if ((prefer === 'corner' || prefer === 'rail') && slot.side !== 'center') return 0;
  if (slot.side === 'center') return 2;
  return 1;
}

function accepts(slot: Slot, role: SurfaceRole): boolean {
  if (slot.roles.includes(role)) return true;
  // 资源不足时允许降级：focus 可以退到辅助位，ambient 可以退到 support 位
  if (role === 'focus' && slot.roles.includes('support')) return true;
  if (role === 'ambient' && slot.roles.includes('support')) return true;
  return false;
}

function transitionFor(scene: SceneSpec, reducedMotion: boolean | undefined): number {
  if (reducedMotion) return 0;
  if (scene.transition === 'gentle') return 170;
  if (scene.transition === 'cinematic') return 340;
  return 220;
}

export function planLayout(input: LayoutInput): LayoutPlan {
  const { viewport: vp, insets: ins, scene: rawScene } = input;
  // companion 是"没有展示需求"的默认态。一旦带了展示面，自动升到分栏，
  // 避免出现「有内容但没有槽位可用」的无效状态。
  const scene: SceneSpec = rawScene.mode === 'companion' && rawScene.surfaces.length > 0
    ? { ...rawScene, mode: 'split-right' }
    : rawScene;
  const W = Math.max(1, vp.w - ins.left - ins.right);
  const H = Math.max(1, vp.h - ins.top - ins.bottom);

  const orb = planOrb(scene.mode, vp, ins, scene);
  const chat = planChat(scene.mode, vp, ins, orb, W);

  // stage / focus 的字幕带贴在屏幕下缘。内容如果铺到最底，坐标轴会被字幕压住，
  // 所以这两种模式要预留字幕高度；immersive 则是刻意的"字幕压在画面上"。
  const reserveBottom = (scene.mode === 'stage' || scene.mode === 'focus') && chat.w > 0
    ? chat.y - 12
    : vp.h - ins.bottom;
  const contentH = Math.max(200, reserveBottom - ins.top);
  const slots = buildSlots(scene.mode, vp, ins, W, contentH);

  const focusId = scene.focusId ?? null;
  const ordered = [...scene.surfaces].sort((a, b) => {
    const af = a.id === focusId ? 0 : 1;
    const bf = b.id === focusId ? 0 : 1;
    if (af !== bf) return af - bf;
    const ar = ROLE_WEIGHT[a.role ?? 'support'];
    const br = ROLE_WEIGHT[b.role ?? 'support'];
    if (ar !== br) return ar - br;
    if ((a.priority ?? 2) !== (b.priority ?? 2)) return (a.priority ?? 2) - (b.priority ?? 2);
    return hashId(a.id) - hashId(b.id);
  });

  const rects: Record<string, Rect> = {};
  const collapsed: string[] = [];
  const used = new Set<string>();
  const placed: Rect[] = [];
  const orbBlock: Rect = {
    x: orb.x - orb.diameter / 2 - ORB_CLEARANCE,
    y: orb.y - orb.diameter / 2 - ORB_CLEARANCE,
    w: orb.diameter + ORB_CLEARANCE * 2,
    h: orb.diameter + ORB_CLEARANCE * 2,
  };

  for (const surface of ordered) {
    if (Object.keys(rects).length >= MAX_VISIBLE_SURFACES) {
      collapsed.push(surface.id);
      continue;
    }

    const role: SurfaceRole = surface.id === focusId ? 'focus' : (surface.role ?? 'support');
    const cap = input.capabilities(surface.kind);
    const candidates = slots
      .filter((slot) => !used.has(slot.id) && accepts(slot, role))
      .map((slot, index) => ({ slot, index, rank: preferRank(slot, surface.prefer) }))
      .sort((a, b) => a.rank - b.rank || a.index - b.index);

    let placedRect: Rect | null = null;
    let placedSlot: Slot | null = null;

    for (const { slot } of candidates) {
      const fitted = fitRect(slot.rect, surface, cap, slot.id === 'full', role === 'focus', true);
      if (!fitted) continue;
      const rect = slot.allowOrbOverlap
        ? fitted
        : avoidOrb(fitted, orbBlock, Math.max(160, cap.min[0]), Math.max(120, cap.min[1]));
      if (!rect) continue;
      if (placed.some((p) => overlaps(rect, p, GAP))) continue;
      placedRect = rect;
      placedSlot = slot;
      break;
    }

    if (!placedRect || !placedSlot) {
      collapsed.push(surface.id);
      continue;
    }

    rects[surface.id] = placedRect;
    placed.push(placedRect);
    used.add(placedSlot.id);
  }

  return {
    rev: scene.rev,
    mode: scene.mode,
    rects,
    collapsed,
    orb,
    chat,
    transitionMs: transitionFor(scene, input.reducedMotion),
    reason: `mode=${scene.mode} focus=${focusId ?? '-'} visible=${Object.keys(rects).length} collapsed=${collapsed.length}`,
  };
}
