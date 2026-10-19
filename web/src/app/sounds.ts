/**
 * 声音（Q8/Q10）：全部用 WebAudio 现场合成，零音频文件。
 *
 *   ready —— 接通提示音（C5→E5→A5 上行，约 2.2s）
 *   exit  —— 退出/挂断音（A5→E5→C5 下行，约 1.1s，柔和）  ← 新增
 *   error —— 出错音（440→330Hz 两短促，音量低，不刺耳）    ← 新增
 *   tool  —— 慢工具「查询中」提示（A4→E5）
 *
 * 全部走宿主提供的播放总线（gain），因此也会被「打断」一并停掉，
 * 并且必须计入回声门禁（它们同样从扬声器出去）。
 */

export interface SoundBus {
  ctx: AudioContext;
  destination: AudioNode;
  /** 响铃期间置一个"门禁截止时刻"，用于避免自己的提示音触发一轮"用户说话" */
  hold(ms: number): void;
}

type Note = [freq: number, offset: number, duration: number];

export class Sounds {
  #bus: () => SoundBus | null;

  constructor(bus: () => SoundBus | null) {
    this.#bus = bus;
  }

  #play(notes: Note[], volume: number): void {
    const bus = this.#bus();
    if (!bus) return;
    try {
      const { ctx, destination } = bus;
      const t0 = ctx.currentTime + 0.05;
      const g = ctx.createGain();
      g.gain.value = volume;
      g.connect(destination);
      let end = 0;
      for (const [freq, off, dur] of notes) {
        const o = ctx.createOscillator();
        const env = ctx.createGain();
        o.type = 'sine';
        o.frequency.value = freq;
        const s = t0 + off;
        env.gain.setValueAtTime(0.0001, s);
        env.gain.exponentialRampToValueAtTime(1, s + Math.min(0.05, dur * 0.2));
        env.gain.exponentialRampToValueAtTime(0.0001, s + dur);
        o.connect(env);
        env.connect(g);
        o.start(s);
        o.stop(s + dur + 0.02);
        end = Math.max(end, off + dur);
      }
      bus.hold(Math.round((end + 0.15) * 1000));
    } catch {
      /* 出声失败绝不影响主链路 */
    }
  }

  /** 接通：柔和的 C5→E5→A5 上行 */
  ready(): void {
    this.#play([[523.25, 0, 0.85], [659.25, 0.4, 0.85], [880.0, 0.8, 1.45]], 0.18);
  }

  /** 退出/挂断：A5→E5→C5 下行，柔和收尾 */
  exit(): void {
    this.#play([[880.0, 0, 0.5], [659.25, 0.34, 0.5], [523.25, 0.68, 0.7]], 0.14);
  }

  /** 出错：两短促下行，音量低、不刺耳 */
  error(): void {
    this.#play([[440.0, 0, 0.16], [330.0, 0.2, 0.22]], 0.1);
  }

  /** 慢工具「查询中」：很轻的两音上行 */
  tool(): void {
    this.#play([[440.0, 0, 0.16], [659.25, 0.13, 0.22]], 0.12);
  }
}
