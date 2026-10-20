import type { OrbOptions } from './options';

export type ChatRole = 'user' | 'assistant' | 'tool' | 'system';

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

const STYLES = `
:host { --chat-dim: var(--orb-text-dim); }
.stream {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  width: var(--chat-width, 680px);
  max-width: calc(100% - 48px);
  /* 高度由组件按「球顶 - 间距」算好；border-box 保证 padding 不会把盒子撑低、
     否则对话区会实际压到球上（实测重叠 16px） */
  box-sizing: border-box;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 16px 4px;
  pointer-events: none;
  opacity: 0;
  z-index: 6;
  transition: opacity 300ms ease;
  scrollbar-width: thin;
  scrollbar-color: var(--orb-hairline) transparent;
  -webkit-mask-image: linear-gradient(to bottom, transparent 0%, #000 var(--chat-fade, 14%), #000 calc(100% - var(--chat-fade, 14%)), transparent 100%);
  mask-image: linear-gradient(to bottom, transparent 0%, #000 var(--chat-fade, 14%), #000 calc(100% - var(--chat-fade, 14%)), transparent 100%);
}
:host([data-phase='active']) .stream { opacity: 1; pointer-events: auto; }
/* 空间编排模式：位置/宽度由 SLO 直接给出，不再走「水平居中」的默认规则。
   注意这里只写 left/top/width/height，绝对定位元素不参与文档流，不会触发全局重排。 */
:host([data-chat-spatial='1']) .stream {
  left: var(--chat-x, 0px);
  top: var(--chat-y, 0px);
  width: var(--chat-w, 680px);
  height: var(--chat-h, 320px);
  transform: none;
  max-width: none;
}
/* 字幕：不要矩形底板（会和图表打架），只用一层极淡的底部光晕 + 文字阴影 */
:host([data-chat-mode='compact']) .stream {
  padding: 8px 8px;
  background: radial-gradient(56% 100% at 50% 100%, rgba(var(--orb-scrim), 0.18), transparent 88%);
  border-radius: 16px;
  -webkit-mask-image: linear-gradient(to bottom, transparent 0%, #000 14%, #000 90%, transparent 100%);
  mask-image: linear-gradient(to bottom, transparent 0%, #000 14%, #000 90%, transparent 100%);
}
:host([data-chat-mode='compact']) .text {
  font-size: 13px;
  line-height: 1.64;
  color: var(--orb-text-dim);
  text-shadow: 0 1px 12px rgba(var(--orb-scrim), 0.85);
}
/* 字幕模式下内容压在图表/3D 上，空场提示要能看清 */
:host([data-chat-mode='compact']) .text { text-align: center; }
:host([data-chat-mode='compact']) .msg { max-width: 100%; align-self: center; align-items: center; }
/* 内层负责「贴底对齐」。滚动容器必须是个普通块，否则 justify-content:flex-end
   会让 Chrome 少报 scrollHeight、顶部内容滚不回去。 */
.streamInner {
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  gap: 12px;
  min-height: 100%;
}
.stream::-webkit-scrollbar { width: 3px; }
.stream::-webkit-scrollbar-thumb { background: var(--orb-hairline); border-radius: 3px; }

/* 幽灵行：无底色、无边框，仅靠字重/标签/对齐区分角色 */
.msg {
  flex: 0 0 auto;              /* 关键：不参与压缩，否则历史消息会被挤扁、无法滚动 */
  display: flex;
  flex-direction: column;
  gap: 3px;
  max-width: 88%;
  animation: rise 320ms cubic-bezier(0.22, 0.61, 0.36, 1);
}
.msg[data-role='user'] { align-self: flex-end; align-items: flex-end; }
.msg[data-role='assistant'] { align-self: flex-start; }
.msg[data-role='tool'] { align-self: flex-start; }
.msg[data-role='system'] { align-self: center; align-items: center; max-width: 92%; }
@keyframes rise { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
.text { font-size: 14px; line-height: 1.72; color: var(--orb-text); white-space: pre-wrap; word-break: break-word; }
.msg[data-role='user'] .text { color: var(--orb-text-dim); }
.msg[data-role='system'] .text { font-size: 12px; color: var(--orb-text-faint); text-align: center; }
.msg[data-role='system'][data-kind='err'] .text { color: rgba(240, 130, 140, 0.72); }
.cursor { display: inline-block; width: 6px; height: 1em; margin-left: 2px; vertical-align: -0.15em; background: var(--orb-accent); animation: blink 1s steps(2, start) infinite; }
@keyframes blink { 50% { opacity: 0; } }

/* 工具 chip：独立一行，转圈 → ✓ / ✕ */
.tool-inline { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; line-height: 1.7;
  color: var(--orb-accent); background: none; border: 0; border-radius: 0; padding: 0; }
.tool-inline .tspin { width: 11px; height: 11px; border-radius: 50%; flex-shrink: 0;
  border: 2px solid rgba(140, 192, 255, 0.3); border-top-color: rgba(140, 192, 255, 0.9); animation: spin 0.8s linear infinite; }
.tool-inline.done { color: rgba(58, 158, 110, 0.9); }
.tool-inline.done .tspin { animation: none; border: none; width: auto; height: auto; }
.tool-inline.done .tspin::after { content: "✓"; font-weight: 700; }
.tool-inline.fail { color: rgba(198, 76, 84, 0.92); }
.tool-inline.fail .tspin { animation: none; border: none; width: auto; height: auto; }
.tool-inline.fail .tspin::after { content: "✕"; font-weight: 700; }
@keyframes spin { to { transform: rotate(360deg); } }

/* 思考指示：没有文字时也能看到「它在想」，三个呼吸点 */
.thinking {
  flex: 0 0 auto;
  align-self: flex-start;
  display: flex;
  align-items: center;
  gap: 5px;
  height: 18px;
  padding-left: 2px;
  animation: rise 260ms ease both;
}
.thinking i {
  width: 4px; height: 4px; border-radius: 50%;
  background: var(--orb-accent);
  animation: think 1.15s ease-in-out infinite;
}
.thinking i:nth-child(2) { animation-delay: 0.16s; }
.thinking i:nth-child(3) { animation-delay: 0.32s; }
/* 空场时状态指示居中，和上方那句邀请对齐，不显得孤零零挂在左边 */
.streamInner[data-empty='1'] .thinking,
.streamInner[data-empty='1'] .listening { align-self: center; }
@keyframes think {
  0%, 70%, 100% { opacity: 0.22; transform: translateY(0); }
  35% { opacity: 1; transform: translateY(-3px); }
}

/* 语音聆听中：一行很轻的波形，明确"我在听" */
.listening {
  flex: 0 0 auto;
  align-self: flex-start;
  display: flex;
  align-items: center;
  gap: 3px;
  height: 14px;
  padding-left: 2px;
  animation: rise 220ms ease both;
}
.listening i {
  width: 2px; height: 4px; border-radius: 1px;
  background: var(--orb-listen, rgba(49, 209, 124, 0.7));
  animation: listen 900ms ease-in-out infinite;
}
.listening i:nth-child(2) { animation-delay: 0.1s; }
.listening i:nth-child(3) { animation-delay: 0.2s; }
.listening i:nth-child(4) { animation-delay: 0.3s; }
.listening i:nth-child(5) { animation-delay: 0.4s; }
@keyframes listen {
  0%, 100% { height: 3px; opacity: 0.4; }
  50% { height: 12px; opacity: 0.95; }
}

/* 输入框：位于球下方，默认一条 1px 细线，hover/focus 才展开 */
/* 输入框默认完全隐藏，鼠标移到该区域才浮现。
   注意 opacity:0 依然能命中指针事件，所以这里用 pointer-events 而不是 display
   来控制「能不能唤起」，否则隐藏状态下永远等不到 hover。 */
.composer {
  position: absolute;
  left: 50%;
  transform: translateX(-50%) translateY(6px);
  width: var(--chat-width, 680px);
  max-width: calc(100% - 48px);
  box-sizing: border-box;
  display: flex;
  align-items: flex-end;
  gap: 10px;
  padding: 0 2px 6px;
  border-bottom: 1px solid var(--orb-hairline);
  transition: border-color 220ms ease, opacity 240ms ease, transform 240ms ease;
  pointer-events: none;
  opacity: 0;
  z-index: 6;
  background: rgba(var(--orb-scrim), 0.42);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
}
:host([data-phase='active']) .composer { pointer-events: auto; }
/* 隐形热区：上下各放宽一些，用户不用精确压在那条细线上。
   ⚠ 它盖在 textarea 之上，命中测试会落到 .composer 本身，所以
   textarea/.send 必须提层（z-index），并给 .composer 挂点击兜底聚焦，
   否则用户点了输入框却拿不到光标。 */
.composer::before {
  content: '';
  position: absolute;
  left: -10px;
  right: -10px;
  top: -18px;
  bottom: -14px;
}
.composer textarea,
.composer .send { position: relative; z-index: 1; }
.composer:hover,
.composer:focus-within,
.composer[data-has-text='1'] {
  opacity: 1;
  transform: translateX(-50%) translateY(0);
  border-bottom-color: var(--orb-accent);
}
:host([data-chat-spatial='1']) .composer {
  left: var(--composer-x, 0px);
  top: var(--composer-y, 0px);
  width: var(--composer-w, 680px);
  max-width: none;
  transform: none;
}
:host([data-chat-spatial='1']) .composer:hover,
:host([data-chat-spatial='1']) .composer:focus-within,
:host([data-chat-spatial='1']) .composer[data-has-text='1'] {
  transform: translateY(0);
}
.composer textarea {
  flex: 1 1 auto; min-width: 0; max-height: 96px; resize: none;
  padding: 4px 0; border: 0; background: none; outline: none;
  font: 13px/20px system-ui, -apple-system, sans-serif; letter-spacing: 0.02em;
  color: var(--orb-text); caret-color: var(--orb-accent);
}
.composer textarea::placeholder { color: var(--orb-text-faint); opacity: 0; transition: opacity 220ms ease; }
.composer:hover textarea::placeholder, .composer:focus-within textarea::placeholder { opacity: 1; }
.send { flex: 0 0 auto; width: 24px; height: 24px; display: grid; place-items: center; padding: 0;
  border: 0; border-radius: 50%; background: none; color: var(--orb-text-faint); cursor: pointer;
  opacity: 0; transform: scale(0.8); transition: opacity 200ms ease, transform 200ms ease, color 200ms ease, background 200ms ease; }
.composer:hover .send, .composer:focus-within .send { opacity: 1; transform: scale(1); }
.send[data-ready='1'] { color: var(--orb-text); background: rgba(143, 216, 255, 0.16); }
.send:hover { background: rgba(143, 216, 255, 0.26); }
.send svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }
`;

const TEMPLATE = `
<style>${STYLES}</style>
<div class="chat">
  <div class="stream" part="stream" role="log" aria-live="polite"><div class="streamInner"></div></div>
  <div class="composer">
    <textarea rows="1" placeholder="说点什么…" aria-label="输入消息" maxlength="500"></textarea>
    <button class="send" type="button" aria-label="发送">
      <svg viewBox="0 0 24 24"><path d="M4 12h15M13 6l6 6-6 6" /></svg>
    </button>
  </div>
</div>
`;

/**
 * 内置对话层：上方渐隐对话流 + 下方细线输入框（球位于二者之间）。
 *
 * 职责边界：**只管渲染与输入采集，不含任何 LLM 逻辑**。
 * 宿主通过组件的 addMessage / startStream / appendStream / endStream 推送内容，
 * 或监听 `orb:submit` 自行接管。
 *
 * 滚动：默认贴底自动跟随；一旦用户向上滚离底部，即脱离跟随，方便回看历史。
 */
export class ChatLayer {
  readonly #root: ShadowRoot;
  readonly #host: HTMLElement;
  readonly #stream: HTMLElement;
  readonly #inner: HTMLElement;
  readonly #composer: HTMLElement;
  readonly #input: HTMLTextAreaElement;
  readonly #send: HTMLButtonElement;
  readonly #messages: ChatMessage[] = [];
  #streamingEl: HTMLElement | null = null;
  #streamingText: HTMLElement | null = null;
  #streamingCursor: HTMLElement | null = null;
  #queue: string[] = [];
  #typeAcc = 0;
  #typing = false;
  #options: OrbOptions;
  /** 贴底跟随：用户一旦向上滚离底部就置 false，回到底部再置 true */
  #pinned = true;
  #toolEls: Array<{ callId: string | null; el: HTMLElement; msg: ChatMessage }> = [];
  #thinkEl: HTMLElement | null = null;
  #listenEl: HTMLElement | null = null;
  #thinking = false;
  #listening = false;
  #scrollTimer = 0;
  #scrollQueued = false;
  #lastScrollAt = 0;

  constructor(root: ShadowRoot, host: HTMLElement, options: OrbOptions) {
    this.#root = root;
    this.#host = host;
    this.#options = options;
    const holder = document.createElement('div');
    holder.innerHTML = TEMPLATE;
    this.#stream = holder.querySelector('.stream') as HTMLElement;
    this.#inner = holder.querySelector('.streamInner') as HTMLElement;
    this.#composer = holder.querySelector('.composer') as HTMLElement;
    this.#input = holder.querySelector('textarea') as HTMLTextAreaElement;
    this.#send = holder.querySelector('.send') as HTMLButtonElement;
    for (const node of Array.from(holder.children)) root.append(node);

    this.#stream.addEventListener('scroll', this.#onScroll, { passive: true });
    this.#input.addEventListener('input', this.#onInput);
    this.#input.addEventListener('keydown', this.#onKey);
    this.#send.addEventListener('click', this.#onClick);
    // .composer::before 热区会用指针事件吃掉 textarea 上的点击（命中测试落到
    // .composer），这里兜底：点整条任意位置都聚焦输入框，点发送按钮除外。
    this.#composer.addEventListener('click', (ev: MouseEvent): void => {
      const t = ev.target as Element | null;
      if (t && t.closest && t.closest('.send')) return;
      this.focusInput();
    });
    this.#showEmpty();
  }

  get messages(): ChatMessage[] {
    return this.#messages.map((m) => ({ ...m }));
  }

  setOptions(options: OrbOptions): void {
    this.#options = options;
    this.#host.style.setProperty('--chat-width', `${options.chatMaxWidth}px`);
    this.#host.style.setProperty('--chat-fade', `${Math.round(options.chatFade * 100)}%`);
  }

  /** 对话流与输入框的定位：球上方放对话流，球下方放输入框 */
  layout(streamTop: number, streamHeight: number, composerTop: number): void {
    this.#clearSpatial();
    this.#stream.style.top = `${Math.round(streamTop)}px`;
    this.#stream.style.height = `${Math.max(0, Math.round(streamHeight))}px`;
    this.#composer.style.top = `${Math.round(composerTop)}px`;
  }

  /**
   * 空间编排模式：SLO 直接给出对话列/字幕区的矩形。
   * 这里不做任何"猜测位置"的计算，只应用结果。
   */
  layoutSpatial(chat: {
    x: number; y: number; w: number; h: number;
    composerX: number; composerY: number; composerW: number;
    mode: 'center' | 'compact' | 'hidden';
  }): void {
    this.#host.dataset.chatSpatial = '1';
    this.#host.dataset.chatMode = chat.mode;
    this.#stream.style.left = `${Math.round(chat.x)}px`;
    this.#stream.style.top = `${Math.round(chat.y)}px`;
    this.#stream.style.width = `${Math.round(chat.w)}px`;
    this.#stream.style.height = `${Math.max(0, Math.round(chat.h))}px`;
    this.#stream.style.transform = 'none';
    this.#stream.style.maxWidth = 'none';
    this.#composer.style.left = `${Math.round(chat.composerX)}px`;
    this.#composer.style.top = `${Math.round(chat.composerY)}px`;
    this.#composer.style.width = `${Math.round(chat.composerW)}px`;
    this.#composer.style.transform = 'none';
    this.#composer.style.maxWidth = 'none';
  }

  #clearSpatial(): void {
    delete this.#host.dataset.chatSpatial;
    delete this.#host.dataset.chatMode;
    const props = ['left', 'top', 'width', 'height', 'transform', 'max-width'];
    for (const prop of props) {
      this.#stream.style.removeProperty(prop);
      this.#composer.style.removeProperty(prop);
    }
  }

  focusInput(): void {
    this.#input.focus();
  }

  /** 追加一条完整消息 */
  addMessage(role: ChatRole, content: string, kind?: string): HTMLElement {
    this.#measurePinned();          // 先记下用户此刻是否在底部，再插入新内容
    this.#endStreamInternal();
    const el = this.#createMessage(role, content, kind);
    this.#messages.push({ role, content });
    this.#scrollToEnd();
    return el;
  }

  addMessages(list: ChatMessage[]): void {
    this.#measurePinned();
    this.#endStreamInternal();
    for (const m of list) {
      this.#createMessage(m.role, m.content);
      this.#messages.push({ ...m });
    }
    this.#scrollToEnd();
  }

  clearMessages(): void {
    this.#endStreamInternal();
    this.#messages.length = 0;
    this.#inner.replaceChildren();
    this.#toolEls = [];
    this.#thinkEl = null;
    this.#listenEl = null;
    this.#thinking = false;
    this.#listening = false;
    this.#liveEl = null;
    this.#liveTextEl = null;
    this.#pinned = true;
    this.#showEmpty();
  }

  // ---- 工具 chip（Q4：独立一行，转圈 → ✓/✕）----

  addToolChip(name: string, callId: string | null, label: string): void {
    this.#measurePinned();
    const wrap = document.createElement('div');
    wrap.className = 'msg';
    wrap.dataset.role = 'tool';
    const chip = document.createElement('span');
    chip.className = 'tool-inline';
    const spin = document.createElement('span');
    spin.className = 'tspin';
    const tx = document.createElement('span');
    tx.className = 'tlabel';
    tx.textContent = `正在${label}…`;
    chip.append(spin, tx);
    wrap.append(chip);
    this.#appendRow(wrap);
    const msg: ChatMessage = { role: 'tool', content: `正在${label}…` };
    this.#messages.push(msg);
    this.#toolEls.push({ callId, el: chip, msg });
    this.#scrollToEnd();
  }

  finishToolChip(name: string, ok: boolean, callId: string | null, label: string): void {
    let i = -1;
    if (callId) i = this.#toolEls.findIndex((t) => t.callId === callId);
    if (i < 0) i = this.#toolEls.findIndex((t) => !t.el.classList.contains('done') && !t.el.classList.contains('fail'));
    if (i >= 0) {
      const { el: chip, msg } = this.#toolEls.splice(i, 1)[0];
      chip.classList.add(ok ? 'done' : 'fail');
      const text = `${label}${ok ? ' 完成' : ' 失败'}`;
      const tx = chip.querySelector('.tlabel');
      if (tx) tx.textContent = text;
      msg.content = text;                       // 记账同步，避免 messages 停留在「正在…」
    }
  }

  // ---- 流式（打字机）----

  startStream(): void {
    this.#measurePinned();
    this.#endStreamInternal();
    const wrap = document.createElement('div');
    wrap.className = 'msg';
    wrap.dataset.role = 'assistant';
    const text = document.createElement('div');
    text.className = 'text';
    const cursor = document.createElement('i');
    cursor.className = 'cursor';
    text.append(cursor);
    wrap.append(text);
    this.#appendRow(wrap);
    this.#streamingEl = wrap;
    this.#streamingText = text;
    this.#streamingCursor = cursor;
    this.#messages.push({ role: 'assistant', content: '' });
    this.#scrollToEnd();
  }

  appendStream(chunk: string): void {
    if (!this.#streamingText) this.startStream();
    for (const ch of chunk) this.#queue.push(ch);
    if (!this.#typing) void this.#drain();
  }

  endStream(): void {
    if (this.#streamingText && this.#queue.length) {
      this.#queue.splice(0).forEach((c) => this.#streamingText!.append(c));
      this.#typeAcc = 0;
    }
    this.#syncStreamingContent();
    this.#endStreamInternal();
  }

  /** 当前正在流式的气泡元素（宿主可直接改文本，例如字幕跟读） */
  get streamingTextEl(): HTMLElement | null {
    return this.#streamingText;
  }

  // ---- 状态指示（思考中 / 聆听中）----

  /** 思考指示：没有文字产出时的可见反馈，避免"卡住了"的错觉 */
  setThinking(on: boolean): void {
    if (on === this.#thinking) return;
    this.#thinking = on;
    if (on) {
      // 不要清 data-empty：它就是「此刻只有状态指示、没有消息」的标记，
      // 思考点/聆听波形要靠它居中。清掉会让三个点孤零零贴在左上角。
      if (!this.#thinkEl) {
        const el = document.createElement('div');
        el.className = 'thinking';
        el.setAttribute('aria-label', '正在思考');
        el.append(document.createElement('i'), document.createElement('i'), document.createElement('i'));
        this.#thinkEl = el;
        this.#inner.append(el);
        this.#scrollToEnd();
      }
    } else if (this.#thinkEl) {
      this.#thinkEl.remove();
      this.#thinkEl = null;
      this.#showEmpty();
    }
  }

  /** 聆听指示：用户正在说话（VAD 触发但还没有转写文本时） */
  setListening(on: boolean): void {
    if (on === this.#listening) return;
    this.#listening = on;
    if (on) {
      // 同 setThinking：保留 data-empty，让聆听波形居中而不是贴左
      if (!this.#listenEl) {
        const el = document.createElement('div');
        el.className = 'listening';
        el.setAttribute('aria-label', '正在聆听');
        for (let i = 0; i < 5; i++) el.append(document.createElement('i'));
        this.#listenEl = el;
        this.#inner.append(el);
        this.#scrollToEnd();
      }
    } else if (this.#listenEl) {
      this.#listenEl.remove();
      this.#listenEl = null;
      this.#showEmpty();
    }
  }

  /** 行插入点：状态指示永远留在最底部 */
  #appendRow(el: HTMLElement): void {
    this.#hideEmpty();
    if (this.#thinkEl) this.#inner.insertBefore(el, this.#thinkEl);
    else if (this.#listenEl) this.#inner.insertBefore(el, this.#listenEl);
    else this.#inner.append(el);
  }

  /**
   * 空场标记：不再显示任何提示文字（2026-10-19 用户要求去掉）。
   * 只保留 data-empty 这一个布尔标记——思考点和聆听波形需要靠它居中，
   * 没有它的话「它在想」会贴在左边缘，看起来像一条错位的消息。
   */
  #showEmpty(): void {
    if (this.#messages.length) return;
    this.#inner.dataset.empty = '1';
  }

  #hideEmpty(): void {
    this.#inner.dataset.empty = '0';
  }

  /** 强制回到底部并恢复跟随（每次展开时调用，避免历史残留位置） */
  snapToBottom(): void {
    this.#pinned = true;
    this.#showEmpty();
    this.#scrollToEnd(true);
  }

  // ---- 「活」气泡（用户转写占位等）----
  #liveEl: HTMLElement | null = null;
  #liveTextEl: HTMLElement | null = null;
  #liveRole: ChatRole = 'user';

  /** 创建/复用一条可即时改写的消息（用户语音占位「聆听中…」用） */
  beginLive(role: ChatRole, kind?: string): void {
    if (this.#liveEl && this.#liveRole === role) return;
    this.#measurePinned();
    this.#endLive();
    this.#endStreamInternal();
    this.#liveEl = this.#createMessage(role, '', kind);
    this.#liveTextEl = this.#liveEl.querySelector('.text');
    this.#liveRole = role;
    this.#scrollToEnd();
  }

  /** 改写当前「活」气泡正文 */
  setLive(text: string): void {
    if (!this.#liveTextEl) return;
    this.#liveTextEl.textContent = text;
    this.#scrollToEnd();
  }

  /** 落定「活」气泡并记账 */
  commitLive(content: string): void {
    if (!this.#liveEl) return;
    this.setLive(content);
    this.#messages.push({ role: this.#liveRole, content });
    this.#endLive();
  }

  /** 丢弃未落定的「活」气泡（打断、挂断时用，避免留下「聆听中…」） */
  discardLive(): void {
    if (this.#liveEl) this.#liveEl.remove();
    this.#liveEl = null;
    this.#liveTextEl = null;
    this.#liveRole = 'user';
  }

  #endLive(): void {
    if (this.#liveEl && !this.#liveEl.textContent?.trim()) {
      this.#liveEl.remove();
    }
    this.#liveEl = null;
    this.#liveTextEl = null;
    this.#liveRole = 'user';
  }

  /** 直接把整段文本写进当前助手气泡（无打字机），用于字幕跟读等 */
  setAssistantLive(text: string): void {
    if (!this.#streamingText) this.startStream();
    const textEl = this.#streamingText!;
    textEl.textContent = text;
    if (this.#streamingCursor) textEl.append(this.#streamingCursor);   // 光标仍在末尾
    this.#syncStreamingContent();
    this.#scrollToEnd();
  }

  #endStreamInternal(): void {
    this.#queue.length = 0;
    this.#typing = false;
    this.#typeAcc = 0;
    this.#streamingCursor?.remove();
    this.#streamingCursor = null;
    this.#streamingEl = null;
    this.#streamingText = null;
  }

  async #drain(): Promise<void> {
    this.#typing = true;
    const cps = Math.max(1, this.#options.streamCps);
    let last = performance.now();
    await new Promise<void>((resolve) => {
      const step = (now: number): void => {
        if (!this.#streamingText) { resolve(); return; }
        this.#typeAcc += ((now - last) / 1000) * cps;
        last = now;
        let n = Math.floor(this.#typeAcc);
        while (n-- > 0 && this.#queue.length) {
          this.#typeAcc -= 1;
          this.#streamingText.insertBefore(document.createTextNode(this.#queue.shift()!), this.#streamingCursor);
        }
        this.#scrollToEnd();
        if (this.#queue.length) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });
    this.#typing = false;
    this.#syncStreamingContent();
  }

  #syncStreamingContent(): void {
    if (!this.#streamingText) return;
    const content = this.#streamingText.textContent ?? '';
    const last = this.#messages[this.#messages.length - 1];
    if (last && last.role === 'assistant') last.content = content;
  }

  #createMessage(role: ChatRole, content: string, kind?: string): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'msg';
    wrap.dataset.role = role;
    if (kind) wrap.dataset.kind = kind;
    const text = document.createElement('div');
    text.className = 'text';
    text.textContent = content;
    wrap.append(text);
    this.#appendRow(wrap);
    return wrap;
  }

  #onScroll = (): void => {
    this.#measurePinned();
  };

  /**
   * 记录「用户是否在底部」。不能只依赖 scroll 事件：程序化滚动或动画帧被节流时
   * 事件可能没跑，插入新消息就会被错误地拽回底部。
   */
  #measurePinned(): void {
    const el = this.#stream;
    this.#pinned = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
  }

  /**
   * 打字机每帧都会追加文字；每帧读 scrollHeight 会持续强制同步布局，长对话时明显掉帧。
   * 这里按 ~70ms 合并成一次，视觉上仍然是"跟着往下走"。
   * force=true 用于「回到最新」「展开时贴底」这类必须立刻到位的场景。
   */
  #scrollToEnd(force = false): void {
    if (!this.#pinned && !force) return;
    if (force) {
      this.#scrollTimer = 0;
      this.#stream.scrollTop = this.#stream.scrollHeight;
      this.#lastScrollAt = performance.now();
      return;
    }
    this.#scrollQueued = true;
    const now = performance.now();
    const wait = Math.max(0, 70 - (now - this.#lastScrollAt));
    if (this.#scrollTimer) return;
    this.#scrollTimer = window.setTimeout(() => {
      this.#scrollTimer = 0;
      if (!this.#scrollQueued) return;
      this.#scrollQueued = false;
      this.#lastScrollAt = performance.now();
      if (this.#pinned) this.#stream.scrollTop = this.#stream.scrollHeight;
    }, wait);
  }

  #onInput = (): void => {
    const v = this.#input.value;
    this.#send.dataset.ready = v.trim().length > 0 ? '1' : '0';
    // 有内容时保持可见：否则鼠标移开、输入框又消失，用户会以为内容丢了
    this.#composer.dataset.hasText = v.length > 0 ? '1' : '0';
    this.#input.style.height = 'auto';
    this.#input.style.height = `${Math.min(96, this.#input.scrollHeight)}px`;
  };

  #onKey = (event: KeyboardEvent): void => {
    // 输入法组合态不拦截
    if (event.isComposing || event.keyCode === 229) return;
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.#submit();
      return;
    }
    // Shift+Enter 走默认换行
  };

  #onClick = (): void => {
    this.#submit();
  };

  #submit(): void {
    const text = this.#input.value.trim();
    if (!text) return;
    this.#input.value = '';
    this.#onInput();
    this.addMessage('user', text);
    this.#root.dispatchEvent(
      new CustomEvent('orb:submit', { detail: { text }, bubbles: true, composed: true }),
    );
  }

  /** 供宿主在收起时清空输入（避免残留） */
  clearInput(): void {
    this.#input.value = '';
    this.#onInput();
  }

  /** 暴露给组件做细微布局（例如未启用时隐藏） */
  get composerEl(): HTMLElement {
    return this.#composer;
  }
}
