/**
 * mic-capture-worklet.js — 麦克风 PCM 采集处理器（AudioWorklet，跑在音频渲染线程）
 *
 * 为什么用 AudioWorklet 而不是 ScriptProcessorNode：
 *   ① 上游官方 Demo 的实时链路就是 AudioWorklet 为主；
 *   ② 它跑在音频线程，不会被主线程 GC / 渲染卡顿打断，丢帧更少；
 *   ③ ScriptProcessorNode 已废弃，在部分浏览器上行为不稳。
 *   —— 主线程仍保留 ScriptProcessor 回退（老浏览器 / worklet 加载失败时）。
 *
 * 帧长：主线程按 ~100ms 请求分片。VAD（判断用户是否在说话）需要细粒度，
 *       所以这里必须小步吐数据，不能攒到 1s 才发。
 *
 * 与主线程的约定：
 *   收：port.postMessage({ command: 'start' | 'stop' })
 *   发：port.postMessage({ type: 'chunk', samples: Float32Array }, [samples.buffer])
 *
 * 注意：必须把输入直通到输出（pass-through）。AudioWorkletNode 只有在被
 * 下游“拉取”时才会执行 process()，所以输出端要连到 destination（经 0 增益
 * 节点，避免把麦克风原声放出来造成啸叫）。
 */
class PetMicCapture extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const opt = (options && options.processorOptions) || {};
    this._chunk = Math.max(128, (opt.chunkSamples | 0) || 1600);
    this._buf = new Float32Array(0);
    this._active = false;

    this.port.onmessage = (e) => {
      const cmd = e.data && e.data.command;
      if (cmd === "start") {
        this._active = true;
        this._buf = new Float32Array(0);
      } else if (cmd === "stop") {
        this._flush();
        this._active = false;
        this._buf = new Float32Array(0);
      }
    };
  }

  _flush() {
    if (this._buf.length) {
      const tail = this._buf.slice(0);
      this._buf = new Float32Array(0);
      this.port.postMessage({ type: "chunk", samples: tail }, [tail.buffer]);
    }
  }

  process(inputs, outputs) {
    const inp = inputs[0] && inputs[0][0];
    const out = outputs[0] && outputs[0][0];

    // 直通：既是驱动条件，也让下游（MediaStreamDestination / 监听）可用
    if (inp && out) out.set(inp);

    if (!this._active || !inp || inp.length === 0) return true;

    const merged = new Float32Array(this._buf.length + inp.length);
    merged.set(this._buf, 0);
    merged.set(inp, this._buf.length);
    this._buf = merged;

    while (this._buf.length >= this._chunk) {
      const s = this._buf.slice(0, this._chunk);
      this._buf = this._buf.slice(this._chunk);
      this.port.postMessage({ type: "chunk", samples: s }, [s.buffer]);
    }
    return true;
  }
}

registerProcessor("pet-mic-capture", PetMicCapture);
