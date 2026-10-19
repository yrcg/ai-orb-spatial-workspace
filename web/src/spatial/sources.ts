import type { SurfaceSpec } from './types';

/**
 * 内容来源适配器：展示源扩展点之二。
 *
 * 渲染器解决「怎么画」，来源解决「内容从哪来」。
 * 两者解耦后，同一个表格视图既能吃本地数据，也能吃 MCP / 图表服务 / 知识库。
 */
export interface SourceAdapter {
  readonly type: string;
  resolve(spec: SurfaceSpec, signal: AbortSignal): Promise<unknown>;
}

const sources = new Map<string, SourceAdapter>();

export function registerSource(adapter: SourceAdapter): void {
  if (!adapter.type) throw new Error('[spatial] source.type 不能为空');
  sources.set(adapter.type, adapter);
}

export function getSource(type: string): SourceAdapter | null {
  return sources.get(type) ?? null;
}

export function listSources(): SourceAdapter[] {
  return [...sources.values()];
}

const inlineSource: SourceAdapter = {
  type: 'inline',
  resolve: async (spec) => spec.data,
};

/**
 * 演示用的异步来源：模拟「内容比布局晚到」。
 * 布局先按占位尺寸完成，数据到了再填充——这条路径接近真实工具调用。
 */
const mockSource: SourceAdapter = {
  type: 'mock',
  resolve: async (spec, signal) => {
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(resolve, 420);
      signal.addEventListener('abort', () => {
        window.clearTimeout(timer);
        reject(new DOMException('aborted', 'AbortError'));
      }, { once: true });
    });
    return spec.data;
  },
};

registerSource(inlineSource);
registerSource(mockSource);

export async function resolveSurfaceData(
  spec: SurfaceSpec,
  signal: AbortSignal,
): Promise<unknown> {
  const type = spec.source ?? 'inline';
  const adapter = getSource(type);
  if (!adapter) return spec.data;
  return adapter.resolve(spec, signal);
}
