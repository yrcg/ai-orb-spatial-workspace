import { AIOrbChat } from './component';
import { LiquidOrb } from './liquid/LiquidOrb';
import { registerOrb } from './renderers';
import type { OrbOptions } from './options';

// 默认渲染体：液态球（Q11：换球只需再 registerOrb + 改 config.orb）
registerOrb('liquid', (canvas, options) => new LiquidOrb(canvas, options.orbPreset));

if (!customElements.get('ai-orb-chat')) {
  customElements.define('ai-orb-chat', AIOrbChat);
}

export { AIOrbChat };
export { LiquidOrb };
export { registerOrb, listOrbs, getOrbFactory } from './renderers';
export type { OrbRenderer, OrbFactory, AudioBands, OrbVisualState, UniformOverrides } from './renderers';
export type { OrbOptions } from './options';
export { DEFAULT_OPTIONS } from './options';
export type { OrbPhase, VoiceState } from './component';
export { ChatLayer } from './ChatLayer';
export type { ChatMessage, ChatRole } from './ChatLayer';
export { AudioReactive } from './AudioReactive';
export type { AudioTap, TapKind } from './AudioReactive';
