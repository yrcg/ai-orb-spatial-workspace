/**
 * 多标签页选主：同一浏览器里可能不小心开了好几个页面。
 *
 * 问题很具体：
 *   · 两个标签页同时开麦 → 浏览器把麦克风给其中一个，AEC 失配，回声
 *   · 两条上游会话 → 双份计费
 *   · 两路回答同时播 → 声音重叠
 *   · 同一次说话触发两次工具调用
 *
 * 方案（只做客户端选举，不动服务端）：
 *   · Web Locks：'ai-orb/voice' 这把锁只有持有者能开麦/连语音。关页时浏览器自动
 *     释放，不需要自己维护心跳和过期时间 —— 这是它比 localStorage 时间戳好的地方。
 *   · BroadcastChannel：把阶段、语音状态、消息广播给其他标签页，让非主控页也能看到
 *     同一份对话，而不是一片空白。
 *   · 接管：非主控页点「接管」→ 广播 takeover → 主控放弃锁 → 接管者重连。
 *
 * 降级：浏览器不支持 Web Locks 时用 localStorage 心跳做近似选举；
 * 不支持 BroadcastChannel 时退化为"各页独立"（至少不会互相抢麦克风）。
 */

export type TabRole = 'leader' | 'follower' | 'solo';

export interface TabLockEvents {
  /** 角色变化。leader=持有麦克风/语音连接；follower=只读展示；solo=不支持并发检测 */
  onRole(role: TabRole, holder: boolean): void;
  /** 收到主控页广播的对话/状态更新 */
  onSync(msg: SyncMessage): void;
  /** 别的页面请求接管 */
  onTakeoverRequested(): void;
}

export type SyncMessage =
  | { kind: 'phase'; phase: 'idle' | 'active' }
  | { kind: 'voice'; state: 'idle' | 'thinking' | 'user' | 'ai' }
  | { kind: 'message'; role: string; content: string; msgKind?: string }
  | { kind: 'clear' }
  | { kind: 'takeover' }
  | { kind: 'release' }
  | { kind: 'ping'; at: number };

const LOCK_NAME = 'ai-orb/voice';
const CHANNEL = 'ai-orb/sync';
/** 降级用：主控每隔这么久续一次心跳 */
const BEAT_MS = 2000;
/** 降级用：超过这么久没心跳就认为主控已死 */
const STALE_MS = 6000;

interface NavigatorLocks {
  request<T>(name: string, options: { ifAvailable?: boolean; mode?: 'exclusive' }, cb: (lock: unknown) => Promise<T>): Promise<T>;
}

export class TabCoordinator {
  #ev: TabLockEvents;
  #role: TabRole = 'solo';
  #isLeader = false;
  #channel: BroadcastChannel | null = null;
  #locks: NavigatorLocks | null = null;
  #releaseLock: (() => void) | null = null;
  #beatTimer = 0;
  /** 主控在页生命周期内一直持锁：用这个 Promise 的 resolve 来放锁 */
  #holdResolve: (() => void) | null = null;
  #started = false;

  constructor(ev: TabLockEvents) {
    this.#ev = ev;
  }

  get role(): TabRole { return this.#role; }
  get isLeader(): boolean { return this.#isLeader; }

  /**
   * 只建立通道、不抢锁。
   * 跟随页必须在页面加载时就调用：否则主控广播 phase / voice 时它还没在监听，
   * 结果是"两个页面看到两个世界"。
   */
  listen(): void {
    this.#ensureStarted();
  }

  /** 尝试成为主控。返回 true 表示可以开麦/连语音。 */
  async acquire(): Promise<boolean> {
    this.#ensureStarted();
    if (this.#isLeader) return true;
    if (!this.#locks) {
      // 不支持 Web Locks：降级到心跳选举
      const ok = await this.#acquireByHeartbeat();
      this.#setLeader(ok);
      return ok;
    }
    const locks = this.#locks;
    // ⚠ 不能 await locks.request(...) 本身：它的 Promise 要等锁释放才 resolve，
    //   那样 acquire() 会在「已经拿到锁」之后永远挂住。用内部 deferred 提前返回。
    return new Promise<boolean>((resolve) => {
      void locks.request(LOCK_NAME, { ifAvailable: true }, (lock) => {
        if (!lock) { resolve(false); return Promise.resolve(); }
        // 成功拿到才通知角色；失败由调用方决定是否提示（后台标签页不该自己弹横幅）
        this.#setLeader(true);
        resolve(true);
        // 持锁直到 release()；页面关闭时浏览器自动释放
        return new Promise<void>((res) => {
          this.#holdResolve = res;
          this.#releaseLock = () => res();
        });
      }).catch(() => resolve(false));
    });
  }

  /** 主动放锁（收起通话、或让给别的标签页） */
  release(): void {
    if (!this.#isLeader) return;
    const r = this.#releaseLock;
    this.#releaseLock = null;
    this.#holdResolve = null;
    this.#setLeader(false);
    r?.();
    // 通知其他页面：现在空出来了，谁要谁上
    this.#post({ kind: 'release' });
    // 清掉降级心跳
    if (this.#beatTimer) { window.clearInterval(this.#beatTimer); this.#beatTimer = 0; }
    try {
      if (this.#role !== 'solo') localStorage.removeItem(`${LOCK_NAME}/heartbeat`);
    } catch { /* ignore */ }
  }

  /** 请求接管：让当前主控放锁，然后自己抢 */
  async requestTakeover(): Promise<boolean> {
    this.#ensureStarted();
    this.#post({ kind: 'takeover' });
    // 给主控一点时间放锁
    for (let i = 0; i < 12; i++) {
      await new Promise((r) => window.setTimeout(r, 120));
      if (await this.acquire()) return true;
    }
    return false;
  }

  /** 广播本地状态给其他标签页（仅主控调用） */
  post(msg: SyncMessage): void {
    if (!this.#isLeader) return;
    this.#post(msg);
  }

  /** 无视主控门禁的广播：用于「放锁之后」的收尾消息（例如收起界面） */
  postAsAny(msg: SyncMessage): void {
    this.#post(msg);
  }

  dispose(): void {
    this.release();
    this.#channel?.close();
    this.#channel = null;
  }

  // ---------- 内部 ----------

  #ensureStarted(): void {
    if (this.#started) return;
    this.#started = true;

    if (typeof BroadcastChannel !== 'undefined') {
      try {
        const ch = new BroadcastChannel(CHANNEL);
        ch.onmessage = (e: MessageEvent<SyncMessage>) => this.#onMessage(e.data);
        this.#channel = ch;
      } catch { /* ignore */ }
    }

    const locks = (navigator as unknown as { locks?: NavigatorLocks }).locks;
    this.#locks = locks ?? null;
    // 初始不广播角色：还没有任何"被占用"的证据，不该一打开就提示"另一页正在会话"。
    // 角色等第一次 acquire() 的成败再定。
    if (!locks) {
      this.#role = 'solo';
      this.#ev.onRole('solo', false);
    } else {
      this.#role = 'follower';
    }
  }

  #post(msg: SyncMessage): void {
    try { this.#channel?.postMessage(msg); } catch { /* ignore */ }
  }

  #onMessage(msg: SyncMessage | undefined): void {
    if (!msg || typeof msg !== 'object') return;
    if (msg.kind === 'takeover') {
      // 主控收到接管请求：放锁让位
      if (this.#isLeader) {
        this.release();
        this.#ev.onTakeoverRequested();
      }
      return;
    }
    if (msg.kind === 'release') {
      // 主控主动让出：跟随页不自动抢（避免后台标签页突然开麦），只更新角色提示
      this.#ev.onSync(msg);
      return;
    }
    // follower 收主控的同步
    this.#ev.onSync(msg);
  }

  #setLeader(on: boolean): void {
    this.#isLeader = on;
    const role: TabRole = this.#locks ? (on ? 'leader' : 'follower') : 'solo';
    this.#role = role;
    this.#ev.onRole(role, on);
  }

  /**
   * 降级选举：localStorage 心跳。
   * 只有"没有心跳或心跳过期"时才允许成为主控，否则退为跟随者。
   */
  async #acquireByHeartbeat(): Promise<boolean> {
    const key = `${LOCK_NAME}/heartbeat`;
    let existing = 0;
    try { existing = Number(localStorage.getItem(key) || 0); } catch { existing = 0; }
    const fresh = Date.now() - existing < STALE_MS;
    if (fresh) {
      this.#role = 'follower';
      return false;
    }
    const beat = (): void => {
      try { localStorage.setItem(key, String(Date.now())); } catch { /* ignore */ }
    };
    beat();
    this.#beatTimer = window.setInterval(beat, BEAT_MS);
    // 页面关闭/隐藏时尽快让位
    window.addEventListener('pagehide', () => {
      if (!this.#isLeader) return;
      try { localStorage.removeItem(key); } catch { /* ignore */ }
    }, { once: true });
    return true;
  }
}
