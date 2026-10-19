import type { RendererCapabilities, SurfaceSpec } from '../types';

export interface SurfaceSize {
  w: number;
  h: number;
}

/**
 * 渲染器实例：只负责「内容怎么画」，不关心自己放在哪。
 * 外层的位置、尺寸、标题栏、过渡由 <ai-spatial-stage> 统一处理。
 */
export interface SurfaceView {
  readonly el: HTMLElement;
  update(spec: SurfaceSpec, size: SurfaceSize): void;
  dispose(): void;
}

/**
 * 渲染器适配器：展示源扩展点之一。
 *
 * capabilities 同时用于两件事：
 * 1. SLO 判断这个内容在当前槽位放不放得下；
 * 2. 生成系统提示词时告诉模型「当前有哪些展示能力、各自多大」。
 */
export interface RendererAdapter {
  readonly kind: string;
  readonly capabilities: RendererCapabilities;
  create(): SurfaceView;
}

const registry = new Map<string, RendererAdapter>();

export function registerRenderer(adapter: RendererAdapter): void {
  if (!adapter.kind) throw new Error('[spatial] renderer.kind 不能为空');
  registry.set(adapter.kind, adapter);
}

export function getRenderer(kind: string): RendererAdapter | null {
  return registry.get(kind) ?? null;
}

export function listRenderers(): RendererAdapter[] {
  return [...registry.values()];
}

const FALLBACK_CAPABILITIES: RendererCapabilities = {
  min: [240, 160],
  interaction: 'none',
  cost: 'low',
  fullscreen: false,
};

export function capabilitiesOf(kind: string): RendererCapabilities {
  return registry.get(kind)?.capabilities ?? FALLBACK_CAPABILITIES;
}

/** 通用兜底视图：未知 kind 不崩，只显示一条可读提示。 */
export function createFallbackView(kind: string): SurfaceView {
  const el = document.createElement('div');
  el.className = 'sp-fallback';
  el.textContent = `未注册的展示类型：${kind}`;
  return {
    el,
    update() { /* 静态提示，无需更新 */ },
    dispose() { el.remove(); },
  };
}
