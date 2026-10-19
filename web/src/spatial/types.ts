/**
 * Spatial Scene Spec —— AI 编排空间的最小协议。
 *
 * 设计约束（重要）：
 * 1. 模型只表达「展示什么、有多重要、偏好哪一侧」，不表达像素坐标。
 * 2. 具体位置/尺寸/球体位姿/过渡由 Spatial Layout Orchestrator 确定性计算。
 * 3. 同一份 SceneSpec + 同一视口 → 同一份 LayoutPlan（可测试、可回放）。
 */

/** 工作区形态：宏观空间关系，而不是左右两个固定槽位。 */
export type SceneMode =
  | 'companion'   // 默认态：对话流 + 球，不展示大面板
  | 'split-left'  // 主内容在左，对话列 + 球在右
  | 'split-right' // 主内容在右，对话列 + 球在左
  | 'stage'       // 主内容居中，球缩小停靠左下，两侧可放辅助卡
  | 'immersive'   // 内容接近全屏，球缩到左下，只保留字幕
  | 'focus';      // 单主面板 + 侧栏辅助卡

export type SurfaceRole = 'focus' | 'support' | 'ambient' | 'control' | 'dialogue';

/** 展示源类型。允许扩展：任何 registerRenderer 注册过的 kind 都可以用。 */
export type SurfaceKind =
  | 'table'
  | 'bars'
  | 'line'
  | 'cards'
  | 'text'
  | 'scene3d'
  | 'html'
  | (string & {});

export type SurfacePreference = 'auto' | 'left' | 'right' | 'center' | 'corner' | 'rail';

export interface SizeSpec {
  /** 最小 [宽, 高]，px */
  min?: [number, number];
  /** 期望 [宽, 高]，px */
  pref?: [number, number];
  /** 最大 [宽, 高]，px */
  max?: [number, number];
}

/** 空间权限：防止某个展示源把整屏占掉或盖住球。 */
export interface SurfacePermissions {
  /** 最大面积占视口比例（0-1） */
  maxAreaPct?: number;
  /** 是否允许全屏（immersive 模式） */
  fullscreen?: boolean;
  /** 层级上限，预留给未来多层舞台 */
  maxZ?: number;
  /** 自动收起时间，ms（0/未填 = 不自动收起） */
  ttlMs?: number;
}

export interface SurfaceAction {
  id: string;
  label: string;
  kind: 'submit' | 'navigate' | 'focus';
  payload?: unknown;
}

export interface SurfaceSpec {
  id: string;
  kind: SurfaceKind;
  role?: SurfaceRole;
  /** 0 最高，3 最低；默认 2 */
  priority?: number;
  title?: string;
  subtitle?: string;
  prefer?: SurfacePreference;
  size?: SizeSpec;
  /** inline 数据，或由 source 适配器异步解析 */
  data?: unknown;
  /** 内容来源：默认 'inline'；可用 registerSource 扩展 */
  source?: string;
  interaction?: 'none' | 'hover' | 'inspect' | 'edit';
  lifecycle?: 'turn' | 'session' | 'pinned';
  permissions?: SurfacePermissions;
  actions?: SurfaceAction[];
  /** 为什么展示它：用于解释与回放，不是装饰 */
  why?: string;
}

export interface SceneOrbDirective {
  /** 球体最大直径，px（SLO 仍会按模式收紧） */
  maxDiameterPx?: number;
  /** 用户手动拖过球后进入 pinned，SLO 不再自动移动 */
  pinned?: boolean;
  hidden?: boolean;
  /** 只在用户明确要求「主内容放我这边」时使用 */
  preferredCorner?: 'br' | 'bl' | 'tr' | 'tl';
}

export interface SceneProvenance {
  turnId?: string;
  route?: string;
  confidence?: number;
}

export interface SceneSpec {
  rev: number;
  mode: SceneMode;
  surfaces: SurfaceSpec[];
  focusId?: string | null;
  orb?: SceneOrbDirective;
  /** 对话层形态：居中列 / 底部字幕 / 隐藏 */
  chat?: 'center' | 'compact' | 'hidden';
  transition?: 'gentle' | 'standard' | 'cinematic';
  provenance?: SceneProvenance;
  /** 演示/调试用标签，不参与布局 */
  label?: string;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface Viewport {
  w: number;
  h: number;
  dpr: number;
}

export interface RendererCapabilities {
  min: [number, number];
  pref?: [number, number];
  max?: [number, number];
  /** 宽高比；设置后布局会按比例收敛 */
  aspect?: number;
  interaction: 'none' | 'hover' | 'inspect' | 'edit';
  cost: 'low' | 'medium' | 'high';
  fullscreen: boolean;
}

export interface OrbPlan {
  x: number;
  y: number;
  diameter: number;
  hidden: boolean;
}

export interface ChatPlan {
  /** 对话流矩形 */
  x: number;
  y: number;
  w: number;
  h: number;
  composerX: number;
  composerY: number;
  composerW: number;
  mode: 'center' | 'compact' | 'hidden';
}

export interface LayoutPlan {
  rev: number;
  mode: SceneMode;
  rects: Record<string, Rect>;
  /** 因空间不足而折叠的 surface id */
  collapsed: string[];
  orb: OrbPlan;
  chat: ChatPlan;
  transitionMs: number;
  /** 单行解释：mode / focus / visible / dropped */
  reason: string;
}

export interface LayoutInput {
  viewport: Viewport;
  insets: Insets;
  scene: SceneSpec;
  /** 由渲染器注册表提供的尺寸能力 */
  capabilities: (kind: string) => RendererCapabilities;
  reducedMotion?: boolean;
}

export const MAX_VISIBLE_SURFACES = 8;
export const MAX_SCENE_SURFACES = 24;
