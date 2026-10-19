import {
  DEFAULT_OPTIONS, type VoiceState, type ChatMessage, type AudioBands, type AudioTap, type TapKind,
} from '../orb';
import type { AIOrbChat } from '../orb';
import { AudioReactive } from '../orb';
import { CONFIG } from './config';
import { QWEN_TOOLS, TOOL_LABEL, SLOW_TOOLS, runToolOnce } from './tools';
import { extractChartBlocks, type ChartBlock } from '../spatial/chartMarkdown';
import { Sounds, type SoundBus } from './sounds';

/**
 * 中继客户端：把旧版 index.html 里已经调通的全双工链路（协议、打断、工具、
 * 麦克风降级、字幕跟读）原样搬进新界面（Q4/Q5/Q9）。
 *
 * 链路：麦克风(16k) → 中继(server.py) → 通义千问 Audio Realtime
 *       上游 audio.delta(24k PCM16) → 播放总线（同时挂 AnalyserNode 取包络）
 */

const IN_RATE = 16000;
const OUT_RATE = 24000;
const PLAY_LEAD_S = 0.2;

const RELAY_SECURE = location.protocol === 'https:';
const RELAY_HOST = ((location.port === '8770' || RELAY_SECURE) && location.hostname)
  ? location.host : '127.0.0.1:8770';
const relayBase = (): string => `${RELAY_SECURE ? 'wss' : 'ws'}://${RELAY_HOST}`;
const wsUrl = (mode: string): string => `${relayBase()}/ws?mode=${mode}`;
export const RELAY_HTTP = `${RELAY_SECURE ? 'https' : 'http'}://${RELAY_HOST}`;

export async function probeRelay(): Promise<boolean> {
  try {
    const r = await fetch(`${RELAY_HTTP}/health`, { cache: 'no-store' });
    return r.ok;
  } catch {
    return false;
  }
}

const SYSTEM_PROMPT = [
  '你是「瀚涛百事通」，一个聪明、亲切、反应快的中文语音助手，此刻正在和用户**打电话**。',
  '【说话风格】像真人聊天一样自然、口语化；回答**简短**，通常一到三句话，不要长篇大论。',
  '  不要输出 emoji、markdown、列表、编号或括号里的旁白；你的每一个字都会被读出来。',
  '  不要动不动就自我介绍或说「作为一个人工智能助手」；除非用户问起，不要报家门。',
  '【倾听与打断】你是全双工的，可以一边听一边说。用户随时可能插话——',
  '  一旦用户开口，立刻停下、先听用户说完，再自然地接住新内容，不要抢话、不要自顾自说完。',
  '  用户只是「嗯」「对」这类附和时，可以继续把话说完，不必每次都让位。',
  '【查资料】凡是涉及**公司自身事务**（规章制度、办事流程、报销发票、入职离职、考勤请假、',
  '  年假、加班出差、补贴、薪酬绩效、培训、合同、组织部门、项目、系统账号等），',
  '  你必须**先调用 query_company_policy 查到资料再回答**，绝对不许凭印象编造公司信息。',
  '  查到资料后，用你自己的话**简要口语化地复述重点**（先给结论和关键数字），',
  '  不要逐字照读原文条款，也不要罗列一大批细节。',
  '  问到日期、时间、今天几号、星期几、现在几点时，调用 get_datetime，不要凭记忆回答。',
  '  不要在回答里出现「工具」「知识库」「查询结果」「根据资料」这类字眼，',
  '  直接把结果当成你本来就知道的事情，自然地讲出来。',
].join('');

// ── PCM 编解码 ──
function f32ToI16B64(f32: Float32Array): string {
  const n = f32.length;
  const bytes = new Uint8Array(n * 2);
  const dv = new DataView(bytes.buffer);
  for (let i = 0; i < n; i++) {
    const v = Math.max(-1, Math.min(1, f32[i] || 0));
    dv.setInt16(i * 2, v < 0 ? v * 0x8000 : v * 0x7fff, true);
  }
  let bin = '';
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH) as unknown as number[]);
  return btoa(bin);
}
function b64I16ToF32(b64: string): Float32Array<ArrayBuffer> {
  const bin = atob(b64);
  const n = bin.length >> 1;
  const bytes = new Uint8Array(n * 2);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i) & 0xff;
  const dv = new DataView(bytes.buffer);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = dv.getInt16(i * 2, true) / 32768;
  return out;
}
function resample(input: Float32Array, inRate: number, outRate: number): Float32Array {
  if (inRate === outRate) return input;
  const ratio = outRate / inRate;
  const outLen = Math.round(input.length * ratio);
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const pos = i / ratio;
    const i0 = Math.floor(pos);
    const i1 = Math.min(i0 + 1, input.length - 1);
    const t = pos - i0;
    out[i] = input[i0] * (1 - t) + input[i1] * t;
  }
  return out;
}
function rms(a: Float32Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i += 16) s += a[i] * a[i];
  return Math.sqrt(s / Math.max(1, a.length / 16));
}

export interface RelayEvents {
  onState(text: string, kind?: 'ok' | 'err' | 'info' | 'sys'): void;
  onError(text: string): void;
  onVoice(state: VoiceState): void;
}

/**
 * 一条链路上的「发起新一轮回答」状态。
 *
 * 语音与文字是两条独立 WS，各持一份；共用会把彼此的 responseOpen 弄脏
 * （症状：一边工具查完永远不再续答）。
 *
 * ⚠ 上游（Qwen-Audio Realtime）同一时刻只允许一轮回答：在一轮还没结束时再发
 *   response.create 会直接返回 error
 *   "Cannot create response while another response is in progress."，
 *   表现为用户说完一句后没有下文。所以所有 response.create 都必须经过
 *   #sendCreate() 这一个闸门，而不是随手 ws.send。
 */
interface FcState {
  /** 上游是否有一轮在生成（response.created → response.done） */
  responseOpen: boolean;
  /** 有新的 response.create 待发（等本轮结束 / 等工具回灌） */
  pending: boolean;
  gen: number;
  pendingGen: number;
  /** 正在执行的工具数（并行调用时要全部回灌完才能续答） */
  toolsInFlight: number;
}

export class RelayClient {
  #orb: AIOrbChat;
  #ev: RelayEvents;
  #sounds: Sounds;
  #audio: AudioReactive;

  #ws: WebSocket | null = null;
  #textWs: WebSocket | null = null;
  #micOn = false;
  #micStream: MediaStream | null = null;
  #micCtx: AudioContext | null = null;
  #micNode: AudioWorkletNode | ScriptProcessorNode | null = null;
  #micSrc: MediaStreamAudioSourceNode | null = null;
  #micMute: GainNode | null = null;
  #micDeviceId: string | null = null;

  #outCtx: AudioContext | null = null;
  #outGain: GainNode | null = null;
  #nextPlay = 0;
  #srcs = new Set<AudioBufferSourceNode>();
  #playTimer = 0;
  #dropAudio = false;
  #holdUntil = 0;
  #lastPlayStart = 0;

  #chunkBuf: Float32Array[] = [];
  #micSamples = 0;
  #sessionReady = false;
  #sessionLabel = '';
  #aec = CONFIG.aec;
  #chunkMs = CONFIG.chunkMs;
  /** 通话世代：每次开/关递增，异步回调据此判断"这次连接还作数吗" */
  #epoch = 0;
  /** 用户主动挂断标志：用于抑制 onclose 的重复提示/重复音效 */
  #manualStop = false;
  /** 瞬时状态序号：防止旧的延时回退覆盖新状态 */
  #statusEpoch = 0;
  /** 文字链路是否正在等一轮回答（打断按钮据此判断） */
  #textBusy = false;
  /** 文字提问串行队列 */
  #textChain: Promise<void> = Promise.resolve();
  /** 文字 WS 是否已发过 session.update（每条连接只配置一次） */
  #textConfigured = false;

  // 字幕跟读
  #capText = '';
  #capActive = false;
  #capAudioSeen = false;
  #capStart: number | null = null;
  #capTimer = 0;

  // FC 时序
  #fc = { responseOpen: false, pending: false, gen: 0, pendingGen: -1, toolsInFlight: 0, toolCalls: [] as Array<{ callId: string | null; name: string }> };
  /** 文字链路的续答状态：跨多次提问保留（text WS 是复用的，不能每次提问重置） */
  #textFc: FcState = { responseOpen: false, pending: false, gen: 0, pendingGen: -1, toolsInFlight: 0 };
  #curAsstOpen = false;

  // 本地 VAD（只用于界面状态，不建/删气泡）
  #vad = { noise: 0.004, active: false, voiceRun: 0, lastVoice: 0, len: 0, frames: 0, pre: [] as Float32Array[], preLen: 0 };
  #wasSpeaking = false;

  constructor(orb: AIOrbChat, ev: RelayEvents) {
    this.#orb = orb;
    this.#ev = ev;
    this.#audio = new AudioReactive(
      (bands: AudioBands) => orb.setAudioBands(bands),
      (levels: Float32Array) => orb.setAudioSpectrum(levels),
    );
    this.#sounds = new Sounds(() => this.#soundBus());
  }

  get sounds(): Sounds { return this.#sounds; }
  get audio(): AudioReactive { return this.#audio; }
  get connected(): boolean { return !!this.#ws && this.#ws.readyState === 1; }
  get inCall(): boolean { return !!this.#ws && (this.#ws.readyState === 0 || this.#ws.readyState === 1); }
  get micDeviceId(): string | null { return this.#micDeviceId; }

  setMicDevice(id: string | null): void {
    this.#micDeviceId = id;
    if (this.#micOn) { this.stopMic(); window.setTimeout(() => void this.startMic(), 300); }
  }
  setAec(on: boolean): void { this.#aec = on; }
  setChunkMs(ms: number): void { this.#chunkMs = ms; }
  setUpGate(on: boolean): void { CONFIG.upGate = on; }

  #soundBus(): SoundBus | null {
    const ctx = this.#ensureOutCtx();
    if (!ctx || !this.#outGain) return null;
    return {
      ctx,
      destination: this.#outGain,
      hold: (ms: number) => { this.#holdUntil = Math.max(this.#holdUntil, performance.now() + ms); },
    };
  }

  // ───────────────────────── 通话 ─────────────────────────

  async startVoice(): Promise<void> {
    if (this.inCall) return;
    const epoch = ++this.#epoch;
    this.#manualStop = false;
    this.#ev.onState('连接中…', 'info');
    this.#ev.onVoice('thinking');
    this.#fc = { responseOpen: false, pending: false, gen: 0, pendingGen: -1, toolsInFlight: 0, toolCalls: [] };

    if (!(await probeRelay())) {
      if (epoch !== this.#epoch) return;
      this.#ev.onError(`中继未连接（${RELAY_HOST}）。请先运行 server.py，再用 http://${RELAY_HOST} 打开本页。`);
      this.#sounds.error();
      this.#ev.onVoice('idle');
      return;
    }
    // 探测期间用户已经收起 → 放弃这次连接（否则会留下"看不见的通话"）
    if (epoch !== this.#epoch) return;

    this.#sessionReady = false;
    this.#dropAudio = false;
    const ws = new WebSocket(wsUrl('audio'));
    this.#ws = ws;
    ws.onopen = () => {
      if (epoch !== this.#epoch) { try { ws.close(); } catch { /* ignore */ } return; }
      this.#ev.onState('初始化…');
      this.#sendSessionUpdate();
    };
    ws.onclose = (e) => {
      if (this.#ws !== ws) return;
      this.#ws = null;
      this.stopMic();
      this.#vadReset();
      this.#ev.onState('已断开');
      this.#ev.onVoice('idle');
      this.#audio.setSource(null);
      // 主动挂断的音效由 stopVoice 统一播放，这里只在"意外断开"时补提示
      if (this.#manualStop) return;
      if (e && e.code && e.code !== 1000 && e.code !== 1005) {
        this.#sounds.error();
        this.#ev.onError(`通话断开（code ${e.code}${e.reason ? ` ${e.reason}` : ''}）`);
      } else {
        this.#sounds.exit();
      }
    };
    ws.onerror = () => {
      if (epoch !== this.#epoch) return;
      this.#ev.onError('WebSocket 连接出错');
      this.#sounds.error();
      this.stopMic();
      this.#ev.onVoice('idle');
      if (this.#ws === ws) { this.#ws = null; try { ws.close(); } catch { /* ignore */ } }
    };
    ws.onmessage = (ev) => { try { this.#onServerMsg(JSON.parse(ev.data)); } catch { /* ignore */ } };
  }

  stopVoice(): void {
    const hadCall = !!this.#ws;
    this.#epoch++;
    this.#manualStop = true;
    // 先封口当前气泡、清掉未落定的占位，避免下次展开时残留半句/「聆听中…」
    this.#endBot(true);
    this.#orb.discardLive();
    this.#orb.setListening(false);
    this.#orb.setThinking(false);
    this.#fc = { responseOpen: false, pending: false, gen: 0, pendingGen: -1, toolsInFlight: 0, toolCalls: [] };
    this.#textBusy = false;
    this.#capActive = false;
    this.#sessionReady = false;
    this.#dropAudio = false;

    this.stopMic();
    this.#vadReset();
    // 退出音要在这条播放总线上放完，再关上下文；否则声音会被 ctx.close() 一起掐掉
    this.#stopSpeech();
    this.#audio.setSource(null);
    if (hadCall) {
      this.#sounds.exit();
      const ctx = this.#outCtx;
      window.setTimeout(() => {
        // 期间若已重新接通，别把新的播放总线关掉
        if (this.inCall || this.#outCtx !== ctx) return;
        this.#flushPlayback();
      }, 1300);
    } else {
      this.#flushPlayback();
    }
    if (this.#ws) { try { this.#ws.close(); } catch { /* ignore */ } this.#ws = null; }
    if (this.#textWs) { try { this.#textWs.close(); } catch { /* ignore */ } this.#textWs = null; }
    this.#ev.onState('未连接');
    this.#ev.onVoice('idle');
  }

  /** 瞬时状态：显示一会儿再自动回到「已连接」，避免状态条永久停在「已打断」 */
  #flashState(text: string, ms = 1400): void {
    const id = ++this.#statusEpoch;
    this.#ev.onState(text);
    window.setTimeout(() => {
      if (id === this.#statusEpoch && this.inCall && !this.#fc.responseOpen) this.#ev.onState('已连接', 'ok');
    }, ms);
  }

  /** 打断当前这一轮（单击球 / 用户抢话）：停播 + 取消请求，回到聆听 */
  interrupt(): boolean {
    if (!this.inCall && !this.#textBusy) return false;
    const wasResponding = this.#fc.responseOpen || this.#textBusy;
    const wasAudible = this.inCall && this.#isSpeaking();
    if (!wasResponding && !wasAudible) return false;
    this.#stopSpeech();
    this.#endBot(true);
    this.#orb.setThinking(false);
    this.#dropAudio = false;
    this.#fc.responseOpen = false;
    // 打断后排队中的续答不再有意义（用户已经不要这一轮了）
    this.#fc.pending = false;
    if (wasResponding) {
      // 文字链路和语音链路是两条 WS：取消必须发到真正在跑这一轮的那条
      const textAlive = this.#textWs && this.#textWs.readyState === 1;
      const target = this.#textBusy && textAlive ? this.#textWs : this.#ws;
      if (target?.readyState === 1) {
        try { target.send(JSON.stringify({ type: 'response.cancel' })); } catch { /* ignore */ }
      }
    }
    this.#textBusy = false;
    this.#flashState(wasAudible ? '— 已打断 —' : '— 已取消 —');
    this.#orb.pulse(0.35);   // 打断也给一次明确回应，而不是"突然没声了"
    if (this.inCall) this.#ev.onVoice('user');
    return true;
  }
  #sendSessionUpdate(): void {
    if (!this.#ws || this.#ws.readyState !== 1) return;
    this.#ws.send(JSON.stringify({
      type: 'session.update',
      session: {
        modalities: ['text', 'audio'],
        voice: 'longanqian',
        instructions: SYSTEM_PROMPT,
        tools: QWEN_TOOLS,
        input_audio_transcription: { model: 'qwen3-asr-flash-realtime', language: 'zh' },
        enable_speech_emotion: true,
        turn_detection: {
          type: 'server_vad', threshold: 0.5, silence_duration_ms: 800,
          prefix_padding_ms: 300, create_response: true, interrupt_response: true,
        },
      },
    }));
  }

  #onServerMsg(m: Record<string, unknown>): void {
    const type = String(m.type || '');
    switch (type) {
      case 'session.created': {
        if (!this.#ws || this.#ws.readyState !== 1) break;
        this.#sessionReady = true;
        const sess = (m.session as { id?: string }) || {};
        this.#sessionLabel = `session ${(sess.id || '').slice(-6)}`;
        this.#ev.onState('通话中', 'ok');
        this.#sounds.ready();
        // 接通的一刻给一个可见的能量脉冲：声音 + 画面同时确认"连上了"
        this.#orb.pulse(0.9);
        void this.startMic();
        break;
      }
      case 'input_audio_buffer.speech_started':
        this.#stopSpeech();
        this.#dropAudio = true;
        this.#onUserSpeaking(true, m.item_id as string | undefined);
        break;
      case 'input_audio_buffer.speech_stopped':
        this.#onUserSpeaking(false, m.item_id as string | undefined);
        break;
      case 'input_audio_buffer.committed':
        this.#fc.gen++;
        break;
      case 'conversation.item.input_audio_transcription.delta': {
        const t = String(m.stash || m.text || '');
        if (t) this.#userAsr(t, m.item_id as string | undefined, false);
        break;
      }
      case 'conversation.item.input_audio_transcription.completed': {
        const t = String(m.transcript || m.stash || '');
        this.#userAsr(t, m.item_id as string | undefined, true);
        break;
      }
      case 'response.created':
        this.#ev.onVoice('thinking');
        this.#fc.responseOpen = true;
        this.#dropAudio = false;
        this.#captionBegin();
        break;
      case 'response.output_item.added': {
        const item = (m.item as { type?: string; name?: string; call_id?: string }) || {};
        if (item.type === 'function_call' && item.name) this.#toolShow(item.name, item.call_id ?? null);
        break;
      }
      case 'response.function_call_arguments.done':
        void this.#runTool(m).catch(() => { /* ignore */ });
        break;
      case 'response.audio_transcript.delta':
        this.#botText(String(m.delta || ''));
        this.#ev.onVoice('ai');
        this.#audio.setSource('bus');
        break;
      case 'response.audio.delta':
        if (this.#dropAudio) break;
        if (m.delta) {
          const f32 = b64I16ToF32(String(m.delta));
          this.#playAudio(f32);
          if (!this.#capAudioSeen) { this.#capAudioSeen = true; this.#capStart = this.#lastPlayStart; }
          this.#ev.onVoice('ai');
          this.#audio.setSource('bus');
        }
        break;
      case 'response.done': {
        const resp = (m.response as { status?: string }) || {};
        const st = resp.status || '';
        this.#fc.responseOpen = false;
        if (st === 'cancelled') {
          this.#stopSpeech();
          this.#endBot(true);
          this.#orb.setThinking(false);
          this.#flashState('— 已打断 —');
          if (this.inCall) this.#ev.onVoice('user');
        } else if (st === 'failed') {
          this.#ev.onError('本轮生成失败');
          this.#sounds.error();
          this.#orb.setThinking(false);
          this.#endBot(false);
          // 失败后必须退出「思考中」：否则球会永远停在思考形态，状态条也不回落
          if (this.inCall) this.#ev.onVoice('user');
          else this.#ev.onVoice('idle');
        } else {
          this.#finishBotWhenSilent();
          this.#orb.setThinking(false);
        }
        // 本轮结束 = 闸门打开：如果工具结果早已回灌、只是被压在队列里，现在补发
        this.#fcFollowUp();
        break;
      }
      case 'error': {
        const emsg = String((m.error as { message?: string })?.message || JSON.stringify(m));
        // 上游并发冲突是我们发早了（不是用户操作错误）：不弹红字，把状态交回闸门自愈
        if (/another response is in progress/i.test(emsg)) break;
        this.#ev.onError(emsg);
        this.#sounds.error();
        // 协议级错误可能不会再有 response.done，这里兜底退出思考态
        this.#orb.setThinking(false);
        this.#fc.responseOpen = false;
        this.#ev.onVoice(this.inCall ? 'user' : 'idle');
        break;
      }
      default:
        break;
    }
  }

  // ───────────────────────── 输出播放 ─────────────────────────

  #ensureOutCtx(): AudioContext | null {
    if (!this.#outCtx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      this.#outCtx = new AC({ sampleRate: OUT_RATE });
      this.#outGain = this.#outCtx.createGain();
      this.#outGain.connect(this.#outCtx.destination);
      // AI 侧律动取音点（Q5）：直接在播放总线上挂 AnalyserNode
      const analyser = this.#outCtx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.6;
      this.#outGain.connect(analyser);
      const tap: AudioTap = { analyser, ctx: this.#outCtx };
      this.#audio.attach('bus', tap);
    }
    if (this.#outCtx.state === 'suspended') void this.#outCtx.resume().catch(() => { /* ignore */ });
    return this.#outCtx;
  }

  #playAudio(f32: Float32Array<ArrayBuffer>): void {
    const ctx = this.#ensureOutCtx();
    if (!ctx || !this.#outGain) return;
    const buf = ctx.createBuffer(1, f32.length, OUT_RATE);
    buf.copyToChannel(f32, 0);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.#outGain);
    const queued = this.#nextPlay > ctx.currentTime;
    const start = queued ? this.#nextPlay : ctx.currentTime + PLAY_LEAD_S;
    src.start(start);
    this.#nextPlay = start + buf.duration;
    this.#lastPlayStart = start;
    this.#srcs.add(src);
    src.onended = () => { this.#srcs.delete(src); };
    if (!this.#playTimer) {
      this.#playTimer = window.setInterval(() => {
        if (this.#outCtx && this.#outCtx.currentTime >= this.#nextPlay - 0.05) {
          window.clearInterval(this.#playTimer);
          this.#playTimer = 0;
          if (this.#orb.voiceState === 'ai') {
            this.#ev.onVoice('user');       // 播完回到"聆听"语义（若仍在通话）
            this.#audio.setSource('mic');
          }
          this.#endBot(false);
        }
      }, 120);
    }
  }

  #isSpeaking(): boolean {
    if (this.#holdUntil && performance.now() < this.#holdUntil) return true;
    return !!(this.#outCtx && this.#nextPlay > this.#outCtx.currentTime + 0.02);
  }

  #stopSpeech(): void {
    for (const s of this.#srcs) { try { s.stop(); } catch { /* ignore */ } }
    this.#srcs.clear();
    if (this.#playTimer) { window.clearInterval(this.#playTimer); this.#playTimer = 0; }
    if (this.#outCtx) this.#nextPlay = this.#outCtx.currentTime;
    this.#holdUntil = 0;
  }

  #flushPlayback(): void {
    this.#stopSpeech();
    if (this.#outCtx) { try { void this.#outCtx.close(); } catch { /* ignore */ } this.#outCtx = null; this.#outGain = null; this.#nextPlay = 0; }
    this.#audio.attach('bus', null);
  }

  // ───────────────────────── 字幕 / 气泡 ─────────────────────────

  #captionBegin(): void {
    this.#captionStop();
    this.#capText = '';
    this.#capActive = true;
    this.#capAudioSeen = false;
    this.#capStart = null;
  }
  #captionStop(): void { if (this.#capTimer) { window.clearInterval(this.#capTimer); this.#capTimer = 0; } }

  #renderCaption(): void {
    if (!this.#capActive || !this.#capText) return;
    if (!this.#capAudioSeen || this.#capStart == null || !this.#outCtx) return;
    const elapsed = Math.max(0, this.#outCtx.currentTime - this.#capStart);
    // 字幕只显示正文：模型若误把围栏也说了，至少界面上不出现一串 JSON
    const visible = extractChartBlocks(this.#capText).text;
    const shown = visible.slice(0, Math.min(visible.length, Math.floor(elapsed * 6.5)));
    if (!shown) return;
    if (!this.#curAsstOpen) { this.#orb.startStream(); this.#curAsstOpen = true; }
    this.#orb.setAssistantLive(shown);
  }

  #botText(delta: string): void {
    this.#capText += delta;
    if (!this.#capActive) { this.#orb.appendStream(delta); this.#curAsstOpen = true; return; }
    if (!this.#capTimer) this.#capTimer = window.setInterval(() => this.#renderCaption(), 60);
    this.#renderCaption();
  }

  #endBot(keepPartial: boolean): void {
    this.#captionStop();
    if (this.#curAsstOpen || (this.#capActive && this.#capText)) {
      const parsed = extractChartBlocks(this.#capText);
      if (parsed.charts.length) this.#emitVisuals(parsed.charts, 'voice');
      if (this.#capActive && parsed.text && !keepPartial) this.#orb.setAssistantLive(parsed.text);
      this.#orb.endStream();
    }
    this.#curAsstOpen = false;
    this.#capActive = false; this.#capAudioSeen = false; this.#capStart = null; this.#capText = '';
  }

  #finishBotWhenSilent(): void {
    let n = 0;
    const tick = (): void => {
      if (++n > 120 || !this.#isSpeaking()) { this.#endBot(false); return; }
      window.setTimeout(tick, 50);
    };
    window.setTimeout(tick, 50);
  }

  #onUserSpeaking(on: boolean, itemId: string | undefined): void {
    if (!on) {
      // 说完了、等转写/等模型：波形收成呼吸点，悬浮球转入「思考」的慢速内流
      this.#orb.setListening(false);
      this.#orb.setThinking(true);
      if (this.inCall && this.#orb.voiceState !== 'thinking') this.#ev.onVoice('thinking');
      return;
    }
    if (this.#curAsstOpen) this.#endBot(true);       // 用户开口 → 上一句 AI 封口
    this.#orb.discardLive();
    this.#orb.setThinking(false);
    this.#orb.setListening(true);                    // 波形：明确"我在听"
    this.#ev.onVoice('user');
    this.#audio.setSource('mic');
    // 每一轮都要重置，否则第一轮成功转写后，后续没转写出来的话永远不会补「没听清」
    this.#userAsrSaw = false;
    this.#userItem = itemId;
    window.setTimeout(() => { this.#asrFallback(itemId); }, 4000);
  }
  #userAsrSaw = false;
  #userItem: string | undefined;
  #userCommittedItem: string | undefined;
  #userAsr(t: string, itemId: string | undefined, done: boolean): void {
    if (done && itemId && itemId === this.#userCommittedItem) return;   // 同一句不重复落定
    this.#userAsrSaw = true;
    this.#userItem = itemId;
    this.#orb.setListening(false);
    this.#orb.beginLive('user');
    this.#orb.setLive(t || '没听清');
    if (done) {
      this.#orb.commitLive(t || '没听清');
      this.#userCommittedItem = itemId;
    }
  }
  #asrFallback(itemId: string | undefined): void {
    if (this.#userAsrSaw || itemId !== this.#userItem) return;
    this.#orb.setListening(false);
    this.#orb.commitLive('没听清');
    this.#userCommittedItem = itemId;
  }

  // ───────────────────────── 工具 ─────────────────────────

  /**
   * 把捕获到的图表交给空间舞台。
   * 走 DOM 事件而不是直接 import 舞台：relay 不认识 spatial，
   * 关闭空间工作区时这条事件也没人监听，语音链路完全不受影响。
   */
  #emitVisuals(charts: ChartBlock[], source?: string): void {
    if (!charts.length) return;
    this.#orb.dispatchEvent(new CustomEvent('orb:visuals', {
      detail: { charts, source: source ?? 'tool' },
      bubbles: true,
      composed: true,
    }));
    this.log('visuals', { count: charts.length, kinds: charts.map((c) => c.kind), source: source ?? 'tool' });
  }

  #toolShow(name: string, callId: string | null): void {
    const label = TOOL_LABEL[name] || name;
    this.#orb.addToolChip(name, callId, label);
    this.#ev.onVoice('thinking');
  }

  async #runTool(m: Record<string, unknown>, ws: WebSocket | null = this.#ws, fc: FcState = this.#fc): Promise<void> {
    const name = String(m.name || '');
    const callId = (m.call_id as string) || null;
    let args: Record<string, unknown> = {};
    try { args = JSON.parse(String(m.arguments || '{}')); } catch { /* 容忍坏参数 */ }

    if (this.#curAsstOpen) this.#endBot(false);       // 工具前的空档 → 封口当前气泡

    fc.toolsInFlight++;
    let out = '';
    let ok = true;
    try {
      out = await runToolOnce(name, args, { tool: () => { if (SLOW_TOOLS.has(name)) this.#sounds.tool(); } });
    } catch (e) {
      out = '（查询失败，请稍后再问一次）';
      ok = false;
      this.#ev.onError(`工具失败：${String((e as Error)?.message || e)}`);
    } finally {
      fc.toolsInFlight = Math.max(0, fc.toolsInFlight - 1);
    }
    if (out.startsWith('（查询失败') || out.startsWith('（没有名为')) ok = false;
    this.#orb.finishToolChip(name, ok, callId, TOOL_LABEL[name] || name);
    this.#orb.pulse(ok ? 0.45 : 0.3);   // 工具查完：球亮一下，表示"拿到了"

    // 关键：图表块在回灌模型之前剥离。
    // 否则语音模型会把 JSON / md 表格当正文念出来，而且它也没必要看到这些数据。
    const parsed = extractChartBlocks(out);
    if (parsed.charts.length) this.#emitVisuals(parsed.charts, name);
    const payload = parsed.text
      || '（数据图表已展示在界面上，请用一两句话概括结论。）';

    if (!ws || ws.readyState !== 1) return;
    // 工具结果可以立刻回灌（conversation.item.create 不受"生成中"限制），
    // 但**发起新一轮必须等这一轮结束**：这个事件到达时上游往往还没发 response.done。
    ws.send(JSON.stringify({
      type: 'conversation.item.create',
      item: { type: 'function_call_output', call_id: callId, output: payload },
    }));
    fc.pending = true;
    fc.pendingGen = fc.gen;
    this.#fcFollowUp(ws, fc);
  }

  /**
   * 唯一允许发 `response.create` 的地方。
   *
   * 上游同一时刻只允许一轮回答，早发会被拒：
   *   "Cannot create response while another response is in progress."
   * 判定条件：本轮已结束（responseOpen=false）**且**没有工具还在跑；
   * 不满足就挂起（pending），由 response.done 回调再补发一次。
   */
  #sendCreate(ws: WebSocket | null, fc: FcState): boolean {
    if (!ws || ws.readyState !== 1) return false;
    if (fc.responseOpen || fc.toolsInFlight > 0) return false;
    ws.send(JSON.stringify({ type: 'response.create' }));
    // 乐观置位：response.created 回来之前不再重复发送
    fc.responseOpen = true;
    fc.pending = false;
    return true;
  }

  #fcFollowUp(ws: WebSocket | null = this.#ws, fc: FcState = this.#fc): void {
    if (!fc.pending) return;
    if (fc.pendingGen !== fc.gen) { fc.pending = false; return; }
    this.#sendCreate(ws, fc);
  }

  // ───────────────────────── 麦克风 ─────────────────────────

  #micLadder(): MediaStreamConstraints[] {
    const dev = this.#micDeviceId ? { deviceId: { exact: this.#micDeviceId } } : {};
    const L: MediaTrackConstraints[] = [];
    L.push({ ...dev, channelCount: 1 });
    if (this.#aec) L.push({ ...dev, channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true });
    if (this.#aec) L.push({ ...dev, echoCancellation: true, noiseSuppression: true });
    if (this.#micDeviceId) L.push({ deviceId: { exact: this.#micDeviceId } });
    return [...L.map((a) => ({ audio: a, video: false })), { audio: true, video: false }];
  }

  async #acquireMic(): Promise<MediaStream> {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      const e = new Error('当前浏览器/上下文不支持 getUserMedia');
      e.name = window.isSecureContext ? 'NotReadableError' : 'SecurityError';
      throw e;
    }
    const ladder = this.#micLadder();
    let last: Error | null = null;
    for (let i = 0; i < ladder.length; i++) {
      try {
        return await navigator.mediaDevices.getUserMedia(ladder[i]);
      } catch (e) {
        last = e as Error;
        const n = (e as Error).name;
        if (n === 'NotAllowedError' || n === 'PermissionDeniedError' || n === 'NotFoundError' || n === 'DevicesNotFoundError') throw e;
        await new Promise((r) => window.setTimeout(r, 220));
      }
    }
    throw last || new Error('未知原因');
  }

  #makeMicCtx(): AudioContext {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    const Ctor = AC as typeof AudioContext;
    try { return new Ctor({ sampleRate: IN_RATE }); } catch { return new Ctor(); }
  }

  async startMic(): Promise<void> {
    if (this.#micOn) return;
    const epoch = this.#epoch;
    let stream: MediaStream;
    try { stream = await this.#acquireMic(); } catch (e) {
      if (epoch !== this.#epoch) return;                 // 挂断后授权才回来 → 静默丢弃
      const name = (e as Error).name || 'MicError';
      this.#ev.onError(`麦克风不可用【${name}】：${(e as Error).message || e}`);
      this.#sounds.error();
      this.stopVoice();
      return;
    }
    // 授权等待期间用户已挂断：立刻释放，别留下"看不见的开麦"
    if (epoch !== this.#epoch || !this.inCall) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    try {
      this.#micStream = stream;
      const ctx = this.#makeMicCtx();
      this.#micCtx = ctx;
      if (ctx.state === 'suspended') await ctx.resume();
      const src = ctx.createMediaStreamSource(stream);
      this.#micSrc = src;
      this.#chunkBuf = [];
      this.#micSamples = 0;
      this.#vadReset();
      this.#micOn = true;

      // 用户侧律动取音点（Q5）：同一路麦克风流再挂一个 AnalyserNode
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.6;
      src.connect(analyser);
      this.#audio.attach('mic', { analyser, ctx });
      this.#audio.setSource(this.#orb.voiceState === 'ai' ? 'bus' : 'mic');
      this.#audio.start();

      await this.#attachCapture(ctx, src);
      // 状态条说「链路」，语音标签说「谁在说」，两者不重复
      this.#ev.onState('已连接', 'ok');
      const tr = stream.getAudioTracks()[0];
      if (tr && this.#orb.voiceState !== 'ai') this.#ev.onVoice('user');
    } catch (e) {
      this.stopMic();
      this.#ev.onError(`音频初始化失败：${(e as Error).message || e}`);
      this.#sounds.error();
    }
  }

  async #attachCapture(ctx: AudioContext, src: MediaStreamAudioSourceNode): Promise<void> {
    const chunkSamples = Math.max(1600, Math.round(ctx.sampleRate * 0.1));
    if (ctx.audioWorklet && typeof AudioWorkletNode !== 'undefined') {
      try {
        await ctx.audioWorklet.addModule('mic-capture-worklet.js');
        const node = new AudioWorkletNode(ctx, 'pet-mic-capture', {
          numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1],
          processorOptions: { chunkSamples },
        });
        node.port.onmessage = (e: MessageEvent) => {
          const d = e.data as { type?: string; samples?: Float32Array };
          if (d && d.type === 'chunk' && d.samples) this.#pushChunk(d.samples, ctx.sampleRate);
        };
        const mute = ctx.createGain(); mute.gain.value = 0;
        src.connect(node); node.connect(mute); mute.connect(ctx.destination);
        this.#micNode = node; this.#micMute = mute;
        node.port.postMessage({ command: 'start' });
        return;
      } catch { /* 回退 ScriptProcessor */ }
    }
    const node = ctx.createScriptProcessor(4096, 1, 1);
    node.onaudioprocess = (e: AudioProcessingEvent) => {
      if (!this.#micOn) return;
      this.#pushChunk(e.inputBuffer.getChannelData(0), ctx.sampleRate);
    };
    const mute = ctx.createGain(); mute.gain.value = 0;
    src.connect(node); node.connect(mute); mute.connect(ctx.destination);
    this.#micNode = node; this.#micMute = mute;
  }

  #pushChunk(samples: Float32Array, rate: number): void {
    if (!this.#micOn) return;
    const out = rate === IN_RATE ? samples : resample(samples, rate, IN_RATE);
    if (!out.length) return;
    this.#chunkBuf.push(out);
    this.#micSamples += out.length;
    const speaking = this.#isSpeaking();
    if (speaking) {
      if (!this.#wasSpeaking) { this.#vadReset(); this.#wasSpeaking = true; }
    } else {
      if (this.#wasSpeaking) this.#wasSpeaking = false;
      try { this.#vadFeed(out); } catch { /* VAD 出错不影响主链路 */ }
    }
    if (this.#micSamples >= Math.round(IN_RATE * this.#chunkMs / 1000)) this.#sendChunk();
  }

  #sendChunk(): void {
    if (!this.#ws || this.#ws.readyState !== 1 || !this.#sessionReady) { this.#chunkBuf = []; this.#micSamples = 0; return; }
    const merged = new Float32Array(this.#micSamples);
    let off = 0;
    for (const b of this.#chunkBuf) { merged.set(b, off); off += b.length; }
    this.#chunkBuf = [];
    this.#micSamples = 0;
    const gated = CONFIG.upGate === true && this.#isSpeaking();
    const payload = gated ? new Float32Array(merged.length) : merged;
    try {
      this.#ws.send(JSON.stringify({ type: 'input_audio_buffer.append', audio: f32ToI16B64(payload) }));
    } catch { /* ignore */ }
  }

  stopMic(): void {
    this.#micOn = false;
    const node = this.#micNode;
    if (node) {
      if ('port' in node) { try { (node as AudioWorkletNode).port.postMessage({ command: 'stop' }); (node as AudioWorkletNode).port.onmessage = null; } catch { /* ignore */ } }
      try { (node as ScriptProcessorNode).onaudioprocess = null; } catch { /* ignore */ }
      try { node.disconnect(); } catch { /* ignore */ }
      this.#micNode = null;
    }
    if (this.#micMute) { try { this.#micMute.disconnect(); } catch { /* ignore */ } this.#micMute = null; }
    if (this.#micSrc) { try { this.#micSrc.disconnect(); } catch { /* ignore */ } this.#micSrc = null; }
    if (this.#micCtx) { void this.#micCtx.close().catch(() => { /* ignore */ }); this.#micCtx = null; }
    if (this.#micStream) { this.#micStream.getTracks().forEach((t) => t.stop()); this.#micStream = null; }
    this.#audio.attach('mic', null);
    this.#audio.stop();
    this.#chunkBuf = [];
    this.#micSamples = 0;
    this.#vadReset();
  }

  // ───────────────────────── 本地 VAD（只驱动状态显示）─────────────────────────

  #vadReset(): void {
    this.#vad = { noise: 0.004, active: false, voiceRun: 0, lastVoice: 0, len: 0, frames: 0, pre: [], preLen: 0 };
  }

  #vadFeed(f32: Float32Array): void {
    if (!this.#sessionReady || !this.#micOn) return;
    const level = rms(f32);
    const now = performance.now();
    if (!this.#vad.active) this.#vad.noise = this.#vad.noise * 0.94 + level * 0.06;
    const thr = Math.max(0.016, Math.min(this.#vad.noise * 3.0, 0.09));
    const voiced = level > thr;
    if (!this.#vad.active) {
      if (voiced) {
        this.#vad.voiceRun++;
        if (this.#vad.voiceRun >= 3) {
          this.#vad.active = true; this.#vad.voiceRun = 0; this.#vad.len = 0; this.#vad.frames = 0;
          this.#vad.lastVoice = now;
          if (this.#orb.voiceState !== 'user') this.#ev.onVoice('user');
        }
      } else this.#vad.voiceRun = 0;
      if (!this.#vad.active) return;
    }
    this.#vad.len += f32.length; this.#vad.frames++;
    if (voiced) this.#vad.lastVoice = now;
    const silentMs = now - this.#vad.lastVoice;
    if (silentMs > 800 || this.#vad.len / IN_RATE >= 30) this.#vadReset();
  }

  // ───────────────────────── 文字链路 ─────────────────────────

  async askText(text: string): Promise<void> {
    // 串行化：同一刻连问两句会让两轮的 message 监听互相抢同一批 delta
    const run = this.#textChain.then(() => this.#askTextOnce(text));
    this.#textChain = run.catch(() => { /* 单次失败不影响后续提问 */ });
    return run;
  }

  async #askTextOnce(text: string): Promise<void> {
    if (this.#curAsstOpen) this.#endBot(true);
    // 用户气泡由 ChatLayer 的 #submit 在派发 orb:submit 前添加，这里不再重复添加

    const inCall = this.inCall;
    // 通话中打字 = 用户主动接过话轮：把正在播的语音回答打断，避免两条回答搅在一个气泡里。
    // ⚠ 只有确实有一轮在生成时才发 response.cancel；否则服务端回
    //   "Conversation has no active response."（实测会多出一条红色错误）
    if (inCall && (this.#fc.responseOpen || this.#isSpeaking())) {
      this.#stopSpeech();
      this.#endBot(true);
      if (this.#fc.responseOpen && this.#ws?.readyState === 1) {
        try { this.#ws.send(JSON.stringify({ type: 'response.cancel' })); } catch { /* ignore */ }
      }
      this.#fc.responseOpen = false;
    }
    if (!inCall) this.#ev.onVoice('thinking');
    this.#orb.setThinking(true);
    this.#textBusy = true;
    const epoch = this.#epoch;

    try {
      let finalText = '';
      await this.#textSession(async (ws) => {
        if (this.#textWs !== ws || ws.readyState !== 1) throw new Error('text_ws_closed');
        // 会话配置每条 WS 只发一次：回答进行中再发 session.update 会被服务端拒绝
        // （实测报 "Cannot update 'turn_detection' while a response is active"）。
        if (!this.#textConfigured) {
          ws.send(JSON.stringify({
            type: 'session.update',
            session: { modalities: ['text', 'audio'], voice: 'longanqian', instructions: SYSTEM_PROMPT, tools: QWEN_TOOLS, turn_detection: null },
          }));
          this.#textConfigured = true;
        }

        // 文字链路的续答状态：跨多次提问**保留**（这条 WS 是复用的，每次提问
        // 新建一份会让上一轮没结束时的 responseOpen 丢失，从而盲发 response.create）。
        const fc: FcState = this.#textFc;
        let out = '';
        let toolWork: Promise<void> | null = null;
        let sawAny = false;

        await new Promise<void>((resolve, reject) => {
          let settled = false;
          const onClose = (): void => {
            if (settled) return;
            settled = true;
            cleanup();
            reject(new Error('text_ws_closed'));
          };
          const cleanup = (): void => {
            ws.removeEventListener('message', onMsg as EventListener);
            ws.removeEventListener('close', onClose);
          };
          const finish = (): void => { if (settled) return; settled = true; cleanup(); resolve(); };
          const fail = (e: Error): void => { if (settled) return; settled = true; cleanup(); reject(e); };

          const onMsg = (ev: MessageEvent): void => {
            let msg: Record<string, unknown>;
            try { msg = JSON.parse(ev.data); } catch { return; }
            const mt = String(msg.type || '');
            switch (mt) {
              case 'response.created':
                fc.responseOpen = true;
                sawAny = true;
                this.#orb.setThinking(false);      // 有回应了：呼吸点让位给文字
                if (!inCall && this.#orb.voiceState !== 'ai') this.#ev.onVoice('thinking');
                break;
              case 'response.audio_transcript.delta':
              case 'response.text.delta':
              case 'response.audio_transcript.done':
              case 'response.text.done': {
                if (mt.endsWith('.delta')) out += String(msg.delta || '');
                else if (!out) out = String(msg.transcript || msg.text || '');
                if (!out) break;
                this.#orb.setThinking(false);
                if (!this.#curAsstOpen) { this.#orb.startStream(); this.#curAsstOpen = true; }
                this.#orb.setAssistantLive(extractChartBlocks(out).text);
                // 通话中打字提问：这次回答没有音频，别把状态改成「说话中」，
                // 否则角标会一直停在说话中、球也停在发声形态。
                if (!inCall && this.#orb.voiceState !== 'ai') this.#ev.onVoice('ai');
                break;
              }
              case 'response.output_item.added': {
                const item = (msg.item as { type?: string; name?: string; call_id?: string }) || {};
                if (item.type === 'function_call' && item.name) this.#toolShow(item.name, item.call_id ?? null);
                break;
              }
              case 'response.function_call_arguments.done':
                toolWork = this.#runTool(msg, ws, fc);
                toolWork.catch(() => { /* 工具失败已在内部提示 */ });
                break;
              case 'response.done': {
                fc.responseOpen = false;
                const status = String((msg.response as { status?: string })?.status || '');
                if (status === 'failed') { fail(new Error('本轮生成失败')); return; }
                // 工具查完必须由客户端续答：等工具结果落定后统一走闸门补发
                const pending = toolWork;
                toolWork = null;
                const afterTools = pending ? pending.then(() => undefined).catch(() => undefined) : Promise.resolve();
                afterTools.then(() => {
                  if (settled) return;
                  // 工具还在跑就先挂着，由 #runTool 末尾的 #fcFollowUp 接管
                  if (fc.toolsInFlight > 0) return;
                  // 工具结果已回灌 → 补发新一轮，继续等它的 response.done
                  if (fc.pending && this.#sendCreate(ws, fc)) return;
                  // 真正收尾这一轮时才记下完整正文（图表块在调用方剥离）
                  if (!fc.responseOpen) { finalText = out; finish(); }
                });
                break;
              }
              case 'error': {
                const emsg = String((msg.error as { message?: string })?.message || 'api_error');
                // 上游并发冲突是"我们发早了"，不是用户错误：这里不弹红字，交给闸门自愈
                if (/another response is in progress/i.test(emsg)) {
                  fc.responseOpen = true;
                  break;
                }
                fail(new Error(emsg));
                break;
              }
              default:
                break;
            }
          };
          ws.addEventListener('message', onMsg as EventListener);
          ws.addEventListener('close', onClose);

          // 上一轮可能还开着（用户打断后立刻再问）：先取消，再开新一轮。
          // 直接发 response.create 会触发 "Cannot create response while another
          // response is in progress."。
          const begin = (): void => {
            if (fc.responseOpen && ws.readyState === 1) {
              try { ws.send(JSON.stringify({ type: 'response.cancel' })); } catch { /* ignore */ }
              fc.responseOpen = false;
            }
            ws.send(JSON.stringify({ type: 'conversation.item.create', item: { type: 'message', role: 'user', content: [{ type: 'input_text', text: text }] } }));
            this.#sendCreate(ws, fc);
          };
          begin();

          // 兜底：30s 内没有任何回应就收手，避免界面永远转圈
          window.setTimeout(() => { if (!sawAny && !settled) fail(new Error('timeout')); }, 30000);
        });
      });
      if (finalText) {
        const parsed = extractChartBlocks(finalText);
        if (parsed.charts.length) this.#emitVisuals(parsed.charts, 'text');
      }
    } catch (e) {
      const msg = (e as Error).message || String(e);
      // 用户主动收起时我们会关掉文字 WS，这是预期内，不该弹错误提示
      if (msg !== 'text_ws_closed') this.#ev.onError(`文字链路失败：${msg}`);
    } finally {
      this.#textBusy = false;
      this.#orb.setThinking(false);
      // 只收尾自己这一轮：期间开了新通话/新提问就别乱改状态
      if (epoch === this.#epoch) {
        if (!inCall) this.#ev.onVoice('idle');
        // 通话中打完字：回到聆听（除非此刻真的在播音频）
        else if (this.inCall && !this.#isSpeaking() && this.#orb.voiceState !== 'user') this.#ev.onVoice('user');
      }
      this.#endBot(false);
    }
  }

  async #textSession<T>(fn: (ws: WebSocket) => Promise<T>): Promise<T> {
    if (this.#textWs && this.#textWs.readyState === 1) return fn(this.#textWs);
    if (this.#textWs) { try { this.#textWs.close(); } catch { /* ignore */ } }
    const ws = new WebSocket(wsUrl('text'));
    this.#textWs = ws;
    this.#textConfigured = false;      // 新连接 → 需要重新下发会话配置
    // 新连接的上游是全新会话：续答状态必须重置，否则会带着旧连接的 responseOpen
    this.#textFc = { responseOpen: false, pending: false, gen: 0, pendingGen: -1, toolsInFlight: 0 };
    await new Promise<void>((res, rej) => { ws.onopen = () => res(); ws.onerror = () => rej(new Error('text_ws_error')); });
    try { return await fn(ws); } catch (e) {
      // 失败/超时后丢弃这条连接，下次提问重新建（避免半死连接反复失败）
      try { ws.close(); } catch { /* ignore */ }
      if (this.#textWs === ws) this.#textWs = null;
      throw e;
    }
  }

  // ───────────────────────── 日志 ─────────────────────────

  #logWs: WebSocket | null = null;
  #logBuf: Record<string, unknown>[] = [];
  #logTimer = 0;
  #logSeq = 0;
  #logEnabled = CONFIG.log;

  setLogEnabled(on: boolean): void { this.#logEnabled = on; }

  log(evt: string, data?: Record<string, unknown>, level = 'info'): void {
    if (!this.#logEnabled) return;
    const rec = { seq: ++this.#logSeq, t: Date.now(), iso: new Date().toISOString(), evt, level, data: data ?? null };
    this.#logBuf.push(rec);
    if (!this.#logTimer) this.#logTimer = window.setTimeout(() => this.flushLog(), 1200);
  }

  #connectLog(): void {
    if (this.#logWs && this.#logWs.readyState <= 1) return;
    try {
      const ws = new WebSocket(wsUrl('log'));
      this.#logWs = ws;
      ws.onopen = () => this.flushLog();
      ws.onclose = () => { this.#logWs = null; };
      ws.onerror = () => { /* 本地兜底 */ };
    } catch { /* ignore */ }
  }

  flushLog(): void {
    this.#logTimer = 0;
    if (!this.#logBuf.length) return;
    if (!this.#logWs || this.#logWs.readyState !== 1) { this.#connectLog(); return; }
    const batch = this.#logBuf.splice(0);
    try { this.#logWs.send(JSON.stringify(batch)); } catch { this.#logBuf = batch.concat(this.#logBuf); }
  }

  dispose(): void {
    this.#textWs = null;
    this.#logEnabled = false;
    this.#audio.stop();
  }
}

// 便于在设置面板展示/切换
export type { TapKind, AudioBands, ChatMessage };
export { DEFAULT_OPTIONS };
