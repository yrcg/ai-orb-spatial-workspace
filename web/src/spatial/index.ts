import './renderers';
import './stage';
import { SpatialStage, type SpatialStageEventDetail } from './stage';
import { demoScene, DEMO_MODES } from './demo';
import { normalizeScene } from './spec';
import type { SceneMode, SceneSpec } from './types';
import type { AIOrbChat } from '../orb';

/**
 * 空间工作区接线：把舞台、球体、宿主设置面板连起来。
 *
 * 设计上刻意保持"可整体拔除"：
 * - 不 import 任何语音/中继代码；
 * - 舞台只在 enabled 时接管球的位置；
 * - 关闭开关后立刻回到原有两态布局。
 */
export interface SpatialWorkspaceOptions {
  orb: AIOrbChat;
  /** 初始是否启用（默认关闭，避免影响现有行为） */
  enabled?: boolean;
  theme?: 'light' | 'dark';
  /** 宿主安全区：顶栏/状态条/底栏占用的空间，舞台不会把内容放进去 */
  insets?: { top?: number; right?: number; bottom?: number; left?: number };
}

export class SpatialWorkspace {
  readonly stage: SpatialStage;
  #orb: AIOrbChat;
  #enabled: boolean;
  #mode: SceneMode = 'companion';
  #lastScene: SceneSpec | null = null;
  #onPlan = (event: Event): void => {
    const { plan } = (event as CustomEvent<SpatialStageEventDetail>).detail;
    // companion = 没有空间编排需求，交还给 orb 的默认布局
    this.#orb.setSpatialPlan(plan.mode === 'companion' ? null : plan);
  };

  constructor(options: SpatialWorkspaceOptions) {
    this.#orb = options.orb;
    const stage = document.querySelector('ai-spatial-stage') as SpatialStage | null;
    if (!stage) throw new Error('[spatial] <ai-spatial-stage> not found');
    this.stage = stage;
    this.#enabled = options.enabled === true;
    stage.setTheme(options.theme ?? 'light');
    stage.setInsets(options.insets ?? { top: 68, right: 24, bottom: 20, left: 24 });
    stage.addEventListener('spatial:layout', this.#onPlan);
    stage.setEnabled(this.#enabled);
  }

  get enabled(): boolean {
    return this.#enabled;
  }

  get mode(): SceneMode {
    return this.#mode;
  }

  setEnabled(on: boolean): void {
    this.#enabled = on;
    this.stage.setEnabled(on);
    if (!on) {
      this.#orb.setSpatialPlan(null);
      this.#lastScene = null;
      return;
    }
    this.setMode(this.#mode);
  }

  setTheme(theme: 'light' | 'dark'): void {
    this.stage.setTheme(theme);
  }

  /** 切换演示/真实场景 */
  setMode(mode: SceneMode): void {
    this.#mode = mode;
    if (!this.#enabled) return;
    this.applyScene(demoScene(mode));
  }

  /** 应用一份场景（未来由中继的视觉路由调用，现在也可以手动传） */
  applyScene(input: unknown): void {
    if (!this.#enabled) return;
    const scene = normalizeScene(input, this.#lastScene?.rev ?? 0);
    this.#lastScene = scene;
    this.stage.setScene(scene);
    // 有展示内容时自动展开对话层，否则用户看不到球的位移和对话列
    if (scene.surfaces.length > 0 && this.#orb.phase === 'idle') this.#orb.activateSilent();
  }

  /** 收起工作区：回到伴随态，并把球交还给默认布局 */
  reset(): void {
    this.#mode = 'companion';
    this.#lastScene = null;
    this.stage.setScene(demoScene('companion'));
    this.#orb.setSpatialPlan(null);
  }

  dispose(): void {
    this.stage.removeEventListener('spatial:layout', this.#onPlan);
    this.#orb.setSpatialPlan(null);
  }
}

export { DEMO_MODES };
export type { SceneMode, SceneSpec };
