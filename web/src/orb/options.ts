export type OrbTheme = 'light' | 'dark' | 'auto';

/**
 * 声场表现方式（2026-10-19 用户选定 A）：
 *   native —— 驱动 liquid-orb 自带的边缘辉光（edgeGlow + glowColor），零新增绘制
 *   ring   —— 旧的 32 段线条环（保留做对比，非默认）
 *   off    —— 关闭
 */
export type AuraMode = 'native' | 'ring' | 'off';

export interface OrbOptions {  // ---- 渲染体（Q11：可替换）----
  /** 渲染体名称（见 renderers.ts 注册表）：'liquid' | 自定义 */
  orb: string;
  /** liquid 渲染体的形态预设：'custom'（原始悬浮球，默认）| 'voiceWave' | 'chromatic' */
  orbPreset: string;

  // ---- 停靠态（Q3）----
  /** 停靠态 orb 直径（px） */
  dockOrbSize: number;
  /** 停靠态距屏幕右边距（px） */
  dockMarginX: number;
  /** 停靠态距屏幕底边距（px） */
  dockMarginY: number;
  /** 窄屏时停靠球的最小直径（px） */
  dockOrbSizeMin: number;

  // ---- 活跃态布局（Q3）----
  /** orb 画布边长 = 视口高 × 该比例（固定单尺寸，缩放交给 CSS transform） */
  orbCanvasRatio: number;
  /** 活跃态 orb 直径（屏高比例） */
  activeOrbRatio: number;
  /** 活跃态 orb 中心 y（屏高比例，0.5 为正中） */
  activeOrbCenterY: number;
  /** 活跃态半径倍率 */
  activeRadiusScale: number;
  /** 窄屏活跃比例（< narrowWidth 时生效） */
  narrowWidth: number;
  /** 窄屏活跃 orb 比例 */
  activeOrbRatioNarrow: number;

  // ---- 遮罩 ----
  /** 遮罩底色不透明度（模糊遮罩用低值，只做一层薄纱） */
  backgroundOpacity: number;
  /** 背景模糊半径（px）。越大越"糊"，也越贵 */
  overlayBlur: number;
  /** 主题：决定遮罩/文字/粒子的明暗。'auto' 跟随宿主页面背景亮度 */
  theme: OrbTheme;
  /** 声场表现方式：默认 native（用球体自带的辉光，而不是外挂一层环） */
  auraMode: AuraMode;

  // ---- 视觉参数（映射到 WGSL uniform）----
  glowIntensity: number;
  breathingAmplitude: number;
  breathePeriod: number;
  motionSpeed: number;
  /** 视野（null = 用预设自带的 zoom，不覆盖） */
  zoom: number | null;
  /** 玻璃不透明度（null = 用预设自带值，不覆盖） */
  glassOpacity: number | null;

  // ---- 交互编排（Q6/Q7，长度单）----
  /** 激活：坍缩 */
  collapseMs: number;
  /** 激活：高能量核心闪亮 */
  coreMs: number;
  /** 激活：沿短光迹移到屏心 */
  trailMs: number;
  /** 激活：重新展开 */
  expandMs: number;
  /** 收起：坍缩成核心 */
  closeCollapseMs: number;
  /** 收起：沿短光迹回到停靠位 */
  closeTrailMs: number;
  /** 收起：微弹落定 */
  closeSettleMs: number;

  // ---- 粒子背景（Q10，仅 active 态）----
  particlesEnabled: boolean;
  particleCount: number;
  particleOpacity: number;

  // ---- 待机分级（Q5）----
  /** 静默多久进入「睡眠」（ms） */
  idleSleepMs: number;
  sleepExposureScale: number;
  sleepBreathScale: number;
  sleepSpeedScale: number;

  // ---- 对话层 ----
  /** 是否启用内置对话层 */
  chatEnabled: boolean;
  /** 对话区左右留白（px） */
  chatMaxWidth: number;
  /** 对话区顶部起点（px） */
  chatTop: number;
  /** 对话区底部与 orb 顶部的间距（px） */
  chatGap: number;
  /** 对话区上下渐隐比例（0-0.5） */
  chatFade: number;
  /** 打字机速度（字/秒） */
  streamCps: number;
}

export const DEFAULT_OPTIONS: OrbOptions = {
  orb: 'liquid',
  orbPreset: 'custom',

  dockOrbSize: 120,
  dockMarginX: 32,
  dockMarginY: 44,
  dockOrbSizeMin: 88,

  orbCanvasRatio: 0.52,
  activeOrbRatio: 0.28,
  activeOrbCenterY: 0.48,
  activeRadiusScale: 0.8,
  narrowWidth: 1024,
  activeOrbRatioNarrow: 0.22,

  // 模糊遮罩：一层很淡的薄纱 + 较强的背景模糊，观感是"背景失焦浮起"而不是"关灯"
  backgroundOpacity: 0.5,
  overlayBlur: 22,
  theme: 'light',
  auraMode: 'native',

  glowIntensity: 1,
  breathingAmplitude: 0.03,
  breathePeriod: 5,
  motionSpeed: 1,
  // null = 保持预设原值（换预设时视觉才不会被面板默认值改写）
  zoom: null,
  glassOpacity: null,

  collapseMs: 180,
  coreMs: 120,
  trailMs: 260,
  expandMs: 360,
  closeCollapseMs: 140,
  closeTrailMs: 300,
  closeSettleMs: 180,

  particlesEnabled: true,
  particleCount: 120,
  particleOpacity: 0.13,

  idleSleepMs: 90000,
  sleepExposureScale: 0.75,
  sleepBreathScale: 0.6,
  sleepSpeedScale: 0.5,

  chatEnabled: true,
  chatMaxWidth: 680,
  chatTop: 56,
  chatGap: 24,
  chatFade: 0.14,
  streamCps: 42,
};
