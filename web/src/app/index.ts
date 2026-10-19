import '../orb/index';
import { AIOrbChat, type VoiceState } from '../orb';
import { RelayClient } from './relay';
import { CONFIG } from './config';
import { TabCoordinator, type TabRole, type SyncMessage } from './tabLock';

/**
 * 宿主装配：把组件、中继客户端、设置面板接起来。
 * 组件本身不含 LLM 逻辑；这里负责「提交 → 调中继 → 推进对话层」的编排。
 */

const orb = document.querySelector('ai-orb-chat') as AIOrbChat;
if (!orb) throw new Error('[app] <ai-orb-chat> not found');

orb.setOptions({ orb: CONFIG.orb, orbPreset: CONFIG.orbPreset, theme: CONFIG.theme, auraMode: CONFIG.auraMode });

// ── 多标签页选主：只有主控页能开麦 / 连语音 ──
let role: TabRole = 'solo';
const tabs = new TabCoordinator({
  onRole: (next) => {
    role = next;
    // 主动拿锁成功 / 主动放锁都不该弹横幅；只有"被占用"那条路径会带 true
    applyRoleUi(next);
  },
  onSync: (msg) => applySync(msg),
  onTakeoverRequested: () => {
    // 让出语音：先停通话再收界面（收界面时 applyingRemote 会挡掉 orb:phase 的副作用）。
    // 不要在这里广播 phase idle —— 接管方正要展开，会被这条消息当场收起来。
    relay.stopVoice();
    applyingRemote = true;
    try { orb.deactivate(); } finally { applyingRemote = false; }
    orb.addMessage('system', '另一个标签页接管了语音会话。');
  },
});
// 页面加载即开始监听（不等第一次双击），否则会漏掉主控页的广播
tabs.listen();

/** 镜像远程状态时置位：避免 orb.deactivate()/activate() 触发的 orb:phase 再被当成用户操作 */
let applyingRemote = false;

/** 跟随页把主控页的状态镜像过来，避免"两个页面看到两个世界" */
function applySync(msg: SyncMessage): void {
  applyingRemote = true;
  try {
    switch (msg.kind) {
      case 'phase':
        if (msg.phase === 'active') {
          // 收到别人的 phase active 本身就是「别的页面在主导」的证据
          // （BroadcastChannel 不会回送自己发出去的消息）。
          if (role !== 'leader') orb.setAttribute('data-follower', '');
          orb.activateSilent();
        } else if (role !== 'leader') {
          orb.deactivate();
        }
        break;
      case 'voice':
        orb.setVoiceState(msg.state);
        setVoiceBadge(msg.state);
        break;
      case 'message':
        orb.addMessage(msg.role as 'user' | 'assistant' | 'tool' | 'system', msg.content, msg.msgKind);
        break;
      case 'clear':
        orb.clearMessages();
        break;
      default:
        break;
    }
  } finally {
    applyingRemote = false;
  }
}

/**
 * 只有「确实因为别的页面占用而拿不到锁」时才弹横幅。
 * 角色本身变成 follower（例如自己主动收起后放锁）不该提示，
 * 否则收起通话的一瞬间会莫名冒出一条"另一个标签页正在会话"。
 */
let bannerAllowed = false;
function applyRoleUi(next: TabRole, allowBanner = false): void {
  bannerAllowed = allowBanner;
  const banner = document.getElementById('followerBanner');
  const showBanner = next === 'follower' && bannerAllowed;
  if (banner) banner.hidden = !showBanner;
  if (next === 'follower') orb.setAttribute('data-follower', '');
  else if (next === 'leader') orb.removeAttribute('data-follower');
}

const relay = new RelayClient(orb, {
  onState: (text, kind) => setStatus(text, kind),
  onError: (text) => {
    orb.addMessage('system', text, 'err');
    relay.log('app_error', { text }, 'err');
  },
  onVoice: (state: VoiceState) => {
    orb.setVoiceState(state);
    setVoiceBadge(state);
    tabs.post({ kind: 'voice', state });
  },
});

// ── 交互：双击球 = 打开对话 + 自动接通；Esc = 收起并挂断 ──
orb.addEventListener('orb:phase', ((e: CustomEvent<{ phase: string; voice?: boolean }>) => {
  document.documentElement.dataset.orbActive = e.detail.phase === 'active' ? '1' : '0';
  // 远程镜像触发的阶段变化：只更新界面，不碰通话、不广播（否则会形成回环）
  if (applyingRemote) return;
  // phase 广播交给 startVoiceAsLeader（拿到锁之后），收起时直接广播
  if (e.detail.phase === 'active') {
    // 文字提交等场景只展开界面，不自动开麦
    if (e.detail.voice !== false) void startVoiceAsLeader();
    else tabs.post({ kind: 'phase', phase: 'active' });
  } else {
    relay.stopVoice();
    tabs.release();
    // release 之后已不是主控，post 会被门禁挡掉；补一条 idle 让跟随页同步收起
    tabs.postAsAny({ kind: 'phase', phase: 'idle' });
    orb.clearInput();
    setVoiceBadge('idle');
  }
}) as EventListener);

orb.addEventListener('orb:takeover', () => { void tryTakeover(); });

// 跟随页双击球 = 请求接管（不是收起）

/** 非主控页不抢麦克风：先尝试拿锁，拿不到就提示并用文字链路兜底 */
async function startVoiceAsLeader(): Promise<void> {
  const ok = await tabs.acquire();
  if (ok) {
    // phase 广播必须在拿到锁之后发：主控 post 有 isLeader 门禁，
    // 放在 acquire 前会被直接丢弃（实测跟随页因此收不到展开状态）。
    tabs.post({ kind: 'phase', phase: 'active' });
    void relay.startVoice();
    return;
  }
  applyRoleUi('follower', true);
  setStatus('语音由另一个标签页占用', 'info');
}

// 输入框提交 → 走文字链路（若无通话），或作为文字消息
orb.addEventListener('orb:submit', ((e: CustomEvent<{ text: string }>) => {
  const text = e.detail.text;
  relay.log('user_text', { text });
  const add = (): void => {
    // 跟随页也能提问：走文字链路（不需要麦克风与主控锁）
    if (orb.phase === 'active') void relay.askText(text);
    else {
      // 停靠态提交（键盘可达）：只展开界面，不开麦；用户气泡已由对话层添加，别重复
      orb.activateSilent();
      void relay.askText(text);
    }
  };
  if (role === 'follower') {
    orb.activateSilent();
    add();
    return;
  }
  add();
}) as EventListener);

// 活跃态单击球 = 打断 AI（幂等；双击时也会先触发一次，无害）
orb.addEventListener('orb:interrupt', () => {
  if (relay.interrupt()) relay.log('user_interrupt', {});
});

// 日志
relay.log('app_start', { orb: CONFIG.orb, preset: CONFIG.orbPreset, ua: navigator.userAgent });

// ───────────────────────── 状态条 ─────────────────────────

const statusEl = document.getElementById('connText') as HTMLElement | null;
const badgeEl = document.getElementById('voiceBadge') as HTMLElement | null;
const timerEl = document.getElementById('callTimer') as HTMLElement | null;
const dotEl = document.getElementById('liveDot') as HTMLElement | null;

function setStatus(text: string, kind?: string): void {
  if (statusEl) statusEl.textContent = text;
  if (dotEl) dotEl.classList.toggle('on', kind === 'ok' || (relay?.inCall ?? false));
}
const VOICE_TEXT: Record<VoiceState, string> = { idle: '待机', thinking: '思考中', user: '聆听中', ai: '说话中' };
function setVoiceBadge(state: VoiceState): void {
  if (!badgeEl) return;
  badgeEl.textContent = VOICE_TEXT[state];
  badgeEl.dataset.voice = state;
}

let callT0 = 0;
let callTimerId = 0;
function fmtDur(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
setInterval(() => {
  if (!timerEl) return;
  if (relay.inCall) {
    if (!callT0) callT0 = Date.now();
    timerEl.textContent = `通话 ${fmtDur(Date.now() - callT0)}`;
    timerEl.hidden = false;
  } else {
    callT0 = 0;
    timerEl.hidden = true;
  }
}, 500);

// ───────────────────────── 设置浮层（Q8）─────────────────────────

const panel = document.getElementById('settings');
const gearBtn = document.getElementById('gear');
function setPanelOpen(open: boolean): void {
  panel?.classList.toggle('open', open);
  document.documentElement.dataset.panelOpen = open ? '1' : '0';
}
gearBtn?.addEventListener('click', (e) => { e.stopPropagation(); setPanelOpen(!panel?.classList.contains('open')); });
document.getElementById('settingsClose')?.addEventListener('click', () => setPanelOpen(false));
// Esc 关面板（组件看到 panelOpen 标记后不会跟着挂断）
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && panel?.classList.contains('open')) setPanelOpen(false);
});
// 点空白处关面板
document.addEventListener('pointerdown', (e) => {
  if (!panel?.classList.contains('open')) return;
  const t = e.target as Node | null;
  if (panel.contains(t) || gearBtn?.contains(t)) return;
  setPanelOpen(false);
});

// 麦克风设备
const micSel = document.getElementById('micSel') as HTMLSelectElement | null;
async function refreshMicList(): Promise<void> {
  if (!micSel) return;
  let devs: MediaDeviceInfo[] = [];
  try { devs = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput'); } catch { devs = []; }
  micSel.innerHTML = '';
  const auto = document.createElement('option');
  auto.value = '';
  auto.textContent = devs.length ? `系统默认（共 ${devs.length} 个输入设备）` : '系统默认（未发现设备）';
  micSel.appendChild(auto);
  devs.forEach((d, i) => {
    const o = document.createElement('option');
    o.value = d.deviceId;
    o.textContent = d.label || `麦克风 ${i + 1}`;
    micSel.appendChild(o);
  });
  micSel.value = relay.micDeviceId && devs.some((d) => d.deviceId === relay.micDeviceId) ? relay.micDeviceId : '';
}
micSel?.addEventListener('change', () => { relay.setMicDevice(micSel.value || null); });
void refreshMicList();

// 开关
function bindToggle(id: string, initial: boolean, onToggle: (on: boolean) => void): void {
  const btn = document.getElementById(id);
  if (!btn) return;
  let on = initial;
  const paint = (): void => { btn.textContent = on ? '开' : '关'; btn.classList.toggle('on', on); };
  paint();
  btn.addEventListener('click', () => { on = !on; paint(); onToggle(on); });
}
bindToggle('tgAec', CONFIG.aec, (on) => { relay.setAec(on); });
bindToggle('tgUpGate', CONFIG.upGate, (on) => { relay.setUpGate(on); });
bindToggle('tgLog', CONFIG.log, (on) => { relay.setLogEnabled(on); });
bindToggle('tgParticles', orb.options.particlesEnabled, (on) => { orb.setOptions({ particlesEnabled: on }); });

// 麦克风自检
document.getElementById('btnMicTest')?.addEventListener('click', async () => {
  const info: string[] = [];
  try {
    const devs = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput');
    info.push(`发现 ${devs.length} 个输入设备`);
  } catch { info.push('设备枚举失败'); }
  info.push(`安全上下文：${window.isSecureContext ? '是' : '否'}`);
  info.push(`嵌入框架：${window.self !== window.top ? '是 ⚠' : '否'}`);
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const tr = stream.getAudioTracks()[0];
    const st = tr && tr.getSettings ? tr.getSettings() : {};
    orb.addMessage('system', `麦克风自检 ✓ 打开成功\n设备：${tr?.label || '(无标签)'} · ${st.sampleRate || '?'}Hz\n${info.join('；')}`);
    stream.getTracks().forEach((t) => t.stop());
    void refreshMicList();
  } catch (e) {
    orb.addMessage('system', `麦克风自检 ✗ ${(e as Error).name}：${(e as Error).message || e}\n（${info.join('；')}）`, 'err');
  }
});

// 日志导出
document.getElementById('btnLogDump')?.addEventListener('click', () => {
  relay.flushLog();
  orb.addMessage('system', '日志已推送到服务端 logs/ 目录。');
});

// 通话按钮（设置面板里也给一个入口）
document.getElementById('btnCall')?.addEventListener('click', () => {
  if (orb.phase === 'idle') orb.activate();
  else if (relay.inCall) relay.stopVoice();      // 只挂断，界面保留（可以继续打字）
  else void relay.startVoice();                  // 界面已开但通话断了 → 重连
});

// 环境告警
(function checkEnv(): void {
  const notes: string[] = [];
  if (window.self !== window.top) notes.push('页面被嵌在 iframe / 预览面板里');
  if (location.protocol !== 'https:' && location.hostname !== '127.0.0.1' && location.hostname !== 'localhost') {
    notes.push(`当前地址是 ${location.host}（非 127.0.0.1 / localhost，也不是 https）`);
  }
  if (!notes.length) return;
  const warn = document.getElementById('envWarn');
  if (warn) {
    warn.hidden = false;
    warn.textContent = `⚠ 检测到可疑环境：${notes.join('；')}。麦克风很可能拿不到，请用 Chrome / Edge 打开 http://127.0.0.1:8770。`;
  }
})();

// 接管按钮（跟随页里可见）
async function tryTakeover(): Promise<void> {
  setStatus('正在接管…', 'info');
  const ok = await tabs.requestTakeover();
  if (!ok) { setStatus('接管失败：另一个页面仍在会话中', 'err'); return; }
  bannerAllowed = false;
  applyRoleUi('leader');
  if (orb.phase !== 'active') orb.activate();
  else void relay.startVoice();
}
document.getElementById('btnTakeover')?.addEventListener('click', () => { void tryTakeover(); });

// 接管提示条上的「知道了」：收起提示但不改变角色
document.getElementById('followerDismiss')?.addEventListener('click', () => {
  const banner = document.getElementById('followerBanner');
  if (banner) banner.hidden = true;
});

// 主题
function applyTheme(theme: 'dark' | 'light'): void {
  document.documentElement.dataset.theme = theme;
  orb.setOptions({ theme });
  try { localStorage.setItem('pet-web-theme', theme); } catch { /* ignore */ }
}
const savedTheme = (localStorage.getItem('pet-web-theme') as 'dark' | 'light' | null) || CONFIG.theme;
applyTheme(savedTheme);
document.getElementById('tgTheme')?.addEventListener('click', () => {
  const next = (document.documentElement.dataset.theme === 'light' ? 'dark' : 'light') as 'dark' | 'light';
  applyTheme(next);
});
