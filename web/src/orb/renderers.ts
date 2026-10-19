/**
 * 悬浮球渲染体接口 + 注册表（Q11：悬浮球可替换）。
 *
 * 组件只依赖这个接口，不关心背后是 WebGPU 液态球、CSS 球还是 Lottie。
 * 想换一种球：实现 OrbRenderer，调用 registerOrb('myOrb', factory)，
 * 再把宿主 config 里的 orb 字段改成 'myOrb' 即可。
 */

import type { OrbOptions } from './options';

/**
 * 视觉状态：与界面阶段、语音状态合成后的最终形态。
 * dock 与 idle 分开：停靠态要更鲜明（用思考态的配色），但不能真的进入思考，
 * 否则宿主很难区分「缩在角落等你」和「正在处理你的问题」。
 */
export type OrbVisualState = 'idle' | 'dock' | 'active' | 'thinking' | 'listening' | 'speaking';

/** 音频频段（0-1，已平滑） */
export interface AudioBands {
  low: number;
  mid: number;
  high: number;
  all: number;
}

/** 每帧覆写（组件把叙事包络与面板参数经此下发） */
export interface UniformOverrides {
  radiusScale?: number;
  speedScale?: number;
  exposureScale?: number;
  edgeGlow?: number;
  /** 直接按 uniform 索引覆写（面板参数走这里） */
  byIndex?: Record<number, number>;
}

export interface OrbRenderer {
  /** 初始化；返回 false 表示环境不支持（组件负责降级提示） */
  init(): Promise<boolean>;
  /** 目标视觉形态 */
  setVisualState(state: OrbVisualState): void;
  /** 音频频段（0-1，已平滑）；传 undefined 停止律动 */
  setAudioBands(bands?: Partial<AudioBands>): void;
  /** 每帧覆写 */
  setOverrides(overrides: UniformOverrides): void;
  /** 释放资源 */
  destroy(): void;
}

export type OrbFactory = (canvas: HTMLCanvasElement, options: Readonly<OrbOptions>) => OrbRenderer;

const REGISTRY = new Map<string, OrbFactory>();

export function registerOrb(name: string, factory: OrbFactory): void {
  REGISTRY.set(name, factory);
}

export function getOrbFactory(name: string): OrbFactory | null {
  return REGISTRY.get(name) ?? null;
}

export function listOrbs(): string[] {
  return [...REGISTRY.keys()];
}
