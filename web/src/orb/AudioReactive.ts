import type { AudioBands } from './renderers';

/**
 * 音频响应：把「用户麦」与「AI 播放总线」两路音源分频段后，喂给悬浮球。
 *
 * 取音点（Q5）：
 *   · mic（用户说话）—— 复用上行链路已有的麦克风流，挂一个 AnalyserNode 取包络，
 *     不额外开麦、不产生第二次授权。
 *   · bus（AI 说话）—— 在播放总线上插一个 AnalyserNode，直接从下行音频取包络。
 *
 * 本类**不**自己 getUserMedia / 不自己建 AudioContext —— 那两个上下文由宿主持有，
 * 这里只接收已建好的 AnalyserNode。宿主用 setSource('mic' | 'bus' | null)
 * 告知当前该听哪一路（通常由中继的语音状态驱动）。
 *
 * 包络平滑（Q5）：非对称——起音快（attack）、释放慢（release）。
 * 这是「有生命感」的关键，调用方不要再平滑一次。
 */

export type TapKind = 'mic' | 'bus';

export interface AudioTap {
  analyser: AnalyserNode;
  ctx: AudioContext;
}

/** 频段定义（Hz） */
const BANDS: Array<[keyof AudioBands, number, number]> = [
  ['low', 20, 250],
  ['mid', 250, 2000],
  ['high', 2000, 8000],
];

export class AudioReactive {
  #target: (bands: AudioBands) => void;
  #spectrumTarget: ((levels: Float32Array) => void) | null;
  #taps: Record<TapKind, AudioTap | null> = { mic: null, bus: null };
  #source: TapKind | null = null;
  #bands: AudioBands = { low: 0, mid: 0, high: 0, all: 0 };
  #raw: AudioBands = { low: 0, mid: 0, high: 0, all: 0 };
  #freq: Uint8Array<ArrayBuffer> | null = null;
  #wave: Float32Array<ArrayBuffer> | null = null;
  #raf = 0;
  #last = 0;
  #running = false;
  /**
   * 起音快 / 释放慢。
   *
   * ⚠ 这两个值曾经写反过（0.42 / 0.045）：一个音节才 150–300ms，等 420ms 的包络
   * 爬上去字已经说完，然后 45ms 内瞬间归零——看起来就是「软绵绵动一下」。
   * 正确方向：起音 ~45ms（跟上字头），释放 ~280ms（留出余韵与回弹）。
   */
  #attack = 0.045;
  #release = 0.28;
  /** 32 段对数频谱（供声场环），与 bands 使用同一套非对称包络 */
  #detail = new Float32Array(32);
  #detailRaw = new Float32Array(32);

  constructor(
    target: (bands: AudioBands) => void,
    spectrumTarget?: (levels: Float32Array) => void,
  ) {
    this.#target = target;
    this.#spectrumTarget = spectrumTarget ?? null;
  }

  get bands(): Readonly<AudioBands> {
    return { ...this.#bands };
  }

  get source(): TapKind | null {
    return this.#source;
  }

  /** 挂载 / 卸载一路取音点（宿主在开麦、建立播放总线时调用） */
  attach(kind: TapKind, tap: AudioTap | null): void {
    this.#taps[kind] = tap;
    if (kind === this.#source) {
      this.#freq = tap ? new Uint8Array(new ArrayBuffer(tap.analyser.frequencyBinCount)) : null;
      this.#wave = tap ? new Float32Array(new ArrayBuffer(tap.analyser.fftSize)) : null;
    }
  }

  /** 切换当前音源；传 null 停止律动 */
  setSource(kind: TapKind | null): void {
    if (kind === this.#source) return;
    this.#source = kind;
    const tap = kind ? this.#taps[kind] : null;
    this.#freq = tap ? new Uint8Array(new ArrayBuffer(tap.analyser.frequencyBinCount)) : null;
    this.#wave = tap ? new Float32Array(new ArrayBuffer(tap.analyser.fftSize)) : null;
    if (!tap) {
      this.#raw = { low: 0, mid: 0, high: 0, all: 0 };
      this.#detailRaw.fill(0);
    }
  }

  start(): void {
    if (this.#running) return;
    this.#running = true;
    this.#last = performance.now();
    this.#raf = requestAnimationFrame(this.#tick);
  }

  stop(): void {
    this.#running = false;
    cancelAnimationFrame(this.#raf);
    this.#raw = { low: 0, mid: 0, high: 0, all: 0 };
    this.#bands = { low: 0, mid: 0, high: 0, all: 0 };
    this.#detailRaw.fill(0);
    this.#detail.fill(0);
    this.#target(this.#bands);
    // 声场环必须一起归零：否则挂断后环上还留着最后一帧的频谱，
    // 视觉上像是"还在说话"。
    this.#spectrumTarget?.(this.#detail);
  }

  #tick = (now: number): void => {
    if (!this.#running) return;
    this.#raf = requestAnimationFrame(this.#tick);
    const dt = Math.min(0.1, Math.max(0.001, (now - this.#last) / 1000));
    this.#last = now;

    const tap = this.#source ? this.#taps[this.#source] : null;
    const analyser = tap?.analyser ?? null;
    const freq = this.#freq;
    const wave = this.#wave;
    if (!analyser || !freq || !wave || !tap) {
      this.#raw = { low: 0, mid: 0, high: 0, all: 0 };
      this.#emit();
      return;
    }

    analyser.getByteFrequencyData(freq);
    analyser.getFloatTimeDomainData(wave);

    let sumSq = 0;
    for (let i = 0; i < wave.length; i++) sumSq += wave[i] * wave[i];
    const rms = Math.sqrt(sumSq / Math.max(1, wave.length));

    const nyquist = (tap.ctx.sampleRate || 48000) / 2;
    const binHz = nyquist / freq.length;
    const acc: AudioBands = { low: 0, mid: 0, high: 0, all: 0 };
    let total = 0;
    for (const [key, lo, hi] of BANDS) {
      const i0 = Math.max(0, Math.floor(lo / binHz));
      const i1 = Math.min(freq.length - 1, Math.ceil(hi / binHz));
      let sum = 0;
      for (let i = i0; i <= i1; i++) sum += freq[i];
      const avg = i1 >= i0 ? sum / (i1 - i0 + 1) / 255 : 0;
      acc[key] = avg;
      total += avg;
    }
    const all = Math.min(1, Math.max(0, rms - 0.004) * 5.5);
    // 增益整体上调：原值在正常说话时 mid 只有 0.2-0.3，驱动形变几乎看不出来。
    this.#raw = {
      low: Math.min(1, acc.low * 1.9),
      mid: Math.min(1, acc.mid * 2.5),
      high: Math.min(1, acc.high * 2.2),
      all: Math.max(all, Math.min(1, (total / 3) * 2.0)),
    };
    this.#readDetail(freq, binHz);
    this.#emit(dt);
  };

  /** 32 段对数频谱：低频占更多段，和人耳感知对齐 */
  #readDetail(freq: Uint8Array, binHz: number): void {
    const n = this.#detailRaw.length;
    const lo = 80;
    const hi = Math.min(10000, binHz * freq.length);
    const logLo = Math.log(lo);
    const logHi = Math.log(hi);
    for (let k = 0; k < n; k++) {
      const f0 = Math.exp(logLo + (logHi - logLo) * (k / n));
      const f1 = Math.exp(logLo + (logHi - logLo) * ((k + 1) / n));
      const i0 = Math.max(0, Math.floor(f0 / binHz));
      const i1 = Math.min(freq.length - 1, Math.max(i0, Math.ceil(f1 / binHz) - 1));
      let sum = 0;
      for (let i = i0; i <= i1; i++) sum += freq[i];
      const avg = sum / Math.max(1, i1 - i0 + 1) / 255;
      // 高频能量天然偏低，做一点倾斜补偿，避免右半边永远是平线
      const tilt = 1 + (k / n) * 0.9;
      this.#detailRaw[k] = Math.min(1, avg * 3.0 * tilt);
    }
  }

  #emit(dt = 1 / 60): void {
    const smooth = (cur: number, next: number, attack = this.#attack, release = this.#release): number => {
      const tau = next > cur ? attack : release;
      // 与上游一致的指数包络：起音快、释放慢
      const k = 1 - Math.exp(-dt / Math.max(1e-4, tau));
      return cur + (next - cur) * k;
    };
    this.#bands = {
      low: smooth(this.#bands.low, this.#raw.low),
      mid: smooth(this.#bands.mid, this.#raw.mid),
      high: smooth(this.#bands.high, this.#raw.high),
      all: smooth(this.#bands.all, this.#raw.all),
    };
    for (const k of ['low', 'mid', 'high', 'all'] as const) {
      if (this.#bands[k] < 0.0001) this.#bands[k] = 0;
    }
    this.#target(this.#bands);

    if (this.#spectrumTarget) {
      for (let i = 0; i < this.#detail.length; i++) {
        this.#detail[i] = smooth(this.#detail[i], this.#detailRaw[i], 0.05, 0.30);
        if (this.#detail[i] < 0.0008) this.#detail[i] = 0;
      }
      this.#spectrumTarget(this.#detail);
    }
  }
}
