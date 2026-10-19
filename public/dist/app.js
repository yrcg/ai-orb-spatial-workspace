var e={orb:`liquid`,orbPreset:`custom`,dockOrbSize:120,dockMarginX:32,dockMarginY:44,dockOrbSizeMin:88,orbCanvasRatio:.52,activeOrbRatio:.28,activeOrbCenterY:.48,activeRadiusScale:.8,narrowWidth:1024,activeOrbRatioNarrow:.22,backgroundOpacity:.5,overlayBlur:22,theme:`light`,auraMode:`native`,glowIntensity:1,breathingAmplitude:.03,breathePeriod:5,motionSpeed:1,zoom:null,glassOpacity:null,collapseMs:180,coreMs:120,trailMs:260,expandMs:360,closeCollapseMs:140,closeTrailMs:300,closeSettleMs:180,particlesEnabled:!0,particleCount:120,particleOpacity:.13,idleSleepMs:9e4,sleepExposureScale:.75,sleepBreathScale:.6,sleepSpeedScale:.5,chatEnabled:!0,chatMaxWidth:680,chatTop:56,chatGap:24,chatFade:.14,streamCps:42},t=`
<style>
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
  transition: opacity 300ms ease;
  scrollbar-width: thin;
  scrollbar-color: var(--orb-hairline) transparent;
  -webkit-mask-image: linear-gradient(to bottom, transparent 0%, #000 var(--chat-fade, 14%), #000 calc(100% - var(--chat-fade, 14%)), transparent 100%);
  mask-image: linear-gradient(to bottom, transparent 0%, #000 var(--chat-fade, 14%), #000 calc(100% - var(--chat-fade, 14%)), transparent 100%);
}
:host([data-phase='active']) .stream { opacity: 1; pointer-events: auto; }
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

/* 空场提示：展开但还没说话时，给一句很轻的邀请，避免一片空白 */
.empty {
  flex: 0 0 auto;
  align-self: center;
  max-width: 80%;
  padding: 6px 0 2px;
  font-size: 12.5px;
  line-height: 1.7;
  letter-spacing: 0.04em;
  color: var(--orb-text-faint);
  text-align: center;
  animation: rise 420ms ease both;
}

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
  background: rgba(var(--orb-scrim), 0.42);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
}
:host([data-phase='active']) .composer { pointer-events: auto; }
/* 隐形热区：上下各放宽一些，用户不用精确压在那条细线上 */
.composer::before {
  content: '';
  position: absolute;
  left: -10px;
  right: -10px;
  top: -18px;
  bottom: -14px;
}
.composer:hover,
.composer:focus-within,
.composer[data-has-text='1'] {
  opacity: 1;
  transform: translateX(-50%) translateY(0);
  border-bottom-color: var(--orb-accent);
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
</style>
<div class="chat">
  <div class="stream" part="stream" role="log" aria-live="polite"><div class="streamInner"></div></div>
  <div class="composer">
    <textarea rows="1" placeholder="说点什么…" aria-label="输入消息" maxlength="500"></textarea>
    <button class="send" type="button" aria-label="发送">
      <svg viewBox="0 0 24 24"><path d="M4 12h15M13 6l6 6-6 6" /></svg>
    </button>
  </div>
</div>
`,n=class{#e;#t;#n;#r;#i;#a;#o;#s=[];#c=null;#l=null;#u=null;#d=[];#f=0;#p=!1;#m;#h=!0;#g=[];#_=null;#v=null;#y=null;#b=!1;#x=!1;#S=0;#C=!1;#w=0;constructor(e,n,r){this.#e=e,this.#t=n,this.#m=r;let i=document.createElement(`div`);i.innerHTML=t,this.#n=i.querySelector(`.stream`),this.#r=i.querySelector(`.streamInner`),this.#i=i.querySelector(`.composer`),this.#a=i.querySelector(`textarea`),this.#o=i.querySelector(`.send`);for(let t of Array.from(i.children))e.append(t);this.#n.addEventListener(`scroll`,this.#I,{passive:!0}),this.#a.addEventListener(`input`,this.#z),this.#a.addEventListener(`keydown`,this.#B),this.#o.addEventListener(`click`,this.#V),this.#E()}get messages(){return this.#s.map(e=>({...e}))}setOptions(e){this.#m=e,this.#t.style.setProperty(`--chat-width`,`${e.chatMaxWidth}px`),this.#t.style.setProperty(`--chat-fade`,`${Math.round(e.chatFade*100)}%`)}layout(e,t,n){this.#n.style.top=`${Math.round(e)}px`,this.#n.style.height=`${Math.max(0,Math.round(t))}px`,this.#i.style.top=`${Math.round(n)}px`}focusInput(){this.#a.focus()}addMessage(e,t,n){this.#L(),this.#M();let r=this.#F(e,t,n);return this.#s.push({role:e,content:t}),this.#R(),r}addMessages(e){this.#L(),this.#M();for(let t of e)this.#F(t.role,t.content),this.#s.push({...t});this.#R()}clearMessages(){this.#M(),this.#s.length=0,this.#r.replaceChildren(),this.#g=[],this.#_=null,this.#v=null,this.#y=null,this.#b=!1,this.#x=!1,this.#O=null,this.#k=null,this.#h=!0,this.#E()}addToolChip(e,t,n){this.#L();let r=document.createElement(`div`);r.className=`msg`,r.dataset.role=`tool`;let i=document.createElement(`span`);i.className=`tool-inline`;let a=document.createElement(`span`);a.className=`tspin`;let o=document.createElement(`span`);o.className=`tlabel`,o.textContent=`正在${n}…`,i.append(a,o),r.append(i),this.#T(r);let s={role:`tool`,content:`正在${n}…`};this.#s.push(s),this.#g.push({callId:t,el:i,msg:s}),this.#R()}finishToolChip(e,t,n,r){let i=-1;if(n&&(i=this.#g.findIndex(e=>e.callId===n)),i<0&&(i=this.#g.findIndex(e=>!e.el.classList.contains(`done`)&&!e.el.classList.contains(`fail`))),i>=0){let{el:e,msg:n}=this.#g.splice(i,1)[0];e.classList.add(t?`done`:`fail`);let a=`${r}${t?` 完成`:` 失败`}`,o=e.querySelector(`.tlabel`);o&&(o.textContent=a),n.content=a}}startStream(){this.#L(),this.#M();let e=document.createElement(`div`);e.className=`msg`,e.dataset.role=`assistant`;let t=document.createElement(`div`);t.className=`text`;let n=document.createElement(`i`);n.className=`cursor`,t.append(n),e.append(t),this.#T(e),this.#c=e,this.#l=t,this.#u=n,this.#s.push({role:`assistant`,content:``}),this.#R()}appendStream(e){this.#l||this.startStream();for(let t of e)this.#d.push(t);this.#p||this.#N()}endStream(){this.#l&&this.#d.length&&(this.#d.splice(0).forEach(e=>this.#l.append(e)),this.#f=0),this.#P(),this.#M()}get streamingTextEl(){return this.#l}setThinking(e){if(e!==this.#b){if(this.#b=e,e){if(this.#D(),!this.#_){let e=document.createElement(`div`);e.className=`thinking`,e.setAttribute(`aria-label`,`正在思考`),e.append(document.createElement(`i`),document.createElement(`i`),document.createElement(`i`)),this.#_=e,this.#r.append(e),this.#R()}}else this.#_&&(this.#_.remove(),this.#_=null,this.#E())}}setListening(e){if(e!==this.#x){if(this.#x=e,e){if(this.#D(),!this.#v){let e=document.createElement(`div`);e.className=`listening`,e.setAttribute(`aria-label`,`正在聆听`);for(let t=0;t<5;t++)e.append(document.createElement(`i`));this.#v=e,this.#r.append(e),this.#R()}}else this.#v&&(this.#v.remove(),this.#v=null,this.#E())}}#T(e){this.#D(),this.#_?this.#r.insertBefore(e,this.#_):this.#v?this.#r.insertBefore(e,this.#v):this.#r.append(e)}#E(){if(this.#s.length||(this.#r.dataset.empty=`1`,this.#y||this.#b||this.#x))return;let e=document.createElement(`div`);e.className=`empty`,e.textContent=`直接说话就行，也可以打字。`,this.#y=e,this.#_?this.#r.insertBefore(e,this.#_):this.#r.append(e)}#D(){this.#r.dataset.empty=`0`,this.#y&&=(this.#y.remove(),null)}snapToBottom(){this.#h=!0,this.#E(),this.#R(!0)}#O=null;#k=null;#A=`user`;beginLive(e,t){this.#O&&this.#A===e||(this.#L(),this.#j(),this.#M(),this.#O=this.#F(e,``,t),this.#k=this.#O.querySelector(`.text`),this.#A=e,this.#R())}setLive(e){this.#k&&(this.#k.textContent=e,this.#R())}commitLive(e){this.#O&&(this.setLive(e),this.#s.push({role:this.#A,content:e}),this.#j())}discardLive(){this.#O&&this.#O.remove(),this.#O=null,this.#k=null,this.#A=`user`}#j(){this.#O&&!this.#O.textContent?.trim()&&this.#O.remove(),this.#O=null,this.#k=null,this.#A=`user`}setAssistantLive(e){this.#l||this.startStream();let t=this.#l;t.textContent=e,this.#u&&t.append(this.#u),this.#P(),this.#R()}#M(){this.#d.length=0,this.#p=!1,this.#f=0,this.#u?.remove(),this.#u=null,this.#c=null,this.#l=null}async#N(){this.#p=!0;let e=Math.max(1,this.#m.streamCps),t=performance.now();await new Promise(n=>{let r=i=>{if(!this.#l){n();return}this.#f+=(i-t)/1e3*e,t=i;let a=Math.floor(this.#f);for(;a-->0&&this.#d.length;)--this.#f,this.#l.insertBefore(document.createTextNode(this.#d.shift()),this.#u);this.#R(),this.#d.length?requestAnimationFrame(r):n()};requestAnimationFrame(r)}),this.#p=!1,this.#P()}#P(){if(!this.#l)return;let e=this.#l.textContent??``,t=this.#s[this.#s.length-1];t&&t.role===`assistant`&&(t.content=e)}#F(e,t,n){let r=document.createElement(`div`);r.className=`msg`,r.dataset.role=e,n&&(r.dataset.kind=n);let i=document.createElement(`div`);return i.className=`text`,i.textContent=t,r.append(i),this.#T(r),r}#I=()=>{this.#L()};#L(){let e=this.#n;this.#h=e.scrollHeight-e.scrollTop-e.clientHeight<24}#R(e=!1){if(!this.#h&&!e)return;if(e){this.#S=0,this.#n.scrollTop=this.#n.scrollHeight,this.#w=performance.now();return}this.#C=!0;let t=performance.now(),n=Math.max(0,70-(t-this.#w));this.#S||=window.setTimeout(()=>{this.#S=0,this.#C&&(this.#C=!1,this.#w=performance.now(),this.#h&&(this.#n.scrollTop=this.#n.scrollHeight))},n)}#z=()=>{let e=this.#a.value;this.#o.dataset.ready=e.trim().length>0?`1`:`0`,this.#i.dataset.hasText=e.length>0?`1`:`0`,this.#a.style.height=`auto`,this.#a.style.height=`${Math.min(96,this.#a.scrollHeight)}px`};#B=e=>{e.isComposing||e.keyCode===229||e.key===`Enter`&&!e.shiftKey&&(e.preventDefault(),this.#H())};#V=()=>{this.#H()};#H(){let e=this.#a.value.trim();e&&(this.#a.value=``,this.#z(),this.addMessage(`user`,e),this.#e.dispatchEvent(new CustomEvent(`orb:submit`,{detail:{text:e},bubbles:!0,composed:!0})))}clearInput(){this.#a.value=``,this.#z()}get composerEl(){return this.#i}},r=new Map;function i(e,t){r.set(e,t)}function a(e){return r.get(e)??null}var o=.42,s=.09,c=.34,l=e=>e,u=e=>e*e,d=e=>1-(1-e)**2,f=e=>1+2.70158*(e-1)**3+1.70158*(e-1)**2;function p(e){let t=/rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(e);if(!t)return null;let[n,r,i]=[Number(t[1]),Number(t[2]),Number(t[3])].map(e=>{let t=e/255;return t<=.03928?t/12.92:((t+.055)/1.055)**2.4});return .2126*n+.7152*r+.0722*i}function m(){let e=[document.body,document.documentElement],t=document.querySelector(`ai-orb-chat`)?.parentElement;t&&e.unshift(t);for(let t of e){if(!t)continue;let e=getComputedStyle(t).backgroundColor;if(!e||e===`transparent`||/rgba?\([^)]*,\s*0(\.0*)?\)$/.test(e))continue;let n=p(e);if(n!=null)return n>.55?`light`:`dark`}return window.matchMedia?.(`(prefers-color-scheme: dark)`).matches?`dark`:`light`}var h=`
<style>
:host {
  position: fixed;
  inset: 0;
  z-index: 2147483646;
  pointer-events: none;
  --orb-canvas: 480px;
  --dock-scale: 0.45;
  --active-scale: 1;
  --orb-tx: 0px;
  --orb-ty: 0px;
  --orb-scale: 0.45;
  --orb-fly-ms: 0ms;
  /* 主题 token（由 setOptions 的 theme 覆盖；这里是浅色默认值） */
  --orb-text: rgba(22, 32, 48, 0.9);
  --orb-text-dim: rgba(22, 32, 48, 0.52);
  --orb-text-faint: rgba(22, 32, 48, 0.34);
  --orb-accent: rgba(38, 112, 214, 0.78);
  --orb-scrim: 248, 250, 253;
  --orb-hairline: rgba(22, 32, 48, 0.12);
  --orb-particle: 40, 92, 170;
  --orb-aura: 46, 106, 196;
  --orb-close-bg: rgba(22, 32, 48, 0.05);
  --orb-close-bg-hover: rgba(22, 32, 48, 0.1);
  --orb-panel-bg: rgba(255, 255, 255, 0.86);
}
:host([data-theme='dark']) {
  --orb-text: rgba(238, 242, 248, 0.9);
  --orb-text-dim: rgba(232, 235, 240, 0.42);
  --orb-text-faint: rgba(232, 235, 240, 0.28);
  --orb-accent: rgba(143, 216, 255, 0.8);
  --orb-scrim: 8, 9, 11;
  --orb-hairline: rgba(255, 255, 255, 0.1);
  --orb-particle: 180, 210, 255;
  --orb-aura: 168, 206, 255;
  --orb-close-bg: rgba(255, 255, 255, 0.05);
  --orb-close-bg-hover: rgba(255, 255, 255, 0.1);
  --orb-panel-bg: rgba(14, 16, 20, 0.88);
}
.canvas {
  position: absolute;
  left: 50%;
  top: 50%;
  width: var(--orb-canvas);
  height: var(--orb-canvas);
  margin-left: calc(var(--orb-canvas) / -2);
  margin-top: calc(var(--orb-canvas) / -2);
  display: block;
  transform-origin: center center;
  transform: translate(var(--orb-tx), var(--orb-ty)) scale(var(--orb-scale));
  pointer-events: auto;
  cursor: pointer;
}
:host([data-phase='active']) .canvas { cursor: default; }
.particles {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  transition: opacity 520ms ease;
  pointer-events: none;
}
:host([data-phase='active']) .particles { opacity: 1; }
/* 声场环（方案 C）：画在球外圈，随频谱起伏。2D canvas 比改 WGSL 便宜得多，
   而且线宽可以保持恒定 —— 这正是「余光也能看见」所需要的。 */
.aura {
  position: absolute;
  left: 50%;
  top: 50%;
  display: block;
  pointer-events: none;
  opacity: 0;
  transition: opacity 420ms ease;
  will-change: transform, opacity;
}
:host([data-phase='active']) .aura { opacity: 1; }
.overlay {
  position: absolute;
  inset: 0;
  /* 薄纱色由主题 token 决定；模糊半径由 JS 跟随编排曲线逐帧写入
     （--orb-blur-cur = 遮罩进度 × 目标模糊），所以是「越来越糊」，
     而不是先蒙一层白纱再突然失焦。 */
  background: rgba(var(--orb-scrim), var(--orb-background-opacity, 0.5));
  backdrop-filter: blur(var(--orb-blur-cur, 0px)) saturate(0.94);
  -webkit-backdrop-filter: blur(var(--orb-blur-cur, 0px)) saturate(0.94);
  opacity: 0;
  pointer-events: none;
  will-change: opacity, backdrop-filter;
}
.trail {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 46px;
  height: 46px;
  margin: -23px 0 0 -23px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(200, 230, 255, 0.85), rgba(140, 192, 255, 0.25) 45%, rgba(140, 192, 255, 0) 70%);
  opacity: 0;
  transform: translate(var(--orb-tx), var(--orb-ty));
  pointer-events: none;
  will-change: opacity, transform;
}
/* 激活/关闭时从核心扩散的一圈能量环：让"坍缩→核心"这一步有明确的物理回应 */
.shock {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 40px;
  height: 40px;
  margin: -20px 0 0 -20px;
  border-radius: 50%;
  border: 1px solid rgba(180, 215, 255, 0.7);
  box-shadow: 0 0 18px rgba(140, 192, 255, 0.45), inset 0 0 12px rgba(180, 220, 255, 0.35);
  opacity: 0;
  transform: translate(var(--orb-tx), var(--orb-ty)) scale(0.2);
  pointer-events: none;
  will-change: opacity, transform;
}
.hint {
  position: absolute;
  right: var(--orb-dock-margin-x, 32px);
  bottom: calc(var(--orb-dock-margin-y, 44px) - 24px);
  width: var(--orb-dock-size, 168px);
  text-align: center;
  font-size: 11px;
  letter-spacing: 0.14em;
  color: var(--orb-text-faint);
  pointer-events: none;
  user-select: none;
  transition: opacity 400ms ease;
}
:host([data-phase='active']) .hint { opacity: 0; }
.close-hint {
  position: absolute;
  left: 50%;
  bottom: 22px;
  transform: translateX(-50%);
  width: 24px;
  height: 24px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  color: var(--orb-text-dim);
  background: var(--orb-close-bg);
  pointer-events: none;
  opacity: 0;
  cursor: pointer;
  transition: opacity 300ms ease, color 200ms ease, background 200ms ease;
}
:host([data-phase='active']) .close-hint { opacity: 1; pointer-events: auto; }
.close-hint:hover { color: var(--orb-text); background: var(--orb-close-bg-hover); }
.close-hint svg { width: 12px; height: 12px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; }
.unsupported {
  position: absolute;
  right: var(--orb-dock-margin-x, 32px);
  bottom: var(--orb-dock-margin-y, 44px);
  width: 220px;
  padding: 10px 12px;
  border: 1px solid var(--orb-hairline);
  border-radius: 8px;
  background: var(--orb-panel-bg);
  color: var(--orb-text-dim);
  font: 11px/1.6 system-ui, -apple-system, sans-serif;
  letter-spacing: 0.04em;
  pointer-events: auto;
  backdrop-filter: blur(8px);
}
.unsupported b { display: block; color: var(--orb-text); font-weight: 500; margin-bottom: 2px; }
</style>
<div class="overlay" part="overlay"></div>
<canvas class="particles" part="particles" aria-hidden="true"></canvas>
<canvas class="aura" part="aura" aria-hidden="true"></canvas>
<canvas class="canvas" part="canvas" role="button" tabindex="0" aria-label="双击唤起 AI 对话"></canvas>
<div class="trail" part="trail" aria-hidden="true"></div>
<div class="shock" part="shock" aria-hidden="true"></div>
<div class="close-hint" part="close" role="button" tabindex="0" aria-label="挂断并收起">
  <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" /></svg>
</div>
<div class="hint">双击唤起</div>
<div class="unsupported" hidden>
  <b>当前浏览器不支持 WebGPU</b>
  液态球无法渲染，对话功能不受影响。<br />建议使用 Chrome / Edge 113+、Safari 26+ 或 Firefox 141+（Windows）。
</div>
`,g=class extends HTMLElement{static get observedAttributes(){return[`dock-size`,`dock-margin-x`,`dock-margin-y`,`background-opacity`,`overlay-blur`,`glow-intensity`,`breathing-amplitude`,`motion-speed`,`zoom`,`glass-opacity`,`chat-enabled`,`orb`,`orb-preset`,`particles-enabled`]}#e={...e};#t;#n;#r;#i;#a;#o;#s;#c;#l=null;#u=null;#d=`idle`;#f=`idle`;#p=`light`;#m=.72;#h=0;#g=0;#_=[];#v=0;#y=0;#b=0;#x=!1;#S=1;#C=1;#w=480;#T=346;#E=.45;#D=0;#O=0;#k=0;#A=0;#j=168;#M=1;#N=0;#P=0;#F=null;#I=0;#L={tx:0,ty:0,scale:1,radius:1,exposure:1,glow:0,overlay:0};#R=0;#z=0;#B=-1e9;#V=0;#H=[];#U={tx:0,ty:0,scale:1,radius:1,exposure:1,glow:0,overlay:0};#W=!0;#G=-1;#K=0;#q=null;#J=[];#Y=0;#X=0;#Z=new Float32Array(32);#Q=null;#$=0;constructor(){super(),this.dataset.phase=`idle`,this.dataset.voice=`idle`,this.#t=this.attachShadow({mode:`open`}),this.#t.innerHTML=h,this.#n=this.#t.querySelector(`.canvas`),this.#r=this.#t.querySelector(`.particles`),this.#i=this.#t.querySelector(`.aura`),this.#a=this.#t.querySelector(`.trail`),this.#o=this.#t.querySelector(`.shock`),this.#s=this.#t.querySelector(`.overlay`),this.#c=this.#t.querySelector(`.unsupported`)}connectedCallback(){this.#ae(),this.#je(),this.#Me(),this.#n.addEventListener(`dblclick`,this.#le),this.#n.addEventListener(`click`,this.#ue),this.#n.addEventListener(`keydown`,this.#fe),this.#t.querySelector(`.close-hint`)?.addEventListener(`click`,this.#de),document.addEventListener(`keydown`,this.#pe),window.addEventListener(`resize`,this.#me),window.addEventListener(`pointermove`,this.#he,{passive:!0}),document.addEventListener(`visibilitychange`,this.#ge),this.#K=performance.now(),this.#oe()}disconnectedCallback(){this.#n.removeEventListener(`dblclick`,this.#le),this.#n.removeEventListener(`click`,this.#ue),this.#n.removeEventListener(`keydown`,this.#fe),this.#t.querySelector(`.close-hint`)?.removeEventListener(`click`,this.#de),document.removeEventListener(`keydown`,this.#pe),window.removeEventListener(`resize`,this.#me),window.removeEventListener(`pointermove`,this.#he),document.removeEventListener(`visibilitychange`,this.#ge),this.#Ce(),window.clearTimeout(this.#g),this.#Ie(),this.#l?.destroy(),this.#l=null}attributeChangedCallback(e,t,n){if(n==null)return;let r=()=>Number(n);switch(e){case`dock-size`:this.setOptions({dockOrbSize:r()});break;case`dock-margin-x`:this.setOptions({dockMarginX:r()});break;case`dock-margin-y`:this.setOptions({dockMarginY:r()});break;case`background-opacity`:this.setOptions({backgroundOpacity:r()});break;case`overlay-blur`:this.setOptions({overlayBlur:r()});break;case`glow-intensity`:this.setOptions({glowIntensity:r()});break;case`breathing-amplitude`:this.setOptions({breathingAmplitude:r()});break;case`motion-speed`:this.setOptions({motionSpeed:r()});break;case`zoom`:this.setOptions({zoom:r()});break;case`glass-opacity`:this.setOptions({glassOpacity:r()});break;case`chat-enabled`:this.setOptions({chatEnabled:n!==`false`});break;case`orb`:this.setOptions({orb:n});break;case`orb-preset`:this.setOptions({orbPreset:n});break;case`particles-enabled`:this.setOptions({particlesEnabled:n!==`false`})}}get phase(){return this.#d}get voiceState(){return this.#f}get orb(){return this.#l}get options(){return{...this.#e}}get chat(){return this.#u}setOptions(e){let t=this.#e.orb,n=this.#e.orbPreset;this.#e={...this.#e,...e},this.#je(),this.#Me(),(e.orb!==void 0&&e.orb!==t||e.orbPreset!==void 0&&e.orbPreset!==n)&&this.reloadOrb()}async reloadOrb(){this.#Ie(),this.#l?.destroy(),this.#l=null,this.#c.hidden=!0,this.#n.style.display=``,this.#F=null,this.#L=this.#ye(),this.#ke(this.#L),this.#Ae(this.#L.overlay),await this.#oe()}activate(){this.#ee(!0)}activateSilent(){this.#ee(!1)}#ee(e){this.#d===`active`?e&&this.#re():(this.#d=`active`,this.#re(),this.#be(),this.dispatchEvent(new CustomEvent(`orb:phase`,{detail:{phase:`active`,voice:e},bubbles:!0,composed:!0})))}deactivate(){this.#d!==`idle`&&(this.#d=`idle`,this.#re(),this.setVoiceState(`idle`),this.#Se(),this.dispatchEvent(new CustomEvent(`orb:phase`,{detail:{phase:`idle`},bubbles:!0,composed:!0})))}toggle(){this.#d===`idle`?this.activate():this.deactivate()}setVoiceState(e){e!==`idle`&&this.#re(),this.#f=e,this.dataset.voice=e,this.#l?.setVisualState(this.#ce()),this.#u?.setThinking(e===`thinking`&&this.#d===`active`),e!==`user`&&this.#u?.setListening(!1),this.#ie(),this.dispatchEvent(new CustomEvent(`orb:voice`,{detail:{state:e},bubbles:!0,composed:!0}))}setAudioBands(e){this.#l?.setAudioBands(e);let t=e?.all??0,n=e?.high??0;this.#X=Math.min(1,Math.max(0,t*.82+n*.18))}setAudioSpectrum(e){if(!e){this.#Z.fill(0);return}let t=Math.min(this.#Z.length,e.length);for(let n=0;n<t;n++)this.#Z[n]=e[n]}notifyActivity(){this.#re()}pulse(e=1){this.#B=performance.now(),this.#V=Math.max(this.#V,Math.min(1.4,e)),this.#re(),this.#te(.55*Math.min(1,e))}#te(e=1){let t=this.#o;for(let e of this.#H)window.clearTimeout(e);this.#H=[];let n=this.#ne();t.style.transition=`none`,t.style.opacity=`0`,t.style.transform=`translate(var(--orb-tx), var(--orb-ty)) scale(${(n*.5).toFixed(3)})`,this.#H.push(window.setTimeout(()=>{t.style.transition=`opacity 620ms cubic-bezier(0.16, 0.84, 0.44, 1), transform 620ms cubic-bezier(0.16, 0.84, 0.44, 1)`,t.style.opacity=String(.55*e),t.style.transform=`translate(var(--orb-tx), var(--orb-ty)) scale(${(n*2.2).toFixed(3)})`,this.#H.push(window.setTimeout(()=>{t.style.opacity=`0`},520))},16))}#ne(){return Math.max(.4,this.#L.scale*(this.#T/40))}addMessage(e,t,n){this.#u?.addMessage(e,t,n)}addMessages(e){this.#u?.addMessages(e)}clearMessages(){this.#u?.clearMessages()}get messages(){return this.#u?.messages??[]}addToolChip(e,t,n){this.#u?.addToolChip(e,t,n)}finishToolChip(e,t,n,r){this.#u?.finishToolChip(e,t,n,r)}startStream(){this.#u?.startStream()}appendStream(e){this.#u?.appendStream(e)}endStream(){this.#u?.endStream()}setAssistantLive(e){this.#u?.setAssistantLive(e)}beginLive(e,t){this.#u?.beginLive(e,t)}setLive(e){this.#u?.setLive(e)}commitLive(e){this.#u?.commitLive(e)}discardLive(){this.#u?.discardLive()}setThinking(e){this.#u?.setThinking(e)}setListening(e){this.#u?.setListening(e)}clearInput(){this.#u?.clearInput()}#re(){this.#K=performance.now()}#ie(){this.#d===`idle`?this.#n.setAttribute(`aria-label`,`双击唤起 AI 对话`):this.#n.setAttribute(`aria-label`,{idle:`AI 对话已展开，双击收起`,thinking:`AI 正在思考`,user:`正在聆听你说话`,ai:`AI 正在回答`}[this.#f])}#ae(){!this.#e.chatEnabled||this.#u||(this.#u=new n(this.#t,this,this.#e),this.#u.setOptions(this.#e))}async#oe(){let e=a(this.#e.orb);if(!e){console.warn(`[ai-orb-chat] 未注册的渲染体：${this.#e.orb}`),this.#se();return}let t=e(this.#n,this.#e);this.#l=t,this.#m=t.radiusFactor??.72,await t.init()?(this.dataset.engine=`ready`,this.#je(),t.setVisualState(this.#ce()),this.#Fe(),this.dispatchEvent(new CustomEvent(`orb:ready`,{bubbles:!0,composed:!0}))):(t.destroy(),this.#l=null,this.#se())}#se(){this.#c.hidden=!1,this.#n.style.display=`none`,this.dataset.engine=`unsupported`,this.#d=`active`,this.dataset.phase=`active`,this.#Pe(`--orb-scale`,`0`)}#ce(){return this.#d===`idle`?`dock`:{idle:`active`,thinking:`thinking`,user:`listening`,ai:`speaking`}[this.#f]}#le=()=>{this.hasAttribute(`data-follower`)?this.dispatchEvent(new CustomEvent(`orb:takeover`,{bubbles:!0,composed:!0})):this.toggle()};#ue=()=>{this.#d===`active`&&this.dispatchEvent(new CustomEvent(`orb:interrupt`,{bubbles:!0,composed:!0}))};#de=()=>{this.deactivate()};#fe=e=>{(e.key===`Enter`||e.key===` `)&&(e.preventDefault(),this.toggle())};#pe=e=>{e.key===`Escape`&&document.documentElement.dataset.panelOpen!==`1`&&this.deactivate()};#me=()=>{window.clearTimeout(this.#h),this.#h=window.setTimeout(()=>this.#je(),150)};#he=e=>{if(this.#d===`active`){this.#z=0;return}let t=e.clientX-this.#k,n=e.clientY-this.#A,r=Math.hypot(t,n),i=Math.max(24,this.#j/2);this.#z=r<i*1.5?Math.min(1,Math.max(0,1-Math.max(0,r-i*.72)/(i*.78))):0};#ge=()=>{document.hidden||(this.#b=performance.now())};#_e(){return{tx:this.#D,ty:this.#O,scale:this.#E}}#ve(){return{tx:this.#N,ty:this.#P,scale:this.#M}}#ye(){return{...this.#d===`active`?this.#ve():this.#_e(),radius:1,exposure:1,glow:this.#Te(),overlay:+(this.#d===`active`)}}#be(){let e=this.#_e(),t=this.#ve(),n=e.scale*.16,r=this.#e,i=[{t:r.collapseMs,tx:e.tx,ty:e.ty,scale:n,radius:.25,exposure:2.4,glow:.55,overlay:.12,ease:u},{t:r.collapseMs+r.coreMs,tx:e.tx,ty:e.ty,scale:n*.92,radius:.2,exposure:3.1,glow:.95,overlay:.3,ease:d},{t:r.collapseMs+r.coreMs+r.trailMs,tx:t.tx,ty:t.ty,scale:Math.max(n*1.4,t.scale*.22),radius:.45,exposure:2.2,glow:.6,overlay:.62,ease:d},{t:r.collapseMs+r.coreMs+r.trailMs+r.expandMs,tx:t.tx,ty:t.ty,scale:t.scale,radius:1,exposure:1,glow:this.#Te(),overlay:1,ease:f}];this.#Ee(i,()=>{this.#d===`active`&&(this.#xe(),this.#l?.setVisualState(this.#ce()),this.dispatchEvent(new CustomEvent(`orb:settled`,{detail:{phase:`active`},bubbles:!0,composed:!0})))}),this.#we(r.collapseMs+r.coreMs,r.trailMs),window.setTimeout(()=>{this.#d===`active`&&this.#te(1)},r.collapseMs+Math.round(r.coreMs*.5)),window.clearTimeout(this.#g),this.#g=window.setTimeout(()=>{this.#d===`active`&&this.#xe()},r.collapseMs+r.coreMs+r.trailMs)}#xe(){this.dataset.phase!==`active`&&(this.dataset.phase=`active`,this.#u?.setThinking(this.#f===`thinking`),this.#u?.snapToBottom(),this.#ie())}#Se(){let e=this.#_e(),t=this.#ve(),n=t.scale*.16,r=this.#e;window.clearTimeout(this.#g),this.dataset.phase=`idle`,this.#l?.setVisualState(this.#ce()),this.#ie();let i=[{t:r.closeCollapseMs,tx:t.tx,ty:t.ty,scale:n,radius:.25,exposure:2.6,glow:.7,overlay:.6,ease:u},{t:r.closeCollapseMs+r.closeTrailMs,tx:e.tx,ty:e.ty,scale:Math.max(n,e.scale*.42),radius:.5,exposure:1.7,glow:.4,overlay:.18,ease:d},{t:r.closeCollapseMs+r.closeTrailMs+r.closeSettleMs,tx:e.tx,ty:e.ty,scale:e.scale,radius:1,exposure:1,glow:this.#Te(),overlay:0,ease:f}];this.#Ee(i,()=>{this.#d===`idle`&&(this.#l?.setVisualState(this.#ce()),this.dispatchEvent(new CustomEvent(`orb:settled`,{detail:{phase:`idle`},bubbles:!0,composed:!0})))}),this.#we(r.closeCollapseMs,r.closeTrailMs),window.setTimeout(()=>{this.#d===`idle`&&this.#te(.5)},r.closeCollapseMs)}#Ce(){for(let e of this.#_)window.clearTimeout(e);this.#_=[],this.#a.style.transition=`none`,this.#a.style.opacity=`0`}#we(e,t){this.#Ce();let n=this.#a,r=Math.round(t*.5);this.#_.push(window.setTimeout(()=>{n.style.transition=`opacity ${r}ms ease`,n.style.opacity=`0.9`,this.#_.push(window.setTimeout(()=>{n.style.opacity=`0`},r))},e))}#Te(){return 0}#Ee(e,t){let n=e[e.length-1].t;this.#F={frames:e,start:performance.now(),dur:Math.max(1,n),from:{...this.#L},onDone:t},this.#re(),this.#De(),window.clearInterval(this.#I),this.#I=window.setInterval(()=>this.#De(),16)}#De(){if(!this.#F){window.clearInterval(this.#I),this.#I=0;return}let e=performance.now(),t=this.#Oe(e);t&&(this.#L=t,this.#ke(t),this.#Ae(t.overlay),this.#F||(window.clearInterval(this.#I),this.#I=0))}#Oe(e){let t=this.#F;if(!t)return null;let n=e-t.start;if(n>=t.dur){let e=t.frames[t.frames.length-1],n={tx:e.tx,ty:e.ty,scale:e.scale,radius:e.radius,exposure:e.exposure,glow:e.glow,overlay:e.overlay};return this.#F=null,t.onDone?.(),n}let r={t:0,...t.from,ease:l};for(let e of t.frames){if(n<=e.t){let t=Math.max(1,e.t-r.t),i=e.ease((n-r.t)/t);return{tx:r.tx+(e.tx-r.tx)*i,ty:r.ty+(e.ty-r.ty)*i,scale:r.scale+(e.scale-r.scale)*i,radius:r.radius+(e.radius-r.radius)*i,exposure:r.exposure+(e.exposure-r.exposure)*i,glow:r.glow+(e.glow-r.glow)*i,overlay:r.overlay+(e.overlay-r.overlay)*i}}r=e}return null}#ke(e){this.#Pe(`--orb-tx`,`${e.tx.toFixed(1)}px`),this.#Pe(`--orb-ty`,`${e.ty.toFixed(1)}px`),this.#Pe(`--orb-scale`,e.scale.toFixed(4)),this.#U=e,this.#W=!1}#Ae(e){let t=Math.min(1,Math.max(0,e));if(Math.abs(t-this.#G)<.004)return;this.#G=t,this.#s.style.opacity=String(t);let n=t*this.#e.overlayBlur;this.#Pe(`--orb-blur-cur`,`${n.toFixed(1)}px`)}#je(){let e=this.#e,t=Math.max(1,window.innerWidth),n=Math.max(1,window.innerHeight);this.#S=t,this.#C=n;let r=Math.round(Math.min(Math.max(n*e.orbCanvasRatio,280),620)),i=r*this.#m;this.#w=r,this.#T=i,this.#Pe(`--orb-canvas`,`${r}px`);let a=t<e.narrowWidth?Math.max(e.dockOrbSizeMin,e.dockOrbSize*.8):e.dockOrbSize;this.#Pe(`--orb-dock-size`,`${a}px`),this.#Pe(`--orb-dock-margin-x`,`${e.dockMarginX}px`),this.#Pe(`--orb-dock-margin-y`,`${e.dockMarginY}px`),this.#E=a/i;let o=t-e.dockMarginX-a/2,s=n-e.dockMarginY-a/2;this.#D=o-t/2,this.#O=s-n/2,this.#k=o,this.#A=s,this.#j=a;let c=n*(t<e.narrowWidth?e.activeOrbRatioNarrow:e.activeOrbRatio)*e.activeRadiusScale;if(this.#M=c/i,this.#N=0,this.#P=(e.activeOrbCenterY-.5)*n,this.#F||(this.#L=this.#ye(),this.#ke(this.#L),this.#Ae(this.#L.overlay)),this.#u){let t=this.#M*i,r=n*e.activeOrbCenterY-t/2,a=n*e.activeOrbCenterY+t/2,o=e.chatTop,s=Math.max(120,r-e.chatTop-e.chatGap),c=a+22;this.#u.layout(o,s,c)}}#Me(){let e=this.#e;this.#Pe(`--orb-background-opacity`,String(e.backgroundOpacity)),this.#Pe(`--orb-overlay-blur`,`${e.overlayBlur}px`),this.#Pe(`--orb-dock-margin-x`,`${e.dockMarginX}px`),this.#Pe(`--orb-dock-margin-y`,`${e.dockMarginY}px`),this.#Ne(e.theme),this.#i.style.display=e.auraMode===`ring`?``:`none`,this.#u&&this.#u.setOptions(e),e.particlesEnabled||(this.#q=null)}#Ne(e){let t=e===`auto`?m():e;this.dataset.theme!==t&&(this.dataset.theme=t),this.#p=t}#Pe(e,t){this.style.setProperty(e,t)}#Fe(){this.#x||(this.#x=!0,this.#b=performance.now(),this.#y=requestAnimationFrame(this.#Le))}#Ie(){this.#x=!1,cancelAnimationFrame(this.#y),window.clearInterval(this.#I),this.#I=0}#Le=e=>{if(!this.#x)return;this.#y=requestAnimationFrame(this.#Le);let t=Math.min(.05,Math.max(.001,(e-this.#b)/1e3));this.#b=e,this.#v+=t;let n=this.#e,r=this.#d===`active`&&this.#f===`idle`&&e-this.#K>n.idleSleepMs,i=this.#F?this.#L:this.#ye();this.#F||(this.#L=i),(this.#W||i.tx!==this.#U.tx)&&this.#Pe(`--orb-tx`,`${i.tx.toFixed(1)}px`),(this.#W||i.ty!==this.#U.ty)&&this.#Pe(`--orb-ty`,`${i.ty.toFixed(1)}px`),(this.#W||i.scale!==this.#U.scale)&&this.#Pe(`--orb-scale`,i.scale.toFixed(4)),this.#W=!1,this.#U=i;let a=1+n.breathingAmplitude*(r?n.sleepBreathScale:1)*Math.sin(this.#v/n.breathePeriod*Math.PI*2),l=n.motionSpeed*(r?n.sleepSpeedScale:1),u=i.exposure*(r?n.sleepExposureScale:1),d=a*i.radius,f=i.glow;this.#R+=(this.#z-this.#R)*Math.min(1,t*10);let p=0;if(this.#V>.001){let t=(e-this.#B)/1e3;p=this.#V*Math.exp(-t/.22),p<.002&&(this.#V=0)}{let e=this.#X>this.#Y?s:c;this.#Y+=(this.#X-this.#Y)*(1-Math.exp(-t/e)),this.#Y<.0015&&(this.#Y=0)}let m={};n.zoom!=null&&(m[5]=n.zoom),n.glassOpacity!=null&&(m[20]=n.glassOpacity),this.#l?.setOverrides({radiusScale:d*(1+this.#R*.012+p*.02),speedScale:l*(1+p*.6),exposureScale:u*(1+this.#R*.08+p*.22),edgeGlow:f+n.glowIntensity*.12+this.#R*.3+p*.5+(n.auraMode===`native`?this.#Y*o:0),byIndex:m}),this.#Ae(i.overlay),n.auraMode===`ring`&&(this.#d===`active`||this.#F)&&this.#Re(i,t),n.particlesEnabled&&(this.#d===`active`||this.#F)&&this.#Be(t)};#Re(e,t){let n=this.#i,r=this.#T*e.scale*.5,i=Math.ceil((r+64)*2),a=Math.min(window.devicePixelRatio||1,2),o=Math.floor(i*a);(n.width!==o||n.height!==o)&&(n.width=o,n.height=o,n.style.width=`${i}px`,n.style.height=`${i}px`,n.style.marginLeft=`${-i/2}px`,n.style.marginTop=`${-i/2}px`,this.#Q=null),this.#Q||=n.getContext(`2d`);let s=this.#Q;if(!s)return;n.style.transform=`translate(${e.tx.toFixed(1)}px, ${e.ty.toFixed(1)}px)`;let c=0;for(let e=0;e<this.#Z.length;e++)c+=this.#Z[e];c/=this.#Z.length,this.#$+=(c-this.#$)*Math.min(1,t*12);let l=o/2,u=o/2,d=this.#Z.length,f=r*a,p=this.#f===`ai`||this.#f===`user`;s.clearRect(0,0,o,o),s.lineCap=`round`,s.beginPath(),s.arc(l,u,f+9*a,0,Math.PI*2),s.strokeStyle=`rgba(${this.#ze()}, ${(.1+this.#$*.3).toFixed(3)})`,s.lineWidth=1.1*a,s.stroke();let m=10+34*Math.min(1,this.#$*2.2);for(let e=0;e<d;e++){let t=this.#Z[e],n=e/d*Math.PI*2-Math.PI/2,r=f+9*a,i=(1.2+t*m)*a,o=l+Math.cos(n)*r,c=u+Math.sin(n)*r,h=l+Math.cos(n)*(r+i),g=u+Math.sin(n)*(r+i),_=p?.28+t*.62:.1+t*.3;s.strokeStyle=`rgba(${this.#ze()}, ${_.toFixed(3)})`,s.lineWidth=2*a,s.lineCap=`round`,s.beginPath(),s.moveTo(o,c),s.lineTo(h,g),s.stroke()}}#ze(){return this.#p===`light`?`46, 106, 196`:`168, 206, 255`}#Be(e){let t=this.#r,n=Math.min(window.devicePixelRatio||1,2),r=Math.floor(this.#S*n),i=Math.floor(this.#C*n);(t.width!==r||t.height!==i)&&(t.width=r,t.height=i),this.#q||=t.getContext(`2d`);let a=this.#q;if(!a)return;let o=this.#e;this.#J.length!==o.particleCount&&(this.#J=Array.from({length:o.particleCount},()=>({x:Math.random()*r,y:Math.random()*i,vx:(Math.random()-.5)*6*n,vy:(Math.random()-.5)*6*n,r:(Math.random()*1.1+.3)*n}))),a.clearRect(0,0,r,i),a.fillStyle=`rgba(${this.#p===`light`?`40, 92, 170`:`180, 210, 255`}, ${o.particleOpacity})`;for(let t of this.#J)t.x+=t.vx*e,t.y+=t.vy*e,t.x<0?t.x+=r:t.x>r&&(t.x-=r),t.y<0?t.y+=i:t.y>i&&(t.y-=i),a.beginPath(),a.arc(t.x,t.y,t.r,0,Math.PI*2),a.fill()}},_=`// Glass Liquid — curated flow programs with an optional glass shell.
//
// The local presets use independent spatial models for Siri-like sheets,
// symmetric colour waves, aurora curtains, frost flow, neural interference,
// liquid chrome, opal interference, a voice membrane, a blue liquid drop, and
// a violet molten core, plus a chromatic brushed-metal field. The legacy liquid
// bank remains below for compatibility with older shared shader
// code, but is not exposed as an editor preset.
//
// When enabled, the shell uses a signed-distance refraction profile around the
// boundary, asymmetric spectral separation, and two directional edge lights.
// The fluid is resampled through that profile, so glass changes the image rather
// than covering it with a translucent white face.
//
// ---------------------------------------------------------------------------
// Analytic optical diffusion without a convolution.
// ---------------------------------------------------------------------------
//
// The source used a thirteen-tap 5px frost blur. This port keeps one fluid
// evaluation and applies the equivalent gaussian in the frequency domain:
//
//  1. **Per-octave attenuation, inside \`lqFbm\`.** Convolving with a gaussian of
//     sigma σ scales a component at wavenumber k by exp(-k²σ²/2). An fbm's
//     octaves have known wavenumbers — octave i sits at 2.03^i times the base —
//     so each octave's amplitude is scaled by its own factor and the field is
//     sampled once. The mean is untouched (a blur preserves it), so only the
//     deviation from 0.5 is scaled and the \`s / m\` normaliser is unchanged.
//     Every caller passes the diffusion sigma in its own input units, so detail
//     attenuation continues to track \`zoom\`.
//
//  2. **Value-space quadrature at every pointwise nonlinearity.** This is the
//     part that is easy to get wrong. \`blur(ridge(f))\` is not \`ridge(blur(f))\`:
//     attenuating first and ridging after leaves filaments thin and hard where
//     the blur should have spread them, which is exactly how the earlier
//     analytic-edge version failed. So \`lqFbm\` also returns the standard
//     deviation of the detail the attenuation removed — within a gaussian
//     window an octave scaled by β contributes variance ∝ (1 - β²), NOT
//     (1 - β)² — and every nonlinearity applied to that field integrates it
//     back out with a three-point Gauss-Hermite rule (exact through the fourth
//     moment). Three evaluations of a function of one float, not three
//     evaluations of the noise. \`lqRidgeS\`/\`lqStepS\`/\`lqPowS\` below; Nectar's
//     branch has the fbm inside a \`sin\`, where the same integral is closed-form
//     (E[sin(A + cε)] = sin A · exp(-c²σ²/2)), so it damps the sine instead.
//
//  3. **One continuous disc edge.** The fluid always reaches the sphere
//     boundary. Glass changes its sample coordinates near that boundary, so
//     toggling the shell cannot reveal a second hard-clipped silhouette.
//
// Deliberately NOT ported, and why:
//   - The liquid grain. It sits below display-pixel scale and adds noise rather
//     than useful optical detail, so Glass Liquid has no Grain parameter.
//   - The two contact-shadow ellipses under the ball and its outer
//     \`0 26px 50px -24px\` drop shadow. The Orbs family cut the source app's
//     floor at the user's request, and the export paints over \`Color.black\`.
//
// Scalar controls are packed after \`time\`; the colour bank starts on the next
// 16-byte boundary. The TypeScript writer mirrors this order exactly.
struct Uniforms {
  size:           vec2<f32>,
  time:           f32,
  speed:          f32,
  radius:         f32,
  zoom:           f32,
  warp:           f32,
  ridgeAmt:       f32,
  sharp:          f32,
  shade:          f32,
  sheen:          f32,
  gloss:          f32,
  shellMidAlpha:  f32,
  shellEdgeAlpha: f32,
  exposure:       f32,
  style:          f32,
  edgeSoftness:   f32,
  edgeGlow:       f32,
  paletteCount:   f32,
  glassEnabled:   f32,
  glassOpacity:   f32,
  contourDeform:  f32,
  bandDensity:    f32,
  chromaticShift: f32,
  metalScale:     f32,
  metalStretch:   f32,
  metalAngle:     f32,
  metalOffset:    f32,
  metalPhase:     f32,
  metalEvolution: f32,
  metalRoughness: f32,
  metalDepth:     f32,
  particleDensity: f32,
  ribbonCount:     f32,
  ribbonWidth:     f32,
  ribbonTwist:     f32,
  ribbonFold:      f32,
  ribbonBreath:    f32,
  particleSize:    f32,
  particleBloom:   f32,
  colorA:         vec4<f32>,
  colorB:         vec4<f32>,
  colorC:         vec4<f32>,
  colorD:         vec4<f32>,
  highlightColor: vec4<f32>,
  shellInner:     vec4<f32>,
  shellMid:       vec4<f32>,
  shellEdge:      vec4<f32>,
  sheenColor:     vec4<f32>,
  specColor:      vec4<f32>,
  canvasColor:    vec4<f32>,
  glowColor:      vec4<f32>,
  paletteStop0:    vec4<f32>,
  paletteStop1:    vec4<f32>,
  paletteStop2:    vec4<f32>,
  paletteStop3:    vec4<f32>,
  paletteStop4:    vec4<f32>,
  paletteStop5:    vec4<f32>,
  paletteStop6:    vec4<f32>,
  paletteStop7:    vec4<f32>,
  paletteStop8:    vec4<f32>,
  paletteStop9:    vec4<f32>,
  paletteStop10:   vec4<f32>,
  paletteStop11:   vec4<f32>,
};
@group(0) @binding(0) var<uniform> u: Uniforms;

// ── The Orbs edge bank (WGSL) ───────────────────────────────────────────────
// Two knobs every orb on the shelf carries: how soft its limb is, and how far
// it glows past it. See effects/_shared/edge.ts for the contract.
//
// THREE files must agree — edge.wgsl, edge.metal, edge.sksl. Change one, change
// all three, or the Code tab starts lying about what it ships.

// How much wider than the shipped feather the Edge softness slider is asking
// for. 0.005 is the width every orb was authored with, so this returns exactly
// 0 at the default and every edge expression collapses to the constant it
// replaced — the defaults are bit-identical to the render before the bank.
fn mfEdgeD(soft: f32) -> f32 {
  return soft - 0.005;
}

// The halo an orb throws past its own limb.
//
// ADDED, never subtracted: whatever the orb already paints out there — a
// studio wall, its own exp() bleed, the sheet's cones — survives untouched.
// That is what lets this be adopted by seventeen shaders whose backdrops have
// nothing in common.
//
// \`glow == 0\` returns \`col\` by an early exit rather than by adding zero. Both
// are exact, but the exit also skips the length() on the ~60% of the frame
// outside the ball, and 0 is the default.
fn mfEdgeGlow(col: vec3<f32>, uv: vec2<f32>, ctr: vec2<f32>, rad: f32,
              soft: f32, glow: f32, glowRGB: vec3<f32>) -> vec3<f32> {
  if (glow <= 0.0) { return col; }
  let r = length(uv - ctr);
  // Fenced to the outside of the limb by the same softness the limb uses, so
  // the halo starts where the ball stops however soft that boundary is. Without
  // it the exp() is 1 across the whole disc and washes the face flat.
  let outside = smoothstep(rad - max(soft, 0.0005), rad + max(soft, 0.0005), r);
  return col + glowRGB * (glow * exp(-max(r - rad, 0.0) * 11.0) * outside);
}


// ── The Orbs palette-ramp bank (WGSL) ───────────────────────────────────────
// The add/remove colour list, evaluated INSIDE the shader so every stop paints
// its own region of the ball instead of being averaged into a role colour.
// See effects/_shared/ramp.ts for the contract.
//
// THREE files must agree — ramp.wgsl, ramp.metal, ramp.sksl. Change one, change
// all three, or the Code tab starts lying about what it ships.

// One stop, picked without a dynamic array index.
//
// A \`var\` array indexed by a runtime value is the shape that spills to scratch
// memory on the GPUs this project cares about (PERFORMANCE.md); twelve selects
// stay in registers and are branchless on every backend. Written once here so
// no adopting shader has to.
fn mfRampPick(idx: f32,
              s0: vec3<f32>, s1: vec3<f32>, s2:  vec3<f32>, s3:  vec3<f32>,
              s4: vec3<f32>, s5: vec3<f32>, s6:  vec3<f32>, s7:  vec3<f32>,
              s8: vec3<f32>, s9: vec3<f32>, s10: vec3<f32>, s11: vec3<f32>) -> vec3<f32> {
  var r = s0;
  r = select(r, s1,  idx == 1.0);
  r = select(r, s2,  idx == 2.0);
  r = select(r, s3,  idx == 3.0);
  r = select(r, s4,  idx == 4.0);
  r = select(r, s5,  idx == 5.0);
  r = select(r, s6,  idx == 6.0);
  r = select(r, s7,  idx == 7.0);
  r = select(r, s8,  idx == 8.0);
  r = select(r, s9,  idx == 9.0);
  r = select(r, s10, idx == 10.0);
  r = select(r, s11, idx == 11.0);
  return r;
}

// The CYCLIC ramp: \`t\` wraps, and the last stop runs back into the first.
//
// This is the one a generated-colour orb wants. Prism's hue comes from a cosine
// of an unbounded scalar field, so its colour has always been periodic — a
// clamped ramp would flatten every band past t == 1 into one colour and throw
// the banding away. Wrapping keeps the field's structure exactly and only swaps
// what the structure is *coloured* with.
//
// NOT ONE BRANCH IN HERE, and that is load-bearing rather than tidy. An orb
// evaluates this next to a \`fract(sin(x) * 43758.5453)\` grain hash, which
// amplifies a last-bit change in its argument by ~44000x. Any \`if\` in this file
// or at a call site splits the fragment's basic block, the compiler stops
// folding \`uv / rad\` into its uses, and the hash turns that into speckle up to
// 33/255 — measured, on exactly the first cut of this bank. Straight-line code
// keeps the untouched render bit-identical. Same reasoning as the early-out
// guards every orb carries; see the note in orb-prism.wgsl.
fn mfRampCyc(tIn: f32, n: f32,
             s0: vec3<f32>, s1: vec3<f32>, s2:  vec3<f32>, s3:  vec3<f32>,
             s4: vec3<f32>, s5: vec3<f32>, s6:  vec3<f32>, s7:  vec3<f32>,
             s8: vec3<f32>, s9: vec3<f32>, s10: vec3<f32>, s11: vec3<f32>) -> vec3<f32> {
  let k  = clamp(floor(n + 0.5), 1.0, 12.0);
  let x  = fract(tIn) * k;
  let i0 = min(floor(x), k - 1.0);
  let i1 = select(i0 + 1.0, 0.0, i0 + 1.0 >= k);   // the wrap
  return mix(mfRampPick(i0, s0, s1, s2, s3, s4, s5, s6, s7, s8, s9, s10, s11),
             mfRampPick(i1, s0, s1, s2, s3, s4, s5, s6, s7, s8, s9, s10, s11),
             x - i0);
}

// The CLAMPED ramp: stop 0 at t == 0, the last stop at t == 1, held outside.
//
// This is the one an orb with an authored dark→light body ramp wants — the
// four-stop Deep/Mid/Surge/Crest shape, where the ends really are ends.
//
// Branchless for the same reason as \`mfRampCyc\`. The single-stop case falls out
// of the arithmetic rather than needing an early return: k == 1 makes the span
// zero, so x is 0, i0 is 0 and the mix weight is 0 — s0, exactly.
fn mfRampLin(tIn: f32, n: f32,
             s0: vec3<f32>, s1: vec3<f32>, s2:  vec3<f32>, s3:  vec3<f32>,
             s4: vec3<f32>, s5: vec3<f32>, s6:  vec3<f32>, s7:  vec3<f32>,
             s8: vec3<f32>, s9: vec3<f32>, s10: vec3<f32>, s11: vec3<f32>) -> vec3<f32> {
  let k  = clamp(floor(n + 0.5), 1.0, 12.0);
  let x  = clamp(tIn, 0.0, 1.0) * (k - 1.0);
  let i0 = clamp(floor(x), 0.0, max(k - 2.0, 0.0));
  return mix(mfRampPick(i0,     s0, s1, s2, s3, s4, s5, s6, s7, s8, s9, s10, s11),
             mfRampPick(i0 + 1.0, s0, s1, s2, s3, s4, s5, s6, s7, s8, s9, s10, s11),
             x - i0);
}

// ── The ramp as ONE value ───────────────────────────────────────────────────
//
// Thirteen uniforms is a reasonable thing for a shader to hold and a terrible
// thing for a helper to take. Several orbs make their body colour deep inside
// one — Glass·Liquid's fluid, the studio orbs' environment mirrors — and in the
// MSL these files are transcribed against, a helper cannot read the stitchable
// entry point's arguments, so the palette has to be handed down. Bundled like
// this that is one parameter instead of thirteen, and the three languages stay
// line-for-line.
//
// The stops come back out by CONSTANT index only, so this is still not a
// dynamically indexed array and still cannot spill to scratch memory.
struct MfRamp {
  n:   f32,
  s0:  vec3<f32>, s1:  vec3<f32>, s2:  vec3<f32>, s3:  vec3<f32>,
  s4:  vec3<f32>, s5:  vec3<f32>, s6:  vec3<f32>, s7:  vec3<f32>,
  s8:  vec3<f32>, s9:  vec3<f32>, s10: vec3<f32>, s11: vec3<f32>,
};

fn mfRampOf(n: f32,
            s0: vec3<f32>, s1: vec3<f32>, s2:  vec3<f32>, s3:  vec3<f32>,
            s4: vec3<f32>, s5: vec3<f32>, s6:  vec3<f32>, s7:  vec3<f32>,
            s8: vec3<f32>, s9: vec3<f32>, s10: vec3<f32>, s11: vec3<f32>) -> MfRamp {
  return MfRamp(n, s0, s1, s2, s3, s4, s5, s6, s7, s8, s9, s10, s11);
}

fn mfRampCycR(t: f32, r: MfRamp) -> vec3<f32> {
  return mfRampCyc(t, r.n, r.s0, r.s1, r.s2, r.s3, r.s4, r.s5,
                   r.s6, r.s7, r.s8, r.s9, r.s10, r.s11);
}

fn mfRampLinR(t: f32, r: MfRamp) -> vec3<f32> {
  return mfRampLin(t, r.n, r.s0, r.s1, r.s2, r.s3, r.s4, r.s5,
                   r.s6, r.s7, r.s8, r.s9, r.s10, r.s11);
}


// Fluid geometry, in ball radii (|p| == 1 on the ball's edge, y up).
const GL_FU:   f32 = 0.88172043;   // canvas half-side = 0.82/0.93 R

// Pure fluid keeps tighter diffusion; enabling glass restores the source's 5px
// frosted diffusion inside the inset shell.
const GL_BSIG_CLEAR: f32 = 0.01800000;
const GL_BSIG_GLASS: f32 = 0.03990000;

// --- the three constants the frequency-domain blur is fitted on -------------
// A gaussian's response is exp(-k²σ²/2), so GL_KA is k²/2 for the wavenumber
// where smoothstep-interpolated value noise actually keeps its energy. The
// textbook choice — one cycle per noise cell, k = 2π, GL_KA = 19.74 — blurs too
// hard, because the smoothstep interpolation is itself a low-pass and pulls the
// effective k down to about 3.5. Fitted against the 13-tap render.
const GL_KA:  f32 = 6.0;
// (2.03)² — how σ grows, in its own octave's cells, from one octave to the next.
const GL_KG:  f32 = 4.1209;
// The warp field displaces the fluid rather than colouring it, so blurring the
// image does not attenuate it as strongly as the model says. Also fitted.
const GL_KWA: f32 = 0.5;
// One value-noise octave's standard deviation about its own mean, as a fraction
// of its range — the scale that turns "amplitude the attenuation removed" into
// "how far the removed detail typically pushed the value".
const GL_KR:  f32 = 0.32;
const GL_GH:  f32 = 1.73205081;   // sqrt(3), the 3-point Gauss-Hermite abscissa

// Pure fluid reaches the ball edge.
const GL_CLEAR_EA: f32 = 0.995;
const GL_CLEAR_EB: f32 = 1.04;

// ---------------------------------------------------------------------------
// The sheet's liquid noise bank. Five octaves, gain .5, normalised by the
// weight sum, and rotated every octave. This is NOT the bank the sheet's Prism
// screen uses (a different hash, gain .55, unnormalised, no rotation).
// ---------------------------------------------------------------------------
fn lqHash(pIn: vec2<f32>) -> f32 {
  var p = fract(pIn * vec2<f32>(123.34, 456.21));
  p = p + vec2<f32>(dot(p, p + vec2<f32>(45.32)));
  return fract(p.x * p.y);
}

fn lqNoise(p: vec2<f32>) -> f32 {
  let i = floor(p);
  var f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(lqHash(i), lqHash(i + vec2<f32>(1.0, 0.0)), f.x),
             mix(lqHash(i + vec2<f32>(0.0, 1.0)), lqHash(i + vec2<f32>(1.0, 1.0)), f.x), f.y);
}

// The fbm, pre-blurred. \`bs\` is the blur's sigma expressed in THIS call's input
// units — the caller scales it by whatever it scaled the domain by. Returns
// \`.x\` the attenuated value and \`.y\` the standard deviation of the detail the
// attenuation took out, which is what a following nonlinearity has to integrate
// over. Both are exact for a gaussian window: the surviving amplitude is β and
// the variance that leaves is (1 - β²), per octave, weighted by that octave's
// own share of the normalised sum.
fn lqFbm(pIn: vec2<f32>, bs: f32) -> vec2<f32> {
  var p = pIn;
  var s:  f32 = 0.0;
  var a:  f32 = 0.5;
  var m:  f32 = 0.0;
  var vr: f32 = 0.0;
  let e = -GL_KA * bs * bs;
  var g: f32 = 1.0;
  for (var i: i32 = 0; i < 5; i = i + 1) {
    let b = exp(e * g);
    s  = s  + a * (0.5 + b * (lqNoise(p) - 0.5));
    vr = vr + a * a * (1.0 - b * b);
    m  = m + a;
    a  = a * 0.5;
    g  = g * GL_KG;
    // GLSL's mat2(.8,.6,-.6,.8) is COLUMN-major — columns (.8,.6) and
    // (-.6,.8) — so the product is written out rather than constructed.
    p = vec2<f32>(0.8 * p.x - 0.6 * p.y, 0.6 * p.x + 0.8 * p.y) * 2.03;
  }
  return vec2<f32>(s / m, GL_KR * sqrt(vr) / m);
}

fn lqRidge(v: f32, k: f32) -> f32 {
  return pow(clamp(1.0 - abs(v * 2.0 - 1.0), 0.0, 1.0), k);
}

// The sheet's four-stop ramp, shared by every branch of every program.
fn lqRamp(v: f32, cA: vec3<f32>, cB: vec3<f32>, cC: vec3<f32>, cD: vec3<f32>) -> vec3<f32> {
  var c = mix(cA, cB, smoothstep(0.0, 0.45, v));
  c = mix(c, cC, smoothstep(0.38, 0.72, v));
  c = mix(c, cD, smoothstep(0.68, 1.0, v));
  // The editor's four colours are the default ramp. An optional custom palette
  // can replace them without changing the scalar field that produces \`v\`.
  return select(c, mfRampLin(v, u.paletteCount,
                             u.paletteStop0.rgb, u.paletteStop1.rgb, u.paletteStop2.rgb,
                             u.paletteStop3.rgb, u.paletteStop4.rgb, u.paletteStop5.rgb,
                             u.paletteStop6.rgb, u.paletteStop7.rgb, u.paletteStop8.rgb,
                             u.paletteStop9.rgb, u.paletteStop10.rgb, u.paletteStop11.rgb), u.paletteCount > 0.5);
}

// ---------------------------------------------------------------------------
// The three nonlinearities the fluid applies to a pre-blurred field, each
// integrated over the detail \`lqFbm\` attenuated away. Three-point
// Gauss-Hermite — nodes 0 and ±sqrt(3)·sd, weights 4/6 and 1/6 — reproduces a
// gaussian's second AND fourth moments, which is what keeps a ridged filament
// spreading as it dims instead of just dimming. \`vs\` is an \`lqFbm\` result:
// \`.x\` the value, \`.y\` that standard deviation.
// ---------------------------------------------------------------------------
fn lqRidgeS(vs: vec2<f32>, k: f32) -> f32 {
  let d = GL_GH * vs.y;
  return (lqRidge(vs.x - d, k) + 4.0 * lqRidge(vs.x, k) + lqRidge(vs.x + d, k)) / 6.0;
}

fn lqStepS(vs: vec2<f32>, a: f32, b: f32) -> f32 {
  let d = GL_GH * vs.y;
  return (smoothstep(a, b, vs.x - d) + 4.0 * smoothstep(a, b, vs.x)
        + smoothstep(a, b, vs.x + d)) / 6.0;
}

fn lqPowS(vs: vec2<f32>, k: f32) -> f32 {
  let d = GL_GH * vs.y;
  return (pow(clamp(vs.x - d, 0.0, 1.0), k) + 4.0 * pow(clamp(vs.x, 0.0, 1.0), k)
        + pow(clamp(vs.x + d, 0.0, 1.0), k)) / 6.0;
}

// ---------------------------------------------------------------------------
// Curated local flow programs. Each preset owns a different spatial model;
// colour changes are secondary to silhouette, frequency, and motion structure.
// ---------------------------------------------------------------------------

fn glsFinishPresetFluid(colorIn: vec3<f32>, p: vec2<f32>) -> vec3<f32> {
  var color = colorIn;
  color = mix(color, u.highlightColor.rgb,
              u.shade * 0.22 * smoothstep(0.15, 1.15, dot(p, vec2<f32>(-0.32, 0.78))));
  color = color * (1.0 - u.shade * 0.34
                  * smoothstep(-0.1, 1.2, dot(p, vec2<f32>(0.45, -0.62))));
  color = color * (1.0 - u.shade * 0.22 * smoothstep(0.72, 1.08, length(p)));
  return clamp(color, vec3<f32>(0.0), vec3<f32>(1.0));
}

fn glsFinishEmissionFluid(colorIn: vec3<f32>, p: vec2<f32>) -> vec3<f32> {
  var color = colorIn;
  if (u.glassEnabled > 0.5) {
    color = mix(color, u.highlightColor.rgb,
                u.shade * 0.22 * smoothstep(0.15, 1.15, dot(p, vec2<f32>(-0.32, 0.78))));
  }
  color = color * (1.0 - u.shade * 0.34
                  * smoothstep(-0.1, 1.2, dot(p, vec2<f32>(0.45, -0.62))));
  color = color * (1.0 - u.shade * 0.22 * smoothstep(0.72, 1.08, length(p)));
  return clamp(color, vec3<f32>(0.0), vec3<f32>(1.0));
}

fn glsSiriBand(q: vec2<f32>, drift: f32, phaseOffset: f32, amplitude: f32,
               mainY: f32, envelope: f32, softness: f32) -> vec2<f32> {
  let y = amplitude * envelope * sin(q.x * 1.0 + drift + phaseOffset);
  let distanceToLine = abs(q.y - y);
  let line = 0.018 / (sqrt(distanceToLine * distanceToLine + softness * softness) + 0.026);
  let bandDistance = max(0.0, max(q.y - max(mainY, y), min(mainY, y) - q.y));
  let band = 0.018 / (bandDistance + 0.075);
  return vec2<f32>(line, band);
}

fn glsSiriFluid(p: vec2<f32>, t: f32) -> vec3<f32> {
  // The reference wave is a main sinusoid plus four chromatically separated
  // waves. Their enclosed bands carry colour while the shared crest stays hot.
  let scale = 0.74 + u.zoom * 0.34;
  let q = p / scale;
  let xNorm = q.x;
  let envelopeBase = cos(1.57079633 * min(abs(0.9 * xNorm), 1.0));
  let envelope = envelopeBase * envelopeBase;
  let low = 0.5 + 0.5 * cos(t * 0.37);
  let mid = 0.5 + 0.5 * sin(t * 0.51 + 1.2);
  let high = 0.5 + 0.5 * cos(t * 0.73 + 2.1);
  let drift = t * 2.4;
  let mainAmplitude = 0.25 + u.ridgeAmt * 0.075 + low * 0.018;
  let bandAmplitude = mainAmplitude + mid * 0.025 + high * 0.018;
  let mainY = mainAmplitude * envelope * sin(q.x * 1.1 + drift);
  let separation = 1.85 + u.warp * 0.2 + mid * 0.28;
  let softness = 0.035 + (1.0 - u.ridgeAmt) * 0.018 + mid * 0.006;

  let band0 = glsSiriBand(q, drift, -separation, bandAmplitude, mainY, envelope, softness);
  let band1 = glsSiriBand(q, drift, -separation * 0.34, bandAmplitude, mainY, envelope, softness);
  let band2 = glsSiriBand(q, drift, separation * 0.34, bandAmplitude, mainY, envelope, softness);
  let band3 = glsSiriBand(q, drift, separation, bandAmplitude, mainY, envelope, softness);
  let w0 = band0.x + band0.y;
  let w1 = band1.x + band1.y;
  let w2 = band2.x + band2.y;
  let w3 = band3.x + band3.y;
  let total = w0 + w1 + w2 + w3;
  let dominant0 = w0 * w0;
  let dominant1 = w1 * w1;
  let dominant2 = w2 * w2;
  let dominant3 = w3 * w3;
  let dominantTotal = dominant0 + dominant1 + dominant2 + dominant3;
  let spectral = (u.colorA.rgb * dominant0 + u.colorC.rgb * dominant1
                + u.colorB.rgb * dominant2 + u.colorD.rgb * dominant3)
                / max(dominantTotal, 0.0001);
  let energy = (1.0 - exp(-total * 0.58)) * envelope;
  let mainDistance = abs(q.y - mainY);
  let whiteCore = exp(-mainDistance * mainDistance / 0.0028) * envelope;
  let glassFill = select(0.0, 1.0, u.glassEnabled > 0.5);
  let atmosphere = mix(u.colorD.rgb, u.colorB.rgb,
                       smoothstep(-0.7, 0.7, q.y)) * 0.018 * glassFill;
  var color = atmosphere + spectral * energy * 1.14;
  color = color + u.highlightColor.rgb * whiteCore * (0.18 + 0.1 * low);
  let emissionMask = mix(smoothstep(0.08, 0.25, energy + whiteCore * 0.12),
                         1.0, glassFill);
  color = color * emissionMask;
  color = color / (vec3<f32>(1.0) + color * 0.18);
  return glsFinishEmissionFluid(color, p);
}

fn glsSpectrumHeight(q: vec2<f32>, t: f32, frequency: f32,
                     phaseOffset: f32, amplitude: f32) -> f32 {
  let x = q.x * 2.15;
  let envelope = pow(4.0 / (4.0 + x * x), 4.0);
  let breathing = 0.82 + 0.18 * sin(t * 0.48 + phaseOffset * 0.7);
  let wave = abs(sin(frequency * x - t * 1.36 + phaseOffset));
  return envelope * amplitude * breathing * (0.28 + 0.72 * wave);
}

fn glsSpectrumLayer(q: vec2<f32>, height: f32, softness: f32) -> f32 {
  return (1.0 - smoothstep(max(height - softness, 0.0), height + softness, abs(q.y)))
         * smoothstep(0.0, 0.045, height);
}

fn glsSpectrumFluid(p: vec2<f32>, t: f32) -> vec3<f32> {
  // Three symmetric filled wave surfaces orbit a persistent support line. This
  // keeps the iOS 9 voice-field silhouette without depending on canvas strokes.
  let scale = 0.74 + u.zoom * 0.34;
  let q = p / scale;
  let amplitude = 0.26 + u.ridgeAmt * 0.27;
  let frequency = 0.72 + u.warp * 0.095;
  let softness = 0.026 + (1.0 - u.ridgeAmt) * 0.032;
  let h0 = glsSpectrumHeight(q, t, frequency * 0.82, -1.2, amplitude * 0.72);
  let h1 = glsSpectrumHeight(q, t, frequency, 0.45, amplitude);
  let h2 = glsSpectrumHeight(q, t, frequency * 1.17, 2.05, amplitude * 0.82);
  let l0 = glsSpectrumLayer(q, h0, softness);
  let l1 = glsSpectrumLayer(q, h1, softness);
  let l2 = glsSpectrumLayer(q, h2, softness);
  let spectrumX = q.x * 2.15;
  let envelope = pow(4.0 / (4.0 + spectrumX * spectrumX), 4.0);
  let support = exp(-q.y * q.y / 0.00072) * envelope;
  let total = l0 + l1 + l2;
  let spectral = (u.colorB.rgb * l0 + u.colorC.rgb * l1 + u.colorD.rgb * l2)
                 / max(total, 0.001);
  let glassFill = select(0.0, 1.0, u.glassEnabled > 0.5);
  var color = u.colorD.rgb * 0.025 * glassFill
            + spectral * (1.0 - exp(-total * 0.86));
  color = color + u.colorA.rgb * support * 0.58;
  color = color / (vec3<f32>(1.0) + color * 0.2);
  return glsFinishEmissionFluid(color, p);
}

fn glsAuroraLayer(p: vec2<f32>, t: f32, offset: f32) -> f32 {
  let drift = t * 0.18 + offset * 2.5;
  let wave1 = sin(p.x * (2.0 + u.warp * 0.13) + drift + offset * 6.0) * 0.25;
  let wave2 = sin(p.x * 3.7 + drift * 1.3 + offset * 4.0) * 0.12;
  let wave3 = sin(p.x * 7.2 + drift * 0.7 + offset * 8.0) * 0.055;
  let noiseValue = lqFbm(vec2<f32>(p.x * 1.6 + drift * 0.35,
                                   p.y * 0.8 + offset * 3.0), 0.018).x;
  let center = offset * 0.46 + wave1 + wave2 + wave3
               + (noiseValue - 0.5) * 0.28;
  let dist = abs(p.y - center);
  let glow = exp(-dist * dist * (13.0 - 5.0 * u.ridgeAmt));
  let shimmer = lqFbm(vec2<f32>(p.x * 4.0 + t * 0.22,
                                p.y * 7.0 + offset * 5.0), 0.012).x;
  return glow * (0.64 + 0.36 * shimmer);
}

fn glsAuroraFluid(p: vec2<f32>, t: f32) -> vec3<f32> {
  let q = p * (0.82 + u.zoom * 0.58);
  let l0 = glsAuroraLayer(q, t, -0.72);
  let l1 = glsAuroraLayer(q, t, 0.0);
  let l2 = glsAuroraLayer(q, t, 0.72);
  var color = u.colorA.rgb * (0.46 + 0.18 * (q.y + 1.0));
  color = color + u.colorB.rgb * l0 * 1.3;
  color = color + u.colorC.rgb * l1 * 1.15;
  color = color + u.colorD.rgb * l2 * 1.2;
  color = color + mix(u.colorB.rgb, u.colorD.rgb, 0.5) * min(l0 * l2, l1) * 0.65;

  let starUv = (q + vec2<f32>(1.0)) * 18.0;
  let starCell = floor(starUv);
  let starHash = lqHash(starCell);
  let starPoint = exp(-dot(fract(starUv) - vec2<f32>(0.5),
                            fract(starUv) - vec2<f32>(0.5)) * 90.0);
  let stars = step(0.965, starHash) * starPoint
              * (0.55 + 0.45 * sin(t * (1.0 + starHash * 2.0) + starHash * 6.28));
  color = color + u.highlightColor.rgb * stars * (1.0 - clamp(l0 + l1 + l2, 0.0, 1.0));
  color = color / (vec3<f32>(1.0) + color * 0.28);
  return glsFinishPresetFluid(color, p);
}

fn glsRotate(p: vec2<f32>, angle: f32) -> vec2<f32> {
  let c = cos(angle);
  let s = sin(angle);
  return vec2<f32>(c * p.x - s * p.y, s * p.x + c * p.y);
}

fn glsNeuroShape(pIn: vec2<f32>, t: f32) -> f32 {
  var p = pIn * (0.34 + 0.08 * u.zoom);
  var sineAccum = vec2<f32>(0.0);
  var result = vec2<f32>(0.0);
  var scale = 8.0;
  for (var j: i32 = 0; j < 11; j = j + 1) {
    p = glsRotate(p, 1.0);
    sineAccum = glsRotate(sineAccum, 1.0);
    let layer = p * scale + vec2<f32>(f32(j)) + sineAccum - vec2<f32>(t * 0.34);
    sineAccum = sineAccum + sin(layer);
    result = result + (vec2<f32>(0.5) + 0.5 * cos(layer)) / scale;
    scale = scale * 1.16;
  }
  return result.x + result.y;
}

fn glsPlasmaFluid(p: vec2<f32>, t: f32) -> vec3<f32> {
  let shape = glsNeuroShape(p, t);
  let phase = shape * (10.0 + u.warp) + p.x * 1.7 - p.y * 1.3 - t * 0.52;
  let ridgeWidth = 0.62 - 0.24 * u.ridgeAmt;
  let primary = pow(abs(cos(phase)), max(1.3, u.sharp * ridgeWidth));
  let secondary = pow(abs(cos(phase * 0.53 + atan2(p.y, p.x) * 2.0 + t * 0.21)),
                      max(1.6, u.sharp * (ridgeWidth + 0.1)));
  let filaments = max(primary, secondary * 0.64);
  let core = pow(primary, 4.0);
  let polarity = 0.5 + 0.5 * sin(phase * 0.37 + shape * 3.0);
  var color = mix(u.colorA.rgb * 0.42, u.colorD.rgb * 0.48, polarity * 0.46);
  color = mix(color, u.colorB.rgb, filaments * 0.72);
  color = mix(color, u.colorC.rgb, core * 0.68);
  color = color + u.highlightColor.rgb * pow(core, 3.0) * 0.16;
  color = color / (vec3<f32>(1.0) + color * 0.34);
  return glsFinishPresetFluid(color, p);
}

fn glsChromeFluid(p: vec2<f32>, t: f32) -> vec3<f32> {
  var q = p * (1.0 + u.zoom * 0.35);
  let amplitude = 0.028 * u.warp;
  for (var i: i32 = 1; i <= 9; i = i + 1) {
    let fi = f32(i);
    q.x = q.x + amplitude / fi * cos(fi * 2.7 * q.y + t * 0.46);
    q.y = q.y + amplitude / fi * cos(fi * 3.1 * q.x - t * 0.4);
  }
  let denominator = max(abs(sin(t * 0.24 - q.y - q.x)), 0.045);
  let flare = clamp(1.0 / denominator, 0.0, 18.0);
  let metal = smoothstep(1.15, 7.5, flare);
  let fold = 0.5 + 0.5 * cos((q.x - q.y) * (3.2 + u.sharp * 0.28) + t * 0.32);
  let value = clamp(metal * 0.74 + fold * 0.36, 0.0, 1.0);
  var color = lqRamp(value, u.colorD.rgb, u.colorC.rgb, u.colorB.rgb, u.colorA.rgb);
  color = mix(color, u.colorA.rgb, pow(metal, 5.0) * 0.62);
  return glsFinishPresetFluid(color, p);
}

fn glsChromaticMetalPhase(p: vec2<f32>, t: f32) -> f32 {
  let angle = u.metalAngle * 0.01745329252;
  let scale = max(u.metalScale, 0.05);
  let stretch = mix(0.48, 1.58, clamp(u.metalStretch, 0.0, 1.0));
  var q = glsRotate(p / scale, angle);
  q = vec2<f32>(q.x / stretch, q.y * stretch);

  // The reference advances continuously while local reflections evolve out of
  // phase. Travelling domain waves provide that deformation without rotating
  // the entire pattern as one rigid layer. Integer harmonics keep a clean loop.
  let cycle = t * 0.46 + u.metalPhase * 6.28318530718;
  let evolution = clamp(u.metalEvolution, 0.0, 2.0);
  q.x = q.x + sin(q.y * 1.86 - cycle) * 0.095 * evolution;
  q.x = q.x + sin((q.x + q.y) * 1.28 + cycle * 2.0 + 1.4) * 0.045 * evolution;
  q.y = q.y + sin(q.x * 1.52 + cycle + 0.8) * 0.07 * evolution;

  let repeats = max(u.bandDensity, 1.0);
  return q.x * repeats * 2.18
       + sin(q.y * (1.3 + repeats * 0.26) - cycle) * 0.56 * evolution
       + sin((q.x - q.y) * 1.34 + cycle * 2.0 + 1.7) * 0.27 * evolution
       + sin((q.x * 0.72 + q.y) * 2.1 - cycle * 3.0 + 0.35) * 0.11 * evolution
       + sin(cycle) * 0.1
       + sin(cycle * 3.0 + 0.7) * 0.035
       + cycle
       + u.metalOffset * 6.28318530718;
}

fn glsChromaticMetalTone(phase: f32) -> f32 {
  let wave = 0.5 + 0.5 * cos(phase);
  let roughness = clamp(u.metalRoughness, 0.0, 1.0);
  let depth = clamp(u.metalDepth, 0.0, 1.0);
  let edge = 0.025 + roughness * 0.18;
  let broadReflection = smoothstep(0.5 - edge, 0.5 + edge, wave);
  let hardReflection = pow(wave, mix(13.0, 4.0, roughness));
  let blackFold = pow(1.0 - wave, mix(9.0, 3.0, roughness));
  let body = mix(wave, broadReflection, 0.2 + depth * 0.3);
  return clamp(0.018 + body * (0.46 + depth * 0.12)
               + hardReflection * (0.3 + depth * 0.42)
               - blackFold * (0.07 + depth * 0.11), 0.0, 1.0);
}

fn glsChromaticMetalSample(p: vec2<f32>, t: f32) -> vec3<f32> {
  let phase = glsChromaticMetalPhase(p, t);
  let angle = u.metalAngle * 0.01745329252;
  let brushP = glsRotate(p / max(u.metalScale, 0.05), angle);
  let brushed = sin(brushP.y * 146.0 + sin(brushP.x * 11.0) * 0.58)
              + 0.48 * sin(brushP.y * 317.0 - brushP.x * 5.0);
  let brushAmount = 0.004 + clamp(u.metalRoughness, 0.0, 1.0) * 0.014;
  let tone = clamp(glsChromaticMetalTone(phase) + brushed * brushAmount, 0.0, 1.0);
  return lqRamp(tone, u.colorD.rgb, u.colorB.rgb, u.colorC.rgb, u.colorA.rgb);
}

fn glsChromaticMetalFluid(p: vec2<f32>, t: f32) -> vec3<f32> {
  let angle = u.metalAngle * 0.01745329252;
  let splitDirection = glsRotate(vec2<f32>(0.0, 1.0), angle);
  let split = splitDirection * u.chromaticShift * 0.045;
  let redSample = glsChromaticMetalSample(p + split, t);
  let neutral = glsChromaticMetalSample(p, t);
  let blueSample = glsChromaticMetalSample(p - split, t);
  let optical = vec3<f32>(redSample.r, neutral.g, blueSample.b);
  let fringe = clamp(length(optical - neutral) * 4.0, 0.0, 1.0);
  var color = mix(neutral, optical,
                  clamp(u.chromaticShift * (0.72 + fringe * 0.28), 0.0, 1.0));
  let centerTone = glsChromaticMetalTone(glsChromaticMetalPhase(p, t));
  let glint = pow(centerTone, mix(12.0, 5.0, clamp(u.metalRoughness, 0.0, 1.0)));
  color = mix(color, u.highlightColor.rgb,
              glint * clamp(u.metalDepth, 0.0, 1.0) * 0.06);

  // A second, sphere-scale reflection layer keeps the material metallic even
  // when the optional glass shell is disabled. It modulates the animated ramp
  // instead of raising exposure, preserving dark chrome between reflections.
  let radial2 = clamp(dot(p, p), 0.0, 1.0);
  let normal = normalize(vec3<f32>(p, sqrt(max(1.0 - radial2, 0.0))));
  let roughness = clamp(u.metalRoughness, 0.0, 1.0);
  let depth = clamp(u.metalDepth, 0.0, 1.0);
  let key = pow(max(dot(normal, normalize(vec3<f32>(-0.48, 0.62, 0.62))), 0.0),
                mix(7.0, 3.0, roughness));
  let fill = pow(max(dot(normal, normalize(vec3<f32>(0.7, -0.34, 0.63))), 0.0),
                 mix(10.0, 4.0, roughness));
  let limb = 1.0 - normal.z;
  let fresnel = pow(limb, 3.0);
  let rim = pow(limb, 10.0);
  color = color * (0.86 + normal.z * 0.14);
  color = mix(color, u.highlightColor.rgb, key * (0.05 + depth * 0.13));
  color = mix(color, u.colorC.rgb, fill * (0.025 + depth * 0.07));
  color = mix(color, u.colorD.rgb, fresnel * (0.12 + depth * 0.15));
  color = mix(color, u.highlightColor.rgb, rim * (0.035 + depth * 0.055));
  return glsFinishPresetFluid(color, p);
}

fn glsOpalFluid(p: vec2<f32>, t: f32) -> vec3<f32> {
  let q = p * (0.8 + u.zoom * 0.64);
  let complexity = 0.76 + u.warp * 0.085;
  var d = -t * 0.42;
  var a = 0.0;
  for (var i: i32 = 0; i < 8; i = i + 1) {
    let fi = f32(i);
    a = a + cos(fi - d - a * q.x * complexity);
    d = d + sin(q.y * fi * complexity + a);
  }
  d = d + t * 0.42;
  let c1 = cos(q * vec2<f32>(d, a)) * 0.6 + vec2<f32>(0.4);
  let c2 = cos(a + d) * 0.5 + 0.5;
  let interference = 0.5 + 0.5 * cos(vec3<f32>(c1.x, c1.y, c2)
                         * cos(vec3<f32>(d, a, 2.5)) * 0.5 + vec3<f32>(0.5));
  let tone = fract(interference.r * 0.37 + interference.g * 0.51
                   + interference.b * 0.73 + c1.x * 0.22 - c1.y * 0.15);
  var color = lqRamp(tone, u.colorB.rgb, u.colorC.rgb, u.colorD.rgb, u.colorA.rgb);
  color = mix(color, u.colorA.rgb, 0.16 + 0.1 * interference.b);
  color = color / (vec3<f32>(1.0) + color * 0.16);
  return glsFinishPresetFluid(color, p);
}

fn glsFrostFluid(p: vec2<f32>, t: f32) -> vec3<f32> {
  // The initial frost-style orb: a slow domain warp drives broad cloudy colour
  // bodies, while a second higher-frequency field contributes adjustable veins.
  var q = p * (0.66 + u.zoom * 0.92);
  q.y = q.y + t * 0.055;
  let blur = 0.011 + 0.006 * u.zoom;
  let warpField = vec2<f32>(
    lqFbm(q * 1.14 + vec2<f32>(t * 0.055, 0.0), blur).x,
    lqFbm(q * 1.14 + vec2<f32>(6.8, -t * 0.048), blur).x
  );
  let warped = q + (warpField - vec2<f32>(0.5)) * (0.28 + u.warp * 0.17);
  let body = lqFbm(warped * 1.48 + vec2<f32>(t * 0.032, -t * 0.02), blur * 1.48);
  let veins = lqRidgeS(
    lqFbm(warped * 2.36 + vec2<f32>(3.1, -t * 0.024), blur * 2.36),
    u.sharp
  );
  let value = mix(lqStepS(body, 0.1, 0.9),
                  clamp(veins * 0.8 + body.x * 0.46, 0.0, 1.0),
                  u.ridgeAmt);
  var color = lqRamp(value, u.colorA.rgb, u.colorB.rgb, u.colorC.rgb, u.colorD.rgb);
  color = mix(color, u.colorA.rgb, 0.08 * smoothstep(0.62, 0.92, body.x));
  return glsFinishPresetFluid(color, p);
}

fn glsVoiceWaveFluid(p: vec2<f32>, t: f32) -> vec3<f32> {
  // A single broad membrane stays phase-coherent across the sphere. Nearby
  // translucent layers add volume without splitting into separate Siri bands.
  let scale = 0.76 + u.zoom * 0.34;
  let q = p / scale;
  let rimEnvelope = pow(max(1.0 - q.x * q.x, 0.0), 0.72);
  let drift = t * 0.82;
  let amplitude = 0.2 + u.warp * 0.018;
  let mainY = rimEnvelope * (amplitude * sin(q.x * 1.48 + drift)
              + 0.055 * sin(q.x * 3.2 - drift * 0.43 + 1.1));
  let distance = q.y - mainY;
  let width = 0.11 + (1.0 - u.ridgeAmt) * 0.075;
  let membrane = exp(-distance * distance / max(width * width, 0.001)) * rimEnvelope;
  let upperVeil = exp(-(distance - 0.105) * (distance - 0.105)
                      / max(width * width * 2.4, 0.001)) * rimEnvelope;
  let lowerVeil = exp(-(distance + 0.115) * (distance + 0.115)
                      / max(width * width * 2.8, 0.001)) * rimEnvelope;
  let crest = exp(-distance * distance / 0.0026) * rimEnvelope;
  let depth = sqrt(max(1.0 - clamp(dot(p, p), 0.0, 1.0), 0.0));
  var color = mix(u.colorA.rgb * 0.7, u.colorD.rgb * 0.34,
                  smoothstep(-0.82, 0.82, q.y));
  color = mix(color, u.colorB.rgb, upperVeil * 0.7);
  color = mix(color, u.colorC.rgb, lowerVeil * 0.62);
  color = color + mix(u.colorB.rgb, u.colorC.rgb, 0.46) * membrane * 0.34;
  color = color + u.highlightColor.rgb * crest * 0.14;
  color = color * (0.58 + 0.42 * depth);
  return glsFinishPresetFluid(color, p);
}

fn glsBlueDropFluid(p: vec2<f32>, t: f32) -> vec3<f32> {
  // Slow diagonal advection keeps the broad liquid bodies coherent. The two
  // shear waves replace the reference orb's circular, looped point motion.
  let depth = sqrt(max(1.0 - clamp(dot(p, p), 0.0, 1.0), 0.0));
  var q = p * mix(0.72, 1.0, depth * 0.62 + 0.38);
  q = glsRotate(q, -0.24 + 0.06 * sin(t * 0.17));
  let scale = 1.0 + u.zoom * 1.12;
  let blur = 0.012 + 0.006 * u.zoom;
  let driftA = lqFbm(q * 1.28 + vec2<f32>(t * 0.095, -t * 0.034), blur * 1.28);
  let driftB = lqFbm(glsRotate(q, 1.08) * 1.62
                     + vec2<f32>(-t * 0.042, t * 0.078), blur * 1.62);
  var flowed = q + vec2<f32>(driftA.x - 0.5, driftB.x - 0.5)
                 * (0.24 + u.warp * 0.1);
  flowed.x = flowed.x + sin(flowed.y * 2.15 + t * 0.24) * (0.035 + u.warp * 0.012);
  flowed.y = flowed.y + sin(flowed.x * 1.38 - t * 0.18) * (0.045 + u.warp * 0.01);
  let body = lqFbm(flowed * scale + vec2<f32>(t * 0.025, -t * 0.018), blur * scale);
  let marble = lqRidgeS(lqFbm(flowed * (1.72 + u.zoom * 0.9)
                              + vec2<f32>(2.7, -t * 0.035),
                              blur * (1.72 + u.zoom * 0.9)),
                            0.8 + u.sharp * 0.46);
  let value = clamp(mix(body.x, body.x * 0.62 + marble * 0.58, u.ridgeAmt), 0.0, 1.0);
  var color = lqRamp(value, u.colorA.rgb, u.colorB.rgb, u.colorC.rgb, u.colorD.rgb);
  let light = pow(max(dot(normalize(vec3<f32>(p, depth)),
                          normalize(vec3<f32>(-0.48, 0.62, 0.92))), 0.0), 3.2);
  color = mix(color, u.highlightColor.rgb, light * (0.035 + 0.05 * u.shade));
  color = color * (0.74 + 0.26 * depth);
  return glsFinishPresetFluid(color, p);
}

fn glsVioletEmberFluid(p: vec2<f32>, t: f32) -> vec3<f32> {
  // A radial twist and two crossing drift fields make heavy molten folds. This
  // moves as a breathing spiral instead of the reference orb's closed circles.
  let scale = 1.08 + u.zoom * 1.18;
  let blur = 0.011 + 0.005 * u.zoom;
  let radius = length(p);
  let twist = t * 0.055 + radius * (0.72 + u.warp * 0.11)
              + 0.08 * sin(t * 0.31 + radius * 4.0);
  let q = glsRotate(p * scale, twist);
  let low = lqFbm(q * 1.18 + vec2<f32>(t * 0.068, -t * 0.105), blur * 1.18);
  let cross = lqFbm(glsRotate(q, -1.12) * 1.52
                    + vec2<f32>(-t * 0.094, t * 0.042)
                    + vec2<f32>(low.x * 1.35, -low.x * 0.72), blur * 1.52);
  let warped = q + vec2<f32>(low.x - 0.5, cross.x - 0.5)
                   * (0.3 + u.warp * 0.12);
  let melt = lqFbm(warped * 1.34
                   + vec2<f32>(cross.x * 1.48, low.x * 1.12), blur * 1.34);
  let veins = lqRidgeS(lqFbm(warped * (2.05 + u.zoom * 0.72)
                             + vec2<f32>(-2.1, t * 0.052),
                             blur * (2.05 + u.zoom * 0.72)),
                           0.82 + u.sharp * 0.58);
  let heat = smoothstep(0.18, 0.92,
                        melt.x * (0.72 - u.ridgeAmt * 0.16)
                        + veins * (0.32 + u.ridgeAmt * 0.5));
  var color = lqRamp(heat, u.colorA.rgb, u.colorB.rgb, u.colorC.rgb, u.colorD.rgb);
  let pulse = 0.94 + 0.06 * sin(t * 0.44 + melt.x * 5.0);
  color = color * pulse;
  color = mix(color, u.highlightColor.rgb, pow(veins, 4.0) * 0.045);
  return glsFinishPresetFluid(color, p);
}

fn glsRefractiveBlobFluid(p: vec2<f32>, t: f32) -> vec3<f32> {
  // Broad advected cells give the lens something legible to bend. A slower
  // caustic ribbon crosses those cells out of phase, so the material evolves
  // without looking like a texture rotating inside a fixed sphere.
  let radial2 = clamp(dot(p, p), 0.0, 1.0);
  let depth = sqrt(max(1.0 - radial2, 0.0));
  let scale = 0.82 + u.zoom * 1.08;
  let blur = 0.012 + 0.005 * u.zoom;
  var q = glsRotate(p * scale, 0.08 * sin(t * 0.17));
  let driftA = lqFbm(q * 1.16 + vec2<f32>(t * 0.052, -t * 0.078), blur * 1.16);
  let driftB = lqFbm(glsRotate(q, 1.21) * 1.34
                     + vec2<f32>(-t * 0.064, t * 0.041), blur * 1.34);
  q = q + vec2<f32>(driftA.x - 0.5, driftB.x - 0.5)
          * (0.34 + u.warp * 0.105);

  let body = lqFbm(q * 1.42 + vec2<f32>(driftB.x * 0.82, driftA.x * 0.66),
                   blur * 1.42);
  let ribbonPhase = q.y * (2.2 + u.warp * 0.11)
                  + sin(q.x * 1.72 - t * 0.19) * 0.92
                  + sin((q.x + q.y) * 1.08 + t * 0.13) * 0.46;
  let ribbon = pow(clamp(1.0 - abs(sin(ribbonPhase)), 0.0, 1.0),
                   0.82 + u.sharp * 0.23);
  let fold = lqRidgeS(lqFbm(q * 2.05 + vec2<f32>(2.8, -t * 0.037),
                            blur * 2.05), 0.9 + u.sharp * 0.32);
  let value = clamp(body.x * 0.5 + driftA.x * 0.16
                    + ribbon * (0.2 + u.ridgeAmt * 0.2)
                    + fold * u.ridgeAmt * 0.18, 0.0, 1.0);

  var color = lqRamp(value, u.colorA.rgb, u.colorB.rgb, u.colorC.rgb, u.colorD.rgb);
  let caustic = pow(ribbon, 3.1) * (0.24 + 0.28 * u.ridgeAmt)
               + pow(fold, 4.2) * 0.08;
  color = mix(color, u.colorD.rgb, clamp(caustic, 0.0, 0.52));
  color = color * (0.7 + depth * 0.3);
  let key = pow(max(dot(normalize(vec3<f32>(p, depth)),
                        normalize(vec3<f32>(-0.42, 0.58, 0.9))), 0.0), 4.0);
  color = mix(color, u.highlightColor.rgb, key * 0.055);
  return glsFinishPresetFluid(color, p);
}

fn glsParticleRibbonFluid(p: vec2<f32>, t: f32) -> vec3<f32> {
  // The visible body is emitted by the dedicated particle pipeline. Keeping
  // this branch empty lets the shared fullscreen pass contribute only the
  // optional glass shell and its transparent background contract.
  return vec3<f32>(0.0);
}

fn glsPresetFluid(p: vec2<f32>, style: i32, t: f32) -> vec3<f32> {
  if (style == 9) { return glsSiriFluid(p, t); }
  if (style == 10) { return glsAuroraFluid(p, t); }
  if (style == 11) { return glsPlasmaFluid(p, t); }
  if (style == 12) { return glsChromeFluid(p, t); }
  if (style == 13) { return glsOpalFluid(p, t); }
  if (style == 14) { return glsSpectrumFluid(p, t); }
  if (style == 15) { return glsFrostFluid(p, t); }
  if (style == 19) { return glsVoiceWaveFluid(p, t); }
  if (style == 20) { return glsBlueDropFluid(p, t); }
  if (style == 21) { return glsVioletEmberFluid(p, t); }
  if (style == 22) { return glsChromaticMetalFluid(p, t); }
  if (style == 23) { return glsRefractiveBlobFluid(p, t); }
  if (style == 24) { return glsParticleRibbonFluid(p, t); }
  return glsFrostFluid(p, t);
}

// ---------------------------------------------------------------------------
// The fluid, at one point, already blurred and straight (not premultiplied):
// the sheet's shader on \`fu\` — both programs, all four inner branches, and the
// shared shade tail — with the blur folded into the noise bank as above. The
// disc's own alpha is the caller's, because it is analytic now.
// ---------------------------------------------------------------------------
fn glsFluid(fu: vec2<f32>, md: i32, t: f32) -> vec3<f32> {
  let df = length(fu);

  let cA = u.colorA.rgb;
  let cB = u.colorB.rgb;
  let cC = u.colorC.rgb;
  let cD = u.colorD.rgb;

  // The blur's sigma, carried from fluid units into the fluid's own domains.
  // \`sp\` is it in pp/q units — the warp shifts q about but does not stretch it
  // on average, so pp and q share one. \`sw\` is the warp field's own, softened
  // by GL_KWA.
  let blurSigma = select(GL_BSIG_CLEAR, GL_BSIG_GLASS, u.glassEnabled > 0.5);
  let sp = blurSigma * u.zoom;
  let sw = sp * 1.1 * GL_KWA;

  var fcol: vec3<f32>;
  if (md < 0) {
    // progA — the warped body, the only branch with the slow vertical drift
    // and the only one that reads Ridge.
    var pp = fu * u.zoom;
    pp.y = pp.y + t * 0.05;
    let w = vec2<f32>(lqFbm(pp * 1.1 + vec2<f32>(0.0, t * 0.09), sw).x,
                      lqFbm(pp * 1.1 + vec2<f32>(7.7, -t * 0.07), sw).x);
    let q = pp + u.warp * (w - vec2<f32>(0.5));
    let body  = lqFbm(q * 1.5 + vec2<f32>(t * 0.04, 0.0), sp * 1.5);
    let veins = lqRidgeS(lqFbm(q * 2.2 + vec2<f32>(3.1), sp * 2.2), u.sharp);
    let v = mix(lqStepS(body, 0.12, 0.88),
                clamp(veins * 0.85 + 0.45 * body.x, 0.0, 1.0), u.ridgeAmt);
    fcol = lqRamp(v, cA, cB, cC, cD);
  } else {
    // progB — same warp, no vertical drift, four inner branches.
    let pp = fu * u.zoom;
    let w = vec2<f32>(lqFbm(pp * 1.1 + vec2<f32>(0.0, t * 0.09), sw).x,
                      lqFbm(pp * 1.1 + vec2<f32>(7.7, -t * 0.07), sw).x);
    let q = pp + u.warp * (w - vec2<f32>(0.5));
    if (md == 0) {
      // Nectar — a sine band the noise leans on. The fbm is INSIDE the sine, so
      // the removed detail integrates out in closed form rather than by
      // quadrature: E[sin(A + 6e)] = sin(A)·exp(-18·sd²). The second term of
      // the exponent is the same integral for the sine's own \`q.x * 7.0\`, which
      // the blur attenuates by exp(-49·sp²/2).
      let n0 = lqFbm(q * 2.2, sp * 2.2);
      let damp = exp(-18.0 * n0.y * n0.y - 24.5 * sp * sp);
      var v = 0.5 + 0.5 * damp * sin(q.x * 7.0 + n0.x * 6.0 + t * 0.35);
      v = mix(v, lqFbm(q * 1.4 + vec2<f32>(t * 0.03), sp * 1.4).x, 0.25);
      fcol = lqRamp(v, cA, cB, cC, cD);
    } else if (md == 1) {
      // Lumen — two ridged fields multiplied into filaments. The two fields are
      // independent, so each integrates its own detail out before the product.
      let v = lqRidgeS(lqFbm(q * 1.4 + vec2<f32>(t * 0.06, 0.0), sp * 1.4), u.sharp)
            * lqRidgeS(lqFbm(q * 1.7 - vec2<f32>(0.0, t * 0.05), sp * 1.7), u.sharp);
      fcol = lqRamp(pow(v, 0.7), cA, cB, cC, cD);
    } else if (md == 6) {
      // Sprig — noise warped by noise, with a ridged edge darkening it.
      let v = lqFbm(q * 1.3 + vec2<f32>(1.5 * lqFbm(q * 2.6 + vec2<f32>(t * 0.025), sp * 2.6).x), sp * 1.3);
      let edge = lqRidgeS(lqFbm(q * 2.1 + vec2<f32>(7.0), sp * 2.1), 1.3);
      fcol = lqRamp(lqStepS(v, 0.1, 0.9), cA, cB, cC, cD);
      fcol = fcol * (1.0 - 0.18 * edge);
    } else {
      // Haze and Smoke — the same rising plume at two palettes.
      let q2 = q + vec2<f32>(0.0, -t * 0.14);
      let v = lqFbm(q2 * 1.6 + vec2<f32>(2.2 * lqFbm(q2 * 2.4 + vec2<f32>(0.0, -t * 0.05), sp * 2.4).x), sp * 1.6);
      fcol = lqRamp(lqPowS(v, 1.5), cA, cB, cC, cD);
    }
  }

  // The sheet's shared tail: a highlight up-left, a shadow down-right, and a
  // darkened limb. All three are far below the blur's cutoff, so they are the
  // sheet's own expressions untouched. The grain term the sheet ends on is not
  // ported — see the header. The two \`1 - shade*k*smoothstep(...)\` terms are
  // multiplicative darkening, not colours, so they stay literal.
  fcol = mix(fcol, u.highlightColor.rgb,
             u.shade * 0.3 * smoothstep(0.25, 1.25, dot(fu, vec2<f32>(-0.32, 0.78))));
  fcol = fcol * (1.0 - u.shade * 0.42 * smoothstep(-0.05, 1.25, dot(fu, vec2<f32>(0.45, -0.62))));
  fcol = fcol * (1.0 - u.shade * 0.3 * smoothstep(0.72, 1.0, df));
  return clamp(fcol, vec3<f32>(0.0), vec3<f32>(1.0));
}

// ---------------------------------------------------------------------------
// The shell.
// ---------------------------------------------------------------------------

// Source-over onto an opaque destination, straight (un-premultiplied) sRGB.
fn glsOver(dst: vec3<f32>, src: vec3<f32>, a: f32) -> vec3<f32> {
  let k = clamp(a, 0.0, 1.0);
  return src * k + dst * (1.0 - k);
}

fn glsRefractionProfile(t: f32) -> f32 {
  let depth = clamp(t, 0.0, 1.0);
  let circular = sqrt(max(1.0 - (1.0 - depth) * (1.0 - depth), 0.0));
  return 1.0 - circular;
}

fn glsHighlightLobe(normal: vec2<f32>, direction: vec2<f32>, cut: f32,
                     power: f32) -> f32 {
  let angular = clamp((dot(normal, direction) - cut) / max(1.0 - cut, 0.001),
                      0.0, 1.0);
  return pow(angular, power);
}

fn glsContourWave(angle: f32, t: f32) -> vec2<f32> {
  let style = i32(u.style + 0.5);
  if (style == 19) {
    let wave = sin(angle * 2.0 + t * 0.27) * 0.72
               + sin(angle * 4.0 - t * 0.16 + 2.1) * 0.28;
    let slope = cos(angle * 2.0 + t * 0.27) * 1.44
                + cos(angle * 4.0 - t * 0.16 + 2.1) * 1.12;
    return vec2<f32>(wave, slope);
  }
  let wave = sin(angle * 3.0 + t * 0.62) * 0.52
             + sin(angle * 5.0 - t * 0.41 + 1.7) * 0.31
             + sin(angle * 2.0 + t * 0.23 + 3.1) * 0.17;
  let slope = cos(angle * 3.0 + t * 0.62) * 1.56
              + cos(angle * 5.0 - t * 0.41 + 1.7) * 1.55
              + cos(angle * 2.0 + t * 0.23 + 3.1) * 0.34;
  return vec2<f32>(wave, slope);
}

fn glsContourStrength() -> f32 {
  if (u.style >= 18.5) { return 0.11; }
  return select(0.09, 0.16, u.style >= 15.5);
}

fn glsContourScale(uv: vec2<f32>, t: f32, amount: f32) -> f32 {
  if (amount <= 0.0) { return 1.0; }
  let contour = glsContourWave(atan2(uv.y, uv.x), t);
  return 1.0 + clamp(amount, 0.0, 1.0) * glsContourStrength() * contour.x;
}

fn glsContourNormal(uv: vec2<f32>, rad: f32, t: f32, amount: f32) -> vec2<f32> {
  let distance = length(uv);
  if (distance <= 0.0001) { return vec2<f32>(0.0); }
  let radial = uv / distance;
  let contour = glsContourWave(atan2(uv.y, uv.x), t);
  let slope = clamp(amount, 0.0, 1.0) * glsContourStrength() * contour.y;
  let tangent = vec2<f32>(-radial.y, radial.x);
  return normalize(radial - tangent * (rad * slope / distance));
}

fn glsRefractionNormal(base: vec2<f32>, p: vec2<f32>, t: f32,
                       style: i32) -> vec2<f32> {
  if (style != 23) { return base; }
  let tangent = vec2<f32>(-base.y, base.x);
  let a = lqFbm(p * 2.15 + vec2<f32>(t * 0.061, -t * 0.043), 0.018).x;
  let b = lqFbm(glsRotate(p, 1.37) * 2.55
                  + vec2<f32>(-t * 0.037, t * 0.052), 0.021).x;
  let wave = (a - b) * 0.76 + sin(atan2(p.y, p.x) * 3.0 + t * 0.21) * 0.08;
  return normalize(base + tangent * wave);
}

fn orbGlassLiquidAnim(uv01: vec2<f32>) -> vec4<f32> {
  // The runner hands uv01 with y down from the top, like stitchable MSL's
  // \`position\`; the orb was authored bottom-left, so flip back.
  let fc = vec2<f32>(uv01.x, 1.0 - uv01.y) * u.size;
  let uv = (2.0 * fc - u.size) / max(min(u.size.x, u.size.y), 1.0);

  let rad = max(u.radius, 0.05);
  let t = u.time * u.speed;
  let s = i32(u.style + 0.5);
  let emissionOnly = u.glassEnabled <= 0.5 && (s == 9 || s == 14 || s == 24);
  let contourRad = rad * glsContourScale(uv, t, u.contourDeform);

  // Nothing on this pixel — and here that is the whole fluid and the whole
  // shell skipped, over roughly 60% of the quad. 1.01 is the far edge of the
  // ball's own coverage, \`1 - smoothstep(0.99, 1.01, pd)\` on the last line of
  // this function, which is EXACTLY zero past it, so the full path already
  // returns opaque black here. An early-out, not a clip: the number is that
  // coverage term's own far edge, so do not "tidy" it to 1.0 — that would
  // shave the outer half of the limb's antialiasing.
  //
  // Tested on \`uv\` rather than on \`pd\` because \`|uv| > rad * 1.01\` IS
  // \`pd > 1.01\`, and it keeps \`p\` and \`pd\` in the same basic block as
  // everything that reads them — the shape the four sibling orbs of this port
  // need, where branching on \`d\` after computing it makes the compiler stop
  // folding \`uv / rad\` into its uses and the moved last bit comes back through
  // their grain hash as speckle up to 34/255. Glass Liquid has no grain and is
  // nearly immune either way: at 1024x1024 this costs under a dozen bytes of a
  // four-million-byte frame, off by 1/255. Those are the branch existing, not a
  // pixel wrongly skipped — a copy of this guard with a threshold it can never
  // reach diffs identically, and against it the guard is exactly 0/255.
  if (length(uv) > contourRad * (1.01 + mfEdgeD(u.edgeSoftness))) {
    // Off the ball entirely — but the halo lives out here, so hand back
    // what the edge bank paints on nothing. Exactly black at Glow 0.
    let halo = clamp(mfEdgeGlow(vec3<f32>(0.0), uv, vec2<f32>(0.0), contourRad,
                                u.edgeSoftness, u.edgeGlow, u.glowColor.rgb),
                     vec3<f32>(0.0), vec3<f32>(1.0));
    let haloAlpha = max(halo.r, max(halo.g, halo.b));
    return vec4<f32>(halo, haloAlpha);
  }

  let p   = uv / contourRad;     // deformed ball space: |p| == 1 on the edge
  let pd  = length(p);

  // ---- the fluid ------------------------------------------------------
  let fu = p / GL_FU;

  // Branch dispatch. Source indices 0/2/4/6 are progA (md < 0); the others are
  // progB at the sheet's own mode number. An if-chain avoids a runtime-indexed
  // lookup here.
  var md: i32 = -1;
  if (s == 1) { md = 1; }
  else if (s == 3 || s == 8) { md = 7; }
  else if (s == 5) { md = 6; }
  else if (s == 7) { md = 0; }

  let clearFa = 1.0 - smoothstep(GL_CLEAR_EA, GL_CLEAR_EB, pd);
  let contourNormal = glsContourNormal(uv, rad, t, u.contourDeform);
  let normal = glsRefractionNormal(contourNormal, p, t, s);
  let edgeDepth = max(1.0 - pd, 0.0);
  let refractionWidth = 0.015 + 0.95 * clamp(u.shellMidAlpha, 0.0, 1.0);
  let refractionT = edgeDepth / max(refractionWidth, 0.001);
  let refractionProfile = pow(glsRefractionProfile(refractionT), 0.68);
  let refractionAmount = 1.6 * clamp(u.glassOpacity, 0.0, 1.0)
                         * refractionProfile;
  let refractedP = p - normal * refractionAmount;
  var fcol = vec3<f32>(0.0);
  if (clearFa > 0.0) {
    if (s >= 9) {
      if (u.glassEnabled > 0.5) {
        // Three actual fluid evaluations produce optical dispersion. At the
        // outer boundary the reference lens pulls samples from deep inside the
        // orb; the channels converge continuously at the inner edge of the
        // refraction band.
        let channelSplit = 0.14 * clamp(u.gloss, 0.0, 2.0)
                           * clamp(u.glassOpacity, 0.0, 1.0)
                           * refractionProfile;
        let redSample = glsPresetFluid(refractedP - normal * channelSplit, s, t);
        let greenSample = glsPresetFluid(refractedP, s, t);
        let blueSample = glsPresetFluid(refractedP + normal * channelSplit, s, t);
        fcol = vec3<f32>(redSample.r, greenSample.g, blueSample.b);
      }
      else { fcol = glsPresetFluid(p, s, t); }
    }
    else { fcol = glsFluid(fu, md, t); }
  }

  // Voice-like presets become a true emissive layer when glass is disabled.
  // Their empty pixels no longer inherit the opaque circular canvas fill.
  let lum = dot(fcol, vec3<f32>(0.213, 0.715, 0.072));
  let clearSat = clamp(vec3<f32>(lum) + (fcol - vec3<f32>(lum)) * 1.22,
                       vec3<f32>(0.0), vec3<f32>(1.0));
  let particleGlassOverlay = s == 24;
  var col = select(
    glsOver(u.canvasColor.rgb, clearSat, 0.99 * clearFa),
    vec3<f32>(0.0),
    particleGlassOverlay,
  );
  if (emissionOnly) {
    let signal = max(clearSat.r, max(clearSat.g, clearSat.b));
    let emissionCoverage = smoothstep(0.025, 0.16, signal);
    col = clearSat * emissionCoverage;
  }
  if (u.glassEnabled > 0.5) {
    // Surface lighting stays on a thin arc. The broad visual change comes from
    // the refracted fluid above, not from a translucent white overlay.
    // Its weights still need enough contrast to keep the exposed colour and
    // highlight controls perceptible in the compact scene preview.
    let surfaceWidth = select(
      0.026 + 0.055 * clamp(u.shellEdgeAlpha, 0.0, 1.0),
      0.09 + 0.12 * clamp(u.shellEdgeAlpha, 0.0, 1.0),
      particleGlassOverlay,
    );
    let surfaceBand = (1.0 - smoothstep(0.0, surfaceWidth, edgeDepth)) * clearFa;
    let opticalRim = pow(surfaceBand, select(1.8, 1.3, particleGlassOverlay));
    let innerRimAlpha = select(
      opticalRim * u.glassOpacity * 0.45,
      opticalRim * u.glassOpacity * 0.14,
      particleGlassOverlay,
    );
    col = glsOver(col, u.shellInner.rgb, innerRimAlpha);

    let coolDirection = normalize(vec2<f32>(0.84, 0.54));
    let warmDirection = normalize(vec2<f32>(-0.62, -0.78));
    let coolSplit = glsHighlightLobe(normal, coolDirection, -0.32, 1.8);
    let warmSplit = glsHighlightLobe(normal, warmDirection, -0.28, 2.0);
    let dispersion = opticalRim * clamp(u.gloss, 0.0, 2.0)
                     * (0.8 + 0.8 * u.shellEdgeAlpha);
    col = glsOver(col, u.shellMid.rgb, dispersion * coolSplit);
    col = glsOver(col, u.shellEdge.rgb, dispersion * warmSplit);

    let edgeShadow = opticalRim * (0.015 + 0.15 * u.shellEdgeAlpha)
                     * (0.15 + 0.85 * max(dot(normal, vec2<f32>(0.45, -0.89)), 0.0));
    col = col * (1.0 - edgeShadow);

    let keyDirection = normalize(vec2<f32>(-0.68, 0.73));
    let fillDirection = normalize(vec2<f32>(0.74, -0.67));
    let key = opticalRim * glsHighlightLobe(normal, keyDirection, 0.2, 2.8)
              * clamp(u.sheen, 0.0, 2.0) * 1.4;
    let fill = opticalRim * glsHighlightLobe(normal, fillDirection, 0.4, 3.6)
               * clamp(u.sheen, 0.0, 2.0) * 1.0;
    col = glsOver(col, u.sheenColor.rgb, key);
    col = glsOver(col, u.specColor.rgb, fill);
  }

  // The ball's own edge, and nothing outside it — everything the effect does
  // not paint must be exactly 0 so the page shows through.
  let ballA = 1.0 - smoothstep(0.99 - mfEdgeD(u.edgeSoftness), 1.01 + mfEdgeD(u.edgeSoftness), pd);
  col = clamp(col * max(u.exposure, 0.0), vec3<f32>(0.0), vec3<f32>(1.0)) * ballA;
  // The Orbs edge bank — the Edge group's Glow. Adding zero is exactly
  // the render this file was diffed against, and zero is the default.
  let edged = mfEdgeGlow(col, uv, vec2<f32>(0.0), contourRad,
                         u.edgeSoftness, u.edgeGlow, u.glowColor.rgb);
  let finalColor = clamp(edged, vec3<f32>(0.0), vec3<f32>(1.0));
  let emissionAlpha = max(finalColor.r, max(finalColor.g, finalColor.b));
  let sphereAlpha = clamp(max(ballA, emissionAlpha), 0.0, 1.0);
  let finalAlpha = select(
    sphereAlpha,
    emissionAlpha,
    emissionOnly || particleGlassOverlay,
  );
  return vec4<f32>(finalColor, finalAlpha);
}


struct VOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

@vertex
fn vs_main(@builtin(vertex_index) i: u32) -> VOut {
  var p = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>( 3.0, -1.0),
    vec2<f32>(-1.0,  3.0),
  );
  var out: VOut;
  out.pos = vec4<f32>(p[i], 0.0, 1.0);
  let uv01 = (p[i] + vec2<f32>(1.0)) * 0.5;
  out.uv = vec2<f32>(uv01.x, 1.0 - uv01.y);
  return out;
}

@fragment
fn fs_main(in: VOut) -> @location(0) vec4<f32> {
  let c = orbGlassLiquidAnim(in.uv);

  let fc = vec2<f32>(in.uv.x, 1.0 - in.uv.y) * u.size;
  let uv = (2.0 * fc - u.size) / max(min(u.size.x, u.size.y), 1.0);
  let rad = max(u.radius, 0.05);
  let t = u.time * u.speed;
  let contourRad = rad * glsContourScale(uv, t, u.contourDeform);
  let q = (2.0 * fc - u.size) / u.size;
  let fitEnd = 1.0;
  let fitFeather = 2.0 / max(min(u.size.x, u.size.y), 1.0);
  let fitStart = min(mix(contourRad, fitEnd, 0.5), fitEnd - fitFeather);
  let fit = 1.0 - smoothstep(fitStart, fitEnd, max(abs(q.x), abs(q.y)));
  return vec4<f32>(c.rgb * fit, c.a * fit);
}

const PR_U_SEGMENTS: u32 = 384u;
const PR_V_SEGMENTS: u32 = 96u;
const PR_PARTICLES_PER_LAYER: u32 = PR_U_SEGMENTS * PR_V_SEGMENTS;

struct RibbonOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) local: vec2<f32>,
  @location(1) color: vec3<f32>,
  @location(2) opacity: f32,
};

fn prHash(value: f32) -> f32 {
  return fract(sin(value * 12.9898 + 78.233) * 43758.5453);
}

fn prRotateX(p: vec3<f32>, angle: f32) -> vec3<f32> {
  let c = cos(angle);
  let s = sin(angle);
  return vec3<f32>(p.x, c * p.y - s * p.z, s * p.y + c * p.z);
}

fn prRotateY(p: vec3<f32>, angle: f32) -> vec3<f32> {
  let c = cos(angle);
  let s = sin(angle);
  return vec3<f32>(c * p.x + s * p.z, p.y, -s * p.x + c * p.z);
}

fn prCurve(theta: f32, layer: f32, phase: f32) -> vec3<f32> {
  let local = theta + layer * 0.11;
  let foldPhase = 2.0 * local + phase * (0.72 + layer * 0.025);
  let fold = clamp(u.ribbonFold, 0.0, 1.2);
  let radial = 0.4 + (0.085 + fold * 0.04) * cos(foldPhase);
  let orbit = local + phase * 0.13
              + sin(local - phase * 0.22 + layer) * fold * 0.13;
  let vertical = (0.235 + fold * 0.085) * sin(foldPhase)
                 + 0.055 * sin(local * 3.0 - phase * 0.46 + layer * 0.7);
  return vec3<f32>(radial * cos(orbit), vertical, radial * sin(orbit));
}

fn prPalette(valueIn: f32) -> vec3<f32> {
  let value = fract(valueIn) * 4.0;
  if (value < 1.0) { return mix(u.colorA.rgb, u.colorB.rgb, value); }
  if (value < 2.0) { return mix(u.colorB.rgb, u.colorC.rgb, value - 1.0); }
  if (value < 3.0) { return mix(u.colorC.rgb, u.colorD.rgb, value - 2.0); }
  return mix(u.colorD.rgb, u.colorA.rgb, value - 3.0);
}

@vertex
fn ribbon_vs_main(
  @builtin(vertex_index) vertexIndex: u32,
  @builtin(instance_index) instanceIndex: u32,
) -> RibbonOut {
  var corners = array<vec2<f32>, 6>(
    vec2<f32>(-1.0, -1.0), vec2<f32>(1.0, -1.0), vec2<f32>(-1.0, 1.0),
    vec2<f32>(-1.0, 1.0), vec2<f32>(1.0, -1.0), vec2<f32>(1.0, 1.0),
  );
  let layerIndex = instanceIndex / PR_PARTICLES_PER_LAYER;
  let particleIndex = instanceIndex % PR_PARTICLES_PER_LAYER;
  let uIndex = particleIndex / PR_V_SEGMENTS;
  let vIndex = particleIndex % PR_V_SEGMENTS;
  let layer = f32(layerIndex);
  let random = prHash(f32(instanceIndex));
  let activeLayer = layer < floor(clamp(u.ribbonCount, 2.0, 6.0) + 0.5);

  let uCoord = (f32(uIndex) + prHash(f32(instanceIndex) + 11.0) * 0.56)
               / f32(PR_U_SEGMENTS);
  let vCoord = (f32(vIndex) + prHash(f32(instanceIndex) + 29.0) * 0.46)
               / f32(PR_V_SEGMENTS);
  let strip = vCoord * 2.0 - 1.0;
  let t = u.time * u.speed;
  let phase = t * 0.48;
  let arc = fract(uCoord + layer * 0.211 - phase * 0.019);
  let arcLength = 0.76 + 0.055 * sin(t * 0.23 + layer * 1.71);
  let arcPosition = arc / arcLength;
  let arcEnvelope = smoothstep(0.0, 0.075, arcPosition)
                    * (1.0 - smoothstep(0.88, 1.0, arcPosition));
  let particleVisible = activeLayer
                        && arc <= arcLength
                        && random <= clamp(u.particleDensity, 0.2, 1.0);
  let theta = uCoord * 6.28318530718;
  let center = prCurve(theta, layer, phase);
  let ahead = prCurve(theta + 0.006, layer, phase);
  let tangent = normalize(ahead - center);
  let radial = normalize(center + vec3<f32>(0.001, 0.013, 0.007));
  let side = normalize(cross(tangent, radial));
  let surfaceNormal = normalize(cross(side, tangent));
  let twist = theta * (0.72 + u.ribbonTwist * 0.58)
              + phase * 0.74 + layer * 1.17;
  let ribbonDirection = normalize(side * cos(twist) + surfaceNormal * sin(twist));
  let widthEnvelope = (0.72 + 0.28 * pow(sin(theta * 1.5 + phase + layer), 2.0))
                      * mix(0.42, 1.0, sqrt(max(arcEnvelope, 0.0)));
  var position = center + ribbonDirection * strip * u.ribbonWidth * 0.5 * widthEnvelope;

  let pulse = sin(t * 0.73 + layer * 1.71)
              + 0.44 * sin(t * 1.17 + layer * 0.83 + 1.2);
  position *= 1.0 + u.ribbonBreath * pulse * 0.16;
  let layerCenter = layer
                    - (floor(clamp(u.ribbonCount, 2.0, 6.0) + 0.5) - 1.0) * 0.5;
  position = prRotateY(
    position,
    layerCenter * 0.24 + sin(t * 0.19 + layer * 1.3) * 0.055,
  );
  position = prRotateX(
    position,
    layerCenter * 0.14 + cos(t * 0.17 + layer * 0.9) * 0.04,
  );
  position = prRotateY(position, t * 0.105 + sin(t * 0.21) * 0.11);
  position = prRotateX(position, -0.2 + sin(t * 0.16 + layer * 0.1) * 0.16);

  let minSize = max(min(u.size.x, u.size.y), 1.0);
  let depthScale = 0.88 + position.z * 0.16;
  let orbPosition = position.xy * u.radius * 1.45 * depthScale;
  let clip = vec2<f32>(
    orbPosition.x * minSize / max(u.size.x, 1.0),
    orbPosition.y * minSize / max(u.size.y, 1.0),
  );
  let canvasParticleScale = clamp(minSize / 640.0, 0.22, 1.0);
  let pointPixels = max(0.6, u.particleSize)
                    * (1.5 + u.particleBloom * 2.5)
                    * (0.92 + position.z * 0.18)
                    * canvasParticleScale;
  let corner = corners[vertexIndex];
  let pointOffset = corner * pointPixels * 2.0 / max(u.size, vec2<f32>(1.0));

  let colorPhase = uCoord * 0.32 + layer * 0.19 + phase * 0.025
                   + position.z * 0.08;
  let stripEdge = smoothstep(0.58, 1.0, abs(strip));
  let front = clamp(0.78 + position.z * 0.54, 0.5, 1.24);
  let baseOpacity = mix(0.025, 0.009, clamp(u.shade / 1.5, 0.0, 1.0));
  var out: RibbonOut;
  out.pos = select(
    vec4<f32>(2.0, 2.0, 1.0, 1.0),
    vec4<f32>(clip + pointOffset, clamp(0.5 - position.z * 0.12, 0.05, 0.95), 1.0),
    particleVisible,
  );
  out.local = corner;
  out.color = pow(
    mix(prPalette(colorPhase), u.highlightColor.rgb, stripEdge * 0.56),
    vec3<f32>(0.72),
  ) * front;
  out.opacity = select(
    0.0,
    baseOpacity
      * (0.72 + stripEdge * 1.28)
      * arcEnvelope
      * pow(canvasParticleScale, 1.35),
    particleVisible,
  );
  return out;
}

@fragment
fn ribbon_fs_main(in: RibbonOut) -> @location(0) vec4<f32> {
  let distanceSquared = dot(in.local, in.local);
  if (distanceSquared > 1.0) { discard; }
  let core = exp(-distanceSquared * 4.8);
  let halo = exp(-distanceSquared * 1.35);
  let bloom = clamp(u.particleBloom, 0.0, 2.0);
  let intensity = in.opacity * (core * 1.9 + halo * bloom * 0.72)
                  * max(u.exposure, 0.0);
  let glowMix = clamp((halo - core * 0.45) * (0.18 + u.edgeGlow * 0.5), 0.0, 0.7);
  let color = mix(in.color, u.glowColor.rgb, glowMix);
  let alpha = clamp(intensity, 0.0, 1.0);
  return vec4<f32>(color * alpha, alpha);
}

@group(0) @binding(1) var ribbonTexture: texture_2d<f32>;
@group(0) @binding(2) var ribbonSampler: sampler;

fn prTextureUvFromOrb(p: vec2<f32>, contourRad: f32) -> vec2<f32> {
  let minSize = max(min(u.size.x, u.size.y), 1.0);
  let fc = (p * contourRad * minSize + u.size) * 0.5;
  return clamp(
    vec2<f32>(fc.x / max(u.size.x, 1.0), 1.0 - fc.y / max(u.size.y, 1.0)),
    vec2<f32>(0.0),
    vec2<f32>(1.0),
  );
}

fn prSampleRibbon(p: vec2<f32>, contourRad: f32) -> vec4<f32> {
  return textureSampleLevel(
    ribbonTexture,
    ribbonSampler,
    prTextureUvFromOrb(p, contourRad),
    0.0,
  );
}

@fragment
fn ribbon_composite_fs_main(in: VOut) -> @location(0) vec4<f32> {
  let direct = textureSampleLevel(ribbonTexture, ribbonSampler, in.uv, 0.0);
  if (u.glassEnabled <= 0.5) { return direct; }

  let fc = vec2<f32>(in.uv.x, 1.0 - in.uv.y) * u.size;
  let minSize = max(min(u.size.x, u.size.y), 1.0);
  let uv = (2.0 * fc - u.size) / minSize;
  let rad = max(u.radius, 0.05);
  let t = u.time * u.speed;
  let contourRad = rad * glsContourScale(uv, t, u.contourDeform);
  let shell = orbGlassLiquidAnim(in.uv);
  if (length(uv) > contourRad * (1.01 + mfEdgeD(u.edgeSoftness))) {
    return shell;
  }

  let p = uv / contourRad;
  let pd = length(p);
  let clearFa = 1.0 - smoothstep(GL_CLEAR_EA, GL_CLEAR_EB, pd);
  let normal = glsContourNormal(uv, rad, t, u.contourDeform);
  let edgeDepth = max(1.0 - pd, 0.0);
  let refractionWidth = 0.015 + 0.95 * clamp(u.shellMidAlpha, 0.0, 1.0);
  let refractionT = edgeDepth / max(refractionWidth, 0.001);
  let refractionProfile = pow(glsRefractionProfile(refractionT), 0.68);
  let refractionAmount = 1.6 * clamp(u.glassOpacity, 0.0, 1.0)
                         * refractionProfile;
  let refractedP = p - normal * refractionAmount;
  let channelSplit = 0.14 * clamp(u.gloss, 0.0, 2.0)
                     * clamp(u.glassOpacity, 0.0, 1.0)
                     * refractionProfile;
  let redSample = prSampleRibbon(refractedP - normal * channelSplit, contourRad);
  let greenSample = prSampleRibbon(refractedP, contourRad);
  let blueSample = prSampleRibbon(refractedP + normal * channelSplit, contourRad);
  let refractedAlpha = max(redSample.a, max(greenSample.a, blueSample.a)) * clearFa;
  let refracted = vec4<f32>(
    vec3<f32>(redSample.r, greenSample.g, blueSample.b) * clearFa,
    refractedAlpha,
  );
  return vec4<f32>(
    shell.rgb + refracted.rgb * (1.0 - shell.a),
    shell.a + refracted.a * (1.0 - shell.a),
  );
}
`,v={voiceWave:{idle:[1,1,0,.266,.7,.3312,1.196,.1932,2.2,.08,.22,.36,.18,.2,.837,19,.005,0,0,1,.48,.03,2,.42,.77,.23,65,0,0,1,.22,.25,.72,5,.42,1.25,.55,.3,1.2,.7,.0313725,.0196078,.0431373,1,.415686,.184314,.411765,1,.54902,.27451,.321569,1,.333333,.27451,.498039,1,.709804,.541176,.647059,1,1,1,1,1,.894118,.545098,1,1,1,.470588,.564706,1,1,.945098,.980392,1,.905882,.85098,1,1,.00784314,.00392157,.0196078,1,.423529,.243137,.447059,1,.968627,.984314,1,1,.937255,.964706,.992157,1,.878431,.933333,.976471,1,.831373,.901961,.968627,1,.733333,.835294,.952941,1,.65098,.780392,.941176,1,.529412,.690196,.921569,1,.435294,.619608,.909804,1,.435294,.619608,.909804,1,.435294,.619608,.909804,1,.435294,.619608,.909804,1,.435294,.619608,.909804,1],thinking:[1,1,0,.95,.7,.36,2.6,.46,2.2,.08,.22,.36,.18,.2,1.35,19,.005,0,0,1,.48,.1,2,.42,.77,.23,65,0,0,1,.22,.25,.72,5,.42,1.25,.55,.3,1.2,.7,.0352941,.0117647,.054902,1,.807843,.172549,.796078,1,1,.360784,.443137,1,.482353,.32549,1,1,1,.85098,.941176,1,1,1,1,1,.894118,.545098,1,1,1,.470588,.564706,1,1,.945098,.980392,1,.905882,.85098,1,1,.00784314,.00392157,.0196078,1,.807843,.172549,.796078,1,.968627,.984314,1,1,.937255,.964706,.992157,1,.878431,.933333,.976471,1,.831373,.901961,.968627,1,.733333,.835294,.952941,1,.65098,.780392,.941176,1,.529412,.690196,.921569,1,.435294,.619608,.909804,1,.435294,.619608,.909804,1,.435294,.619608,.909804,1,.435294,.619608,.909804,1,.435294,.619608,.909804,1]},custom:{idle:[1,1,0,.56,.72,.3312,1.824,.44,3.848,.58,.36,.28,.2,.22,.7776,12,.02,0,0,1,.42,0,2,.42,.77,.23,65,0,0,1,.22,.25,.72,5,.42,1.25,.55,.3,1.2,.7,.454902,.498039,.964706,1,.909804,.913725,.929412,1,.34902,.419608,.831373,1,.854902,.858824,.905882,1,.796078,.811765,.807843,1,1,1,1,1,.72549,.752941,.792157,1,1,1,1,1,.917647,.956863,1,1,.862745,.917647,1,1,.94902,.94902,.952941,1,.454902,.478431,.482353,1,.968627,.984314,1,1,.937255,.964706,.992157,1,.878431,.933333,.976471,1,.831373,.901961,.968627,1,.733333,.835294,.952941,1,.65098,.780392,.941176,1,.529412,.690196,.921569,1,.435294,.619608,.909804,1,.435294,.619608,.909804,1,.435294,.619608,.909804,1,.435294,.619608,.909804,1,.435294,.619608,.909804,1],thinking:[1,1,0,2,.72,.27,4.25,.44,.5,0,.36,.28,.2,.22,1.06,12,.02,.11,0,1,.42,.15,2,.42,.77,.23,65,0,0,1,.22,.25,.72,5,.42,1.25,.55,.3,1.2,.7,.254902,.47451,.882353,1,.968627,.968627,.972549,1,.0588235,.341176,.760784,1,.862745,.921569,.980392,1,1,1,1,1,1,1,1,1,.72549,.752941,.792157,1,1,1,1,1,.917647,.956863,1,1,.862745,.917647,1,1,.94902,.94902,.952941,1,.0745098,.0470588,.87451,1,.968627,.984314,1,1,.937255,.964706,.992157,1,.878431,.933333,.976471,1,.831373,.901961,.968627,1,.733333,.835294,.952941,1,.65098,.780392,.941176,1,.529412,.690196,.921569,1,.435294,.619608,.909804,1,.435294,.619608,.909804,1,.435294,.619608,.909804,1,.435294,.619608,.909804,1,.435294,.619608,.909804,1]},chromatic:{idle:[1,1,0,.336,.51,.3,3,.5,2.2,.1,.14,.46,.2,.16,.7776,22,.005,0,0,1,.54,0,1.24,.147,.77,.1104,76,-1,0,.32,.216,.209,.72,5,.42,1.25,.55,.3,1.2,.7,.721569,.737255,.729412,1,.4,.419608,.411765,1,.619608,.639216,.631373,1,.156863,.168627,.176471,1,.819608,.835294,.827451,1,.968627,.988235,1,1,.431373,.862745,1,1,1,.501961,.427451,1,.968627,.988235,1,1,.85098,.952941,1,1,.0117647,.0509804,.0509804,1,.470588,.537255,.560784,1,.968627,.984314,1,1,.937255,.964706,.992157,1,.878431,.933333,.976471,1,.831373,.901961,.968627,1,.733333,.835294,.952941,1,.65098,.780392,.941176,1,.529412,.690196,.921569,1,.435294,.619608,.909804,1,.435294,.619608,.909804,1,.435294,.619608,.909804,1,.435294,.619608,.909804,1,.435294,.619608,.909804,1],thinking:[1,1,0,1.72,.51,.3,3,.5,2.2,.1,.14,.46,.2,.16,1.08,22,.005,0,0,1,.54,0,2.3,.56,.77,.55,76,-1,0,1.18,.9,.38,.72,5,.42,1.25,.55,.3,1.2,.7,.0784314,.168627,.858824,1,.862745,.858824,.921569,1,.890196,.886275,.913725,1,.117647,.168627,.745098,1,1,1,1,1,.968627,.988235,1,1,.431373,.862745,1,1,1,.501961,.427451,1,.968627,.988235,1,1,.85098,.952941,1,1,.0117647,.0509804,.0509804,1,.741176,.937255,1,1,.968627,.984314,1,1,.937255,.964706,.992157,1,.878431,.933333,.976471,1,.831373,.901961,.968627,1,.733333,.835294,.952941,1,.65098,.780392,.941176,1,.529412,.690196,.921569,1,.435294,.619608,.909804,1,.435294,.619608,.909804,1,.435294,.619608,.909804,1,.435294,.619608,.909804,1,.435294,.619608,.909804,1]}},ee=`custom`;v.custom;var te=770,ne=1350,re=[[6,`mid`,1.45,0,8],[7,`mid`,0,1.05,1],[8,`mid`,0,1,8],[21,`low`,0,.85,1],[10,`high`,.22,0,2],[3,`all`,0,.85,5],[14,`all`,0,.1,4]],ie={9:.8,10:.65,11:.65,14:.75,19:1,21:.7,12:.85,22:.85},ae=.07,oe=170,se=13,ce=2.6,le=.35,ue=.16,de=.55,fe=.22,pe=.32,me=.05,he=.22,ge=1.15,_e=e=>Number.isFinite(e)?Math.min(1,Math.max(0,e)):0;function y(e){return e<=.04045?e/12.92:((e+.055)/1.055)**2.4}function ve(e){return e<=.0031308?e*12.92:1.055*e**(1/2.4)-.055}function ye(e,t,n){return ve(y(e)+(y(t)-y(e))*n)}var b=40,be=84;function xe(e){let t=[e[b],e[41],e[42]],n=-1;for(let r=0;r<4;r++){let i=b+r*4,a=[e[i],e[i+1],e[i+2]],o=Math.max(...a)-Math.min(...a);o>n&&Math.max(...a)>.25&&(n=o,t=a)}let r=Math.max(...t);if(r>.001){let e=Math.min(2.4,.95/r);t=[t[0]*e,t[1]*e,t[2]*e].map(e=>Math.min(1,e))}return t}function Se(e,t){e[be]=t[0],e[85]=t[1],e[86]=t[2],e[87]=1}function Ce(e){let t=e.idle.slice(),n=e.thinking.slice(),r=(e,r,i,a,o=1)=>{let s=t.slice(),c=(e,r)=>{s[e]=t[e]+(n[e]-t[e])*r};return s[3]=e,c(6,r),c(7,r),c(8,r),c(21,r),s[14]=i,s[17]=a,s[4]=t[4]*o,s},i=t.slice();for(let e=b;e<i.length;e++)i[e]=n[e];let a=(e,r)=>{i[e]=t[e]+(n[e]-t[e])*r};a(3,.55),a(6,.5),a(7,.5),a(8,.4),a(21,.4),a(14,.7),a(17,.6);let o=xe(t),s={idle:t,dock:i,active:r(3.2,1,.92,.09,.9),thinking:r(1.5,.75,.8,.07,.86),listening:r(1.6,.42,.86,.05,.92),speaking:r(2.4,.68,1,.12,.94)};for(let e of Object.values(s))Se(e,o);return s}var we=class{#e;#t=null;#n=null;#r=null;#i=null;#a=null;#o=`bgra8unorm`;#s;#c=new Float32Array(136);#l=new Float32Array(136);#u=new Float32Array(136);#d=new Float32Array(136);#f=`idle`;#p=`idle`;#m=0;#h=0;#g=0;#_=0;#v=0;#y=!1;#b=!1;#x=2;#S={low:0,mid:0,high:0,all:0};#C=0;#w=0;#T=0;#E=0;#D=0;#O={};constructor(e,t=ee){this.#e=e;let n=v[t]??v.custom;this.#s=Ce(n),this.#c.set(this.#s.idle),this.#l.set(this.#s.idle),this.#u.set(this.#s.idle),this.#d.set(this.#s.idle)}get radiusFactor(){return this.#s.idle[4]}get state(){return this.#f}get envelope(){return{contour:this.#D,emph:this.#w,spring:this.#T}}get uniformsSnapshot(){let e=this.#c;return{exposure:e[14],radius:e[4],warp:e[6],ridge:e[7],deform:e[21],edgeGlow:e[17],colorA:[e[40],e[41],e[42]],glowColor:[e[84],e[85],e[86]]}}async init(){let e=navigator.gpu;if(!e)return!1;let t,n=null;try{let r=await e.requestAdapter();if(!r||(t=await r.requestDevice(),n=this.#e.getContext(`webgpu`),!n))return!1;this.#o=e.getPreferredCanvasFormat(),n.configure({device:t,format:this.#o,alphaMode:`premultiplied`})}catch(e){return console.warn(`[liquid-orb] WebGPU 初始化失败`,e),!1}this.#t=t,this.#n=n,t.lost.then(e=>{console.warn(`[liquid-orb] WebGPU device lost:`,e.message||e.reason),this.#F()}),t.addEventListener(`uncapturederror`,e=>{console.error(`[liquid-orb] WebGPU error:`,e.error.message)});try{this.#k()}catch(e){return console.warn(`[liquid-orb] 管线创建失败`,e),!1}return this.#P(),!0}#k(){let e=this.#t;if(!e)return;let t=e.createShaderModule({code:_}),n={color:{srcFactor:`one`,dstFactor:`one-minus-src-alpha`,operation:`add`},alpha:{srcFactor:`one`,dstFactor:`one-minus-src-alpha`,operation:`add`}};this.#r=e.createRenderPipeline({layout:`auto`,vertex:{module:t,entryPoint:`vs_main`},fragment:{module:t,entryPoint:`fs_main`,targets:[{format:this.#o,blend:n}]},primitive:{topology:`triangle-list`}});let r=new Float32Array(this.#d);this.#i=e.createBuffer({size:r.byteLength,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),this.#a=e.createBindGroup({layout:this.#r.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:this.#i}}]})}setVisualState(e){if(e===this.#f||!this.#s[e])return;let t=performance.now();this.#A(t),this.#l.set(this.#d),this.#u.set(this.#s[e]),this.#p=e,this.#m=t,this.#h=e===`active`?te:ne,this.#f=e}setState(e){this.setVisualState(e)}setAudioBands(e){let t=e=>{let t=_e(e??0);return t<ae?0:t};this.#S={low:t(e?.low),mid:t(e?.mid),high:t(e?.high),all:t(e?.all)}}setOverrides(e){this.#O=e}setMaxPixelRatio(e){this.#x=Math.max(1,Math.min(3,e))}#A(e){if(this.#h<=0)return;let t=Math.min(1,Math.max(0,(e-this.#m)/this.#h)),n=this.#p===`thinking`?1-(1-t)**3:t*t*(3-2*t);for(let e=3;e<this.#d.length;e++){let t=e>=40&&(e-40)%4<3;this.#d[e]=t?ye(this.#l[e],this.#u[e],n):this.#l[e]+(this.#u[e]-this.#l[e])*n}}#j(e){let t=ie[Math.round(e[15])]??0;if(t)for(let[n,r,i,a,o]of re){let s=this.#S[r]*t;if(!s)continue;let c=e[n];e[n]=Math.min(o,Math.max(c,c*(1+a*s)+i*s))}}#M(e,t){let n=this.#S.all;(t>0?(n-this.#C)/t:0)>ce&&n>le&&(this.#w=Math.min(1,this.#w+.9)),this.#C=n,this.#w=Math.max(0,this.#w-t*2.2);let r=n>this.#D?me:he;if(t>0){let e=1-Math.exp(-t/r);this.#D+=(n-this.#D)*e}let i=Math.min(1,Math.max(0,this.#D));e[6]+=de*i,e[7]=Math.min(1,e[7]*(1+fe*i)),e[21]=Math.min(1,e[21]+pe*i);let a=n*.5+this.#w;t>0&&(this.#E+=(a-this.#T)*oe*t-this.#E*se*t,this.#T+=this.#E*t,this.#T=Math.max(-.06,Math.min(.06,this.#T))),e[4]*=1+this.#T*.25,e[14]*=1+this.#T*.1+this.#w*ue}#N(e){let t=this.#O;if(t.byIndex)for(let n of Object.keys(t.byIndex))e[Number(n)]=t.byIndex[Number(n)];t.radiusScale!==void 0&&(e[4]*=t.radiusScale),t.speedScale!==void 0&&(e[3]*=t.speedScale),t.exposureScale!==void 0&&(e[14]*=t.exposureScale),t.edgeGlow!==void 0&&(e[17]=t.edgeGlow)}#P(){this.#y||this.#b||(this.#y=!0,this.#_=0,this.#v=requestAnimationFrame(this.#I))}#F(){this.#y=!1,cancelAnimationFrame(this.#v)}#I=e=>{if(this.#b)return;this.#v=requestAnimationFrame(this.#I);let t=this.#t,n=this.#n;if(!t||!n)return;let r=Math.min(window.devicePixelRatio||1,this.#x),i=Math.max(1,Math.floor(this.#e.clientWidth*r)),a=Math.max(1,Math.floor(this.#e.clientHeight*r));(this.#e.width!==i||this.#e.height!==a)&&(this.#e.width=i,this.#e.height=a);let o=this.#_===0?0:Math.min(.1,Math.max(0,(e-this.#_)/1e3));this.#_=e,this.#A(e);let s=this.#c;s.set(this.#d);let c=this.#d[14];this.#j(s),this.#M(s,o),this.#N(s),c>.001&&(s[14]=Math.min(s[14],c*ge));let l=Math.max(s[3],0);this.#g+=o*l,s[0]=i,s[1]=a,s[2]=this.#g/Math.max(l,.001),t.queue.writeBuffer(this.#i,0,s);try{let e=t.createCommandEncoder(),r=e.beginRenderPass({colorAttachments:[{view:n.getCurrentTexture().createView(),clearValue:{r:0,g:0,b:0,a:0},loadOp:`clear`,storeOp:`store`}]});r.setPipeline(this.#r),r.setBindGroup(0,this.#a),r.draw(3),r.end(),t.queue.submit([e.finish()])}catch(e){console.error(`[liquid-orb] 渲染出错`,e),this.#F()}};destroy(){this.#b=!0,this.#F(),this.#i?.destroy(),this.#t?.destroy(),this.#t=null,this.#n=null}},Te=[[`low`,20,250],[`mid`,250,2e3],[`high`,2e3,8e3]],Ee=class{#e;#t;#n={mic:null,bus:null};#r=null;#i={low:0,mid:0,high:0,all:0};#a={low:0,mid:0,high:0,all:0};#o=null;#s=null;#c=0;#l=0;#u=!1;#d=.045;#f=.28;#p=new Float32Array(32);#m=new Float32Array(32);constructor(e,t){this.#e=e,this.#t=t??null}get bands(){return{...this.#i}}get source(){return this.#r}attach(e,t){this.#n[e]=t,e===this.#r&&(this.#o=t?new Uint8Array(new ArrayBuffer(t.analyser.frequencyBinCount)):null,this.#s=t?new Float32Array(new ArrayBuffer(t.analyser.fftSize)):null)}setSource(e){if(e===this.#r)return;this.#r=e;let t=e?this.#n[e]:null;this.#o=t?new Uint8Array(new ArrayBuffer(t.analyser.frequencyBinCount)):null,this.#s=t?new Float32Array(new ArrayBuffer(t.analyser.fftSize)):null,t||(this.#a={low:0,mid:0,high:0,all:0},this.#m.fill(0))}start(){this.#u||(this.#u=!0,this.#l=performance.now(),this.#c=requestAnimationFrame(this.#h))}stop(){this.#u=!1,cancelAnimationFrame(this.#c),this.#a={low:0,mid:0,high:0,all:0},this.#i={low:0,mid:0,high:0,all:0},this.#m.fill(0),this.#p.fill(0),this.#e(this.#i),this.#t?.(this.#p)}#h=e=>{if(!this.#u)return;this.#c=requestAnimationFrame(this.#h);let t=Math.min(.1,Math.max(.001,(e-this.#l)/1e3));this.#l=e;let n=this.#r?this.#n[this.#r]:null,r=n?.analyser??null,i=this.#o,a=this.#s;if(!r||!i||!a||!n){this.#a={low:0,mid:0,high:0,all:0},this.#_();return}r.getByteFrequencyData(i),r.getFloatTimeDomainData(a);let o=0;for(let e=0;e<a.length;e++)o+=a[e]*a[e];let s=Math.sqrt(o/Math.max(1,a.length)),c=(n.ctx.sampleRate||48e3)/2/i.length,l={low:0,mid:0,high:0,all:0},u=0;for(let[e,t,n]of Te){let r=Math.max(0,Math.floor(t/c)),a=Math.min(i.length-1,Math.ceil(n/c)),o=0;for(let e=r;e<=a;e++)o+=i[e];let s=a>=r?o/(a-r+1)/255:0;l[e]=s,u+=s}let d=Math.min(1,Math.max(0,s-.004)*5.5);this.#a={low:Math.min(1,l.low*1.9),mid:Math.min(1,l.mid*2.5),high:Math.min(1,l.high*2.2),all:Math.max(d,Math.min(1,u/3*2))},this.#g(i,c),this.#_(t)};#g(e,t){let n=this.#m.length,r=Math.min(1e4,t*e.length),i=Math.log(80),a=Math.log(r);for(let r=0;r<n;r++){let o=Math.exp(i+(a-i)*(r/n)),s=Math.exp(i+(a-i)*((r+1)/n)),c=Math.max(0,Math.floor(o/t)),l=Math.min(e.length-1,Math.max(c,Math.ceil(s/t)-1)),u=0;for(let t=c;t<=l;t++)u+=e[t];let d=u/Math.max(1,l-c+1)/255,f=1+r/n*.9;this.#m[r]=Math.min(1,d*3*f)}}#_(e=1/60){let t=(t,n,r=this.#d,i=this.#f)=>{let a=n>t?r:i,o=1-Math.exp(-e/Math.max(1e-4,a));return t+(n-t)*o};this.#i={low:t(this.#i.low,this.#a.low),mid:t(this.#i.mid,this.#a.mid),high:t(this.#i.high,this.#a.high),all:t(this.#i.all,this.#a.all)};for(let e of[`low`,`mid`,`high`,`all`])this.#i[e]<1e-4&&(this.#i[e]=0);if(this.#e(this.#i),this.#t){for(let e=0;e<this.#p.length;e++)this.#p[e]=t(this.#p[e],this.#m[e],.05,.3),this.#p[e]<8e-4&&(this.#p[e]=0);this.#t(this.#p)}}};i(`liquid`,(e,t)=>new we(e,t.orbPreset)),customElements.get(`ai-orb-chat`)||customElements.define(`ai-orb-chat`,g);var x={orb:`liquid`,orbPreset:`custom`,brand:`瀚涛百事通`,kbPath:`/kb`,chunkMs:1e3,aec:!0,upGate:!1,log:!0,theme:`light`,auraMode:`native`},S=[{type:`function`,name:`query_company_policy`,description:`查询公司内部制度与政策。凡是涉及公司自身事务——规章制度、办事流程、报销、发票、入职离职、考勤、请假、年假、加班、出差、补贴、薪酬绩效、培训、合同、组织与部门、项目情况、系统账号等——都必须先调用它拿到资料再回答，绝对不允许凭印象编造公司信息。`,parameters:{type:`object`,properties:{topic:{type:`string`,description:`要查的主题，如「笔记本补贴」「考勤制度」「年假天数」`}},required:[`topic`]}},{type:`function`,name:`get_datetime`,description:`获取今天的日期、星期和当前时间。当用户问到日期、时间、今天几号、今天星期几、现在几点时调用它，不要凭记忆回答。`,parameters:{type:`object`,properties:{}}}],C={query_company_policy:`查公司制度`,get_datetime:`查日期时间`},De=new Set([`query_company_policy`]),Oe=`成都`;function ke(){let e=new Date,t=`日一二三四五六`[e.getDay()];return{date:`${e.getFullYear()}年${e.getMonth()+1}月${e.getDate()}日`,weekday:`星期${t}`,time:`${String(e.getHours()).padStart(2,`0`)}:${String(e.getMinutes()).padStart(2,`0`)}`,location:Oe}}async function Ae(e,t){let n=Math.round(t||30),r=await(await fetch(`${x.kbPath}?q=${encodeURIComponent(e)}&t=${n}`,{cache:`no-store`})).json();if(!r||!r.ok)throw Error(r&&r.error||`kb_failed`);return r}async function je(e,t,n){if(e===`query_company_policy`){n.tool();let e=await Ae(String(t.topic||``),25);return String(e.answer||``).slice(0,1500)||`（知识库没有返回相关内容）`}if(e===`get_datetime`){let e=ke();return`${e.date} ${e.weekday} ${e.time}`}return`（没有名为 ${e} 的工具）`}var Me=class{#e;constructor(e){this.#e=e}#t(e,t){let n=this.#e();if(n)try{let{ctx:r,destination:i}=n,a=r.currentTime+.05,o=r.createGain();o.gain.value=t,o.connect(i);let s=0;for(let[t,n,i]of e){let e=r.createOscillator(),c=r.createGain();e.type=`sine`,e.frequency.value=t;let l=a+n;c.gain.setValueAtTime(1e-4,l),c.gain.exponentialRampToValueAtTime(1,l+Math.min(.05,i*.2)),c.gain.exponentialRampToValueAtTime(1e-4,l+i),e.connect(c),c.connect(o),e.start(l),e.stop(l+i+.02),s=Math.max(s,n+i)}n.hold(Math.round((s+.15)*1e3))}catch{}}ready(){this.#t([[523.25,0,.85],[659.25,.4,.85],[880,.8,1.45]],.18)}exit(){this.#t([[880,0,.5],[659.25,.34,.5],[523.25,.68,.7]],.14)}error(){this.#t([[440,0,.16],[330,.2,.22]],.1)}tool(){this.#t([[440,0,.16],[659.25,.13,.22]],.12)}},w=16e3,T=24e3,Ne=.2,E=location.protocol===`https:`,D=(location.port===`8770`||E)&&location.hostname?location.host:`127.0.0.1:8770`,Pe=()=>`${E?`wss`:`ws`}://${D}`,O=e=>`${Pe()}/ws?mode=${e}`,Fe=`${E?`https`:`http`}://${D}`;async function Ie(){try{return(await fetch(`${Fe}/health`,{cache:`no-store`})).ok}catch{return!1}}var k=[`你是「瀚涛百事通」，一个聪明、亲切、反应快的中文语音助手，此刻正在和用户**打电话**。`,`【说话风格】像真人聊天一样自然、口语化；回答**简短**，通常一到三句话，不要长篇大论。`,`  不要输出 emoji、markdown、列表、编号或括号里的旁白；你的每一个字都会被读出来。`,`  不要动不动就自我介绍或说「作为一个人工智能助手」；除非用户问起，不要报家门。`,`【倾听与打断】你是全双工的，可以一边听一边说。用户随时可能插话——`,`  一旦用户开口，立刻停下、先听用户说完，再自然地接住新内容，不要抢话、不要自顾自说完。`,`  用户只是「嗯」「对」这类附和时，可以继续把话说完，不必每次都让位。`,`【查资料】凡是涉及**公司自身事务**（规章制度、办事流程、报销发票、入职离职、考勤请假、`,`  年假、加班出差、补贴、薪酬绩效、培训、合同、组织部门、项目、系统账号等），`,`  你必须**先调用 query_company_policy 查到资料再回答**，绝对不许凭印象编造公司信息。`,`  查到资料后，用你自己的话**简要口语化地复述重点**（先给结论和关键数字），`,`  不要逐字照读原文条款，也不要罗列一大批细节。`,`  问到日期、时间、今天几号、星期几、现在几点时，调用 get_datetime，不要凭记忆回答。`,`  不要在回答里出现「工具」「知识库」「查询结果」「根据资料」这类字眼，`,`  直接把结果当成你本来就知道的事情，自然地讲出来。`].join(``);function A(e){let t=e.length,n=new Uint8Array(t*2),r=new DataView(n.buffer);for(let n=0;n<t;n++){let t=Math.max(-1,Math.min(1,e[n]||0));r.setInt16(n*2,t<0?t*32768:t*32767,!0)}let i=``,a=32768;for(let e=0;e<n.length;e+=a)i+=String.fromCharCode.apply(null,n.subarray(e,e+a));return btoa(i)}function Le(e){let t=atob(e),n=t.length>>1,r=new Uint8Array(n*2);for(let e=0;e<t.length;e++)r[e]=t.charCodeAt(e)&255;let i=new DataView(r.buffer),a=new Float32Array(n);for(let e=0;e<n;e++)a[e]=i.getInt16(e*2,!0)/32768;return a}function Re(e,t,n){if(t===n)return e;let r=n/t,i=Math.round(e.length*r),a=new Float32Array(i);for(let t=0;t<i;t++){let n=t/r,i=Math.floor(n),o=Math.min(i+1,e.length-1),s=n-i;a[t]=e[i]*(1-s)+e[o]*s}return a}function ze(e){let t=0;for(let n=0;n<e.length;n+=16)t+=e[n]*e[n];return Math.sqrt(t/Math.max(1,e.length/16))}var Be=class{#e;#t;#n;#r;#i=null;#a=null;#o=!1;#s=null;#c=null;#l=null;#u=null;#d=null;#f=null;#p=null;#m=null;#h=0;#g=new Set;#_=0;#v=!1;#y=0;#b=0;#x=[];#S=0;#C=!1;#w=``;#T=x.aec;#E=x.chunkMs;#D=0;#O=!1;#k=0;#A=!1;#j=Promise.resolve();#M=!1;#N=``;#P=!1;#F=!1;#I=null;#L=0;#R={responseOpen:!1,pending:!1,gen:0,pendingGen:-1,toolCalls:[]};#z=!1;#B={noise:.004,active:!1,voiceRun:0,lastVoice:0,len:0,frames:0,pre:[],preLen:0};#V=!1;constructor(e,t){this.#e=e,this.#t=t,this.#r=new Ee(t=>e.setAudioBands(t),t=>e.setAudioSpectrum(t)),this.#n=new Me(()=>this.#H())}get sounds(){return this.#n}get audio(){return this.#r}get connected(){return!!this.#i&&this.#i.readyState===1}get inCall(){return!!this.#i&&(this.#i.readyState===0||this.#i.readyState===1)}get micDeviceId(){return this.#f}setMicDevice(e){this.#f=e,this.#o&&(this.stopMic(),window.setTimeout(()=>void this.startMic(),300))}setAec(e){this.#T=e}setChunkMs(e){this.#E=e}setUpGate(e){x.upGate=e}#H(){let e=this.#K();return!e||!this.#m?null:{ctx:e,destination:this.#m,hold:e=>{this.#y=Math.max(this.#y,performance.now()+e)}}}async startVoice(){if(this.inCall)return;let e=++this.#D;if(this.#O=!1,this.#t.onState(`连接中…`,`info`),this.#t.onVoice(`thinking`),this.#R={responseOpen:!1,pending:!1,gen:0,pendingGen:-1,toolCalls:[]},!await Ie()){if(e!==this.#D)return;this.#t.onError(`中继未连接（${D}）。请先运行 server.py，再用 http://${D} 打开本页。`),this.#n.error(),this.#t.onVoice(`idle`);return}if(e!==this.#D)return;this.#C=!1,this.#v=!1;let t=new WebSocket(O(`audio`));this.#i=t,t.onopen=()=>{if(e!==this.#D)try{t.close()}catch{}else this.#t.onState(`初始化…`),this.#W()},t.onclose=e=>{this.#i===t&&(this.#i=null,this.stopMic(),this.#ve(),this.#t.onState(`已断开`),this.#t.onVoice(`idle`),this.#r.setSource(null),!this.#O&&(e&&e.code&&e.code!==1e3&&e.code!==1005?(this.#n.error(),this.#t.onError(`通话断开（code ${e.code}${e.reason?` ${e.reason}`:``}）`)):this.#n.exit()))},t.onerror=()=>{if(e===this.#D&&(this.#t.onError(`WebSocket 连接出错`),this.#n.error(),this.stopMic(),this.#t.onVoice(`idle`),this.#i===t)){this.#i=null;try{t.close()}catch{}}},t.onmessage=e=>{try{this.#G(JSON.parse(e.data))}catch{}}}stopVoice(){let e=!!this.#i;if(this.#D++,this.#O=!0,this.#te(!0),this.#e.discardLive(),this.#e.setListening(!1),this.#e.setThinking(!1),this.#R={responseOpen:!1,pending:!1,gen:0,pendingGen:-1,toolCalls:[]},this.#A=!1,this.#P=!1,this.#C=!1,this.#v=!1,this.stopMic(),this.#ve(),this.#Y(),this.#r.setSource(null),e){this.#n.exit();let e=this.#p;window.setTimeout(()=>{this.inCall||this.#p!==e||this.#X()},1300)}else this.#X();if(this.#i){try{this.#i.close()}catch{}this.#i=null}if(this.#a){try{this.#a.close()}catch{}this.#a=null}this.#t.onState(`未连接`),this.#t.onVoice(`idle`)}#U(e,t=1400){let n=++this.#k;this.#t.onState(e),window.setTimeout(()=>{n===this.#k&&this.inCall&&!this.#R.responseOpen&&this.#t.onState(`已连接`,`ok`)},t)}interrupt(){if(!this.inCall&&!this.#A)return!1;let e=this.#R.responseOpen||this.#A,t=this.inCall&&this.#J();if(!e&&!t)return!1;if(this.#Y(),this.#te(!0),this.#e.setThinking(!1),this.#v=!1,this.#R.responseOpen=!1,e){let e=this.#a&&this.#a.readyState===1,t=this.#A&&e?this.#a:this.#i;if(t?.readyState===1)try{t.send(JSON.stringify({type:`response.cancel`}))}catch{}}return this.#A=!1,this.#U(t?`— 已打断 —`:`— 已取消 —`),this.#e.pulse(.35),this.inCall&&this.#t.onVoice(`user`),!0}#W(){this.#i&&this.#i.readyState===1&&this.#i.send(JSON.stringify({type:`session.update`,session:{modalities:[`text`,`audio`],voice:`longanqian`,instructions:k,tools:S,input_audio_transcription:{model:`qwen3-asr-flash-realtime`,language:`zh`},enable_speech_emotion:!0,turn_detection:{type:`server_vad`,threshold:.5,silence_duration_ms:800,prefix_padding_ms:300,create_response:!0,interrupt_response:!0}}}))}#G(e){switch(String(e.type||``)){case`session.created`:{if(!this.#i||this.#i.readyState!==1)break;this.#C=!0;let t=e.session||{};this.#w=`session ${(t.id||``).slice(-6)}`,this.#t.onState(`通话中`,`ok`),this.#n.ready(),this.#e.pulse(.9),this.startMic();break}case`input_audio_buffer.speech_started`:this.#Y(),this.#v=!0,this.#re(!0,e.item_id);break;case`input_audio_buffer.speech_stopped`:this.#re(!1,e.item_id);break;case`input_audio_buffer.committed`:this.#R.gen++;break;case`conversation.item.input_audio_transcription.delta`:{let t=String(e.stash||e.text||``);t&&this.#se(t,e.item_id,!1);break}case`conversation.item.input_audio_transcription.completed`:{let t=String(e.transcript||e.stash||``);this.#se(t,e.item_id,!0);break}case`response.created`:this.#t.onVoice(`thinking`),this.#R.responseOpen=!0,this.#v=!1,this.#Z();break;case`response.output_item.added`:{let t=e.item||{};t.type===`function_call`&&t.name&&this.#le(t.name,t.call_id??null);break}case`response.function_call_arguments.done`:this.#ue(e).catch(()=>{});break;case`response.audio_transcript.delta`:this.#ee(String(e.delta||``)),this.#t.onVoice(`ai`),this.#r.setSource(`bus`);break;case`response.audio.delta`:if(this.#v)break;if(e.delta){let t=Le(String(e.delta));this.#q(t),this.#F||(this.#F=!0,this.#I=this.#b),this.#t.onVoice(`ai`),this.#r.setSource(`bus`)}break;case`response.done`:{let t=(e.response||{}).status||``;this.#R.responseOpen=!1,t===`cancelled`?(this.#Y(),this.#te(!0),this.#e.setThinking(!1),this.#U(`— 已打断 —`),this.inCall&&this.#t.onVoice(`user`)):t===`failed`?(this.#t.onError(`本轮生成失败`),this.#n.error(),this.#e.setThinking(!1),this.#te(!1),this.inCall?this.#t.onVoice(`user`):this.#t.onVoice(`idle`)):(this.#ne(),this.#e.setThinking(!1)),this.#de();break}case`error`:this.#t.onError(String(e.error?.message||JSON.stringify(e))),this.#n.error(),this.#e.setThinking(!1),this.#R.responseOpen=!1,this.#t.onVoice(this.inCall?`user`:`idle`)}}#K(){if(!this.#p){let e=window.AudioContext||window.webkitAudioContext;if(!e)return null;this.#p=new e({sampleRate:T}),this.#m=this.#p.createGain(),this.#m.connect(this.#p.destination);let t=this.#p.createAnalyser();t.fftSize=1024,t.smoothingTimeConstant=.6,this.#m.connect(t);let n={analyser:t,ctx:this.#p};this.#r.attach(`bus`,n)}return this.#p.state===`suspended`&&this.#p.resume().catch(()=>{}),this.#p}#q(e){let t=this.#K();if(!t||!this.#m)return;let n=t.createBuffer(1,e.length,T);n.copyToChannel(e,0);let r=t.createBufferSource();r.buffer=n,r.connect(this.#m);let i=this.#h>t.currentTime?this.#h:t.currentTime+Ne;r.start(i),this.#h=i+n.duration,this.#b=i,this.#g.add(r),r.onended=()=>{this.#g.delete(r)},this.#_||=window.setInterval(()=>{this.#p&&this.#p.currentTime>=this.#h-.05&&(window.clearInterval(this.#_),this.#_=0,this.#e.voiceState===`ai`&&(this.#t.onVoice(`user`),this.#r.setSource(`mic`)),this.#te(!1))},120)}#J(){return this.#y&&performance.now()<this.#y?!0:!!(this.#p&&this.#h>this.#p.currentTime+.02)}#Y(){for(let e of this.#g)try{e.stop()}catch{}this.#g.clear(),this.#_&&=(window.clearInterval(this.#_),0),this.#p&&(this.#h=this.#p.currentTime),this.#y=0}#X(){if(this.#Y(),this.#p){try{this.#p.close()}catch{}this.#p=null,this.#m=null,this.#h=0}this.#r.attach(`bus`,null)}#Z(){this.#Q(),this.#N=``,this.#P=!0,this.#F=!1,this.#I=null}#Q(){this.#L&&=(window.clearInterval(this.#L),0)}#$(){if(!this.#P||!this.#N||!this.#F||this.#I==null||!this.#p)return;let e=Math.max(0,this.#p.currentTime-this.#I),t=this.#N.slice(0,Math.min(this.#N.length,Math.floor(e*6.5)));t&&(this.#z||=(this.#e.startStream(),!0),this.#e.setAssistantLive(t))}#ee(e){this.#N+=e,this.#P?(this.#L||=window.setInterval(()=>this.#$(),60),this.#$()):(this.#e.appendStream(e),this.#z=!0)}#te(e){this.#Q(),(this.#z||this.#P&&this.#N)&&(this.#P&&this.#N&&!e&&this.#e.setAssistantLive(this.#N),this.#e.endStream()),this.#z=!1,this.#P=!1,this.#F=!1,this.#I=null,this.#N=``}#ne(){let e=0,t=()=>{++e>120||!this.#J()?this.#te(!1):window.setTimeout(t,50)};window.setTimeout(t,50)}#re(e,t){e?(this.#z&&this.#te(!0),this.#e.discardLive(),this.#e.setThinking(!1),this.#e.setListening(!0),this.#t.onVoice(`user`),this.#r.setSource(`mic`),this.#ie=!1,this.#ae=t,window.setTimeout(()=>{this.#ce(t)},4e3)):(this.#e.setListening(!1),this.#e.setThinking(!0),this.inCall&&this.#e.voiceState!==`thinking`&&this.#t.onVoice(`thinking`))}#ie=!1;#ae;#oe;#se(e,t,n){n&&t&&t===this.#oe||(this.#ie=!0,this.#ae=t,this.#e.setListening(!1),this.#e.beginLive(`user`),this.#e.setLive(e||`没听清`),n&&(this.#e.commitLive(e||`没听清`),this.#oe=t))}#ce(e){this.#ie||e!==this.#ae||(this.#e.setListening(!1),this.#e.commitLive(`没听清`),this.#oe=e)}#le(e,t){let n=C[e]||e;this.#e.addToolChip(e,t,n),this.#t.onVoice(`thinking`)}async#ue(e,t=this.#i,n=this.#R){let r=String(e.name||``),i=e.call_id||null,a={};try{a=JSON.parse(String(e.arguments||`{}`))}catch{}this.#z&&this.#te(!1);let o=``,s=!0;try{o=await je(r,a,{tool:()=>{De.has(r)&&this.#n.tool()}})}catch(e){o=`（查询失败，请稍后再问一次）`,s=!1,this.#t.onError(`工具失败：${String(e?.message||e)}`)}(o.startsWith(`（查询失败`)||o.startsWith(`（没有名为`))&&(s=!1),this.#e.finishToolChip(r,s,i,C[r]||r),this.#e.pulse(s?.45:.3),t&&t.readyState===1&&(t.send(JSON.stringify({type:`conversation.item.create`,item:{type:`function_call_output`,call_id:i,output:o}})),n.pending=!0,n.pendingGen=n.gen,this.#de(t,n))}#de(e=this.#i,t=this.#R){t.pending&&(t.pendingGen===t.gen?t.responseOpen||(t.pending=!1,e&&e.readyState===1&&(e.send(JSON.stringify({type:`response.create`})),t.responseOpen=!0)):t.pending=!1)}#fe(){let e=this.#f?{deviceId:{exact:this.#f}}:{},t=[];return t.push({...e,channelCount:1}),this.#T&&t.push({...e,channelCount:1,echoCancellation:!0,noiseSuppression:!0,autoGainControl:!0}),this.#T&&t.push({...e,echoCancellation:!0,noiseSuppression:!0}),this.#f&&t.push({deviceId:{exact:this.#f}}),[...t.map(e=>({audio:e,video:!1})),{audio:!0,video:!1}]}async#pe(){if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){let e=Error(`当前浏览器/上下文不支持 getUserMedia`);throw e.name=window.isSecureContext?`NotReadableError`:`SecurityError`,e}let e=this.#fe(),t=null;for(let n=0;n<e.length;n++)try{return await navigator.mediaDevices.getUserMedia(e[n])}catch(e){t=e;let n=e.name;if(n===`NotAllowedError`||n===`PermissionDeniedError`||n===`NotFoundError`||n===`DevicesNotFoundError`)throw e;await new Promise(e=>window.setTimeout(e,220))}throw t||Error(`未知原因`)}#me(){let e=window.AudioContext||window.webkitAudioContext;try{return new e({sampleRate:w})}catch{return new e}}async startMic(){if(this.#o)return;let e=this.#D,t;try{t=await this.#pe()}catch(t){if(e!==this.#D)return;let n=t.name||`MicError`;this.#t.onError(`麦克风不可用【${n}】：${t.message||t}`),this.#n.error(),this.stopVoice();return}if(e!==this.#D||!this.inCall)t.getTracks().forEach(e=>e.stop());else try{this.#s=t;let e=this.#me();this.#c=e,e.state===`suspended`&&await e.resume();let n=e.createMediaStreamSource(t);this.#u=n,this.#x=[],this.#S=0,this.#ve(),this.#o=!0;let r=e.createAnalyser();r.fftSize=1024,r.smoothingTimeConstant=.6,n.connect(r),this.#r.attach(`mic`,{analyser:r,ctx:e}),this.#r.setSource(this.#e.voiceState===`ai`?`bus`:`mic`),this.#r.start(),await this.#he(e,n),this.#t.onState(`已连接`,`ok`),t.getAudioTracks()[0]&&this.#e.voiceState!==`ai`&&this.#t.onVoice(`user`)}catch(e){this.stopMic(),this.#t.onError(`音频初始化失败：${e.message||e}`),this.#n.error()}}async#he(e,t){let n=Math.max(1600,Math.round(e.sampleRate*.1));if(e.audioWorklet&&typeof AudioWorkletNode<`u`)try{await e.audioWorklet.addModule(`mic-capture-worklet.js`);let r=new AudioWorkletNode(e,`pet-mic-capture`,{numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[1],processorOptions:{chunkSamples:n}});r.port.onmessage=t=>{let n=t.data;n&&n.type===`chunk`&&n.samples&&this.#ge(n.samples,e.sampleRate)};let i=e.createGain();i.gain.value=0,t.connect(r),r.connect(i),i.connect(e.destination),this.#l=r,this.#d=i,r.port.postMessage({command:`start`});return}catch{}let r=e.createScriptProcessor(4096,1,1);r.onaudioprocess=t=>{this.#o&&this.#ge(t.inputBuffer.getChannelData(0),e.sampleRate)};let i=e.createGain();i.gain.value=0,t.connect(r),r.connect(i),i.connect(e.destination),this.#l=r,this.#d=i}#ge(e,t){if(!this.#o)return;let n=t===w?e:Re(e,t,w);if(n.length){if(this.#x.push(n),this.#S+=n.length,this.#J())this.#V||=(this.#ve(),!0);else{this.#V&&=!1;try{this.#ye(n)}catch{}}this.#S>=Math.round(w*this.#E/1e3)&&this.#_e()}}#_e(){if(!this.#i||this.#i.readyState!==1||!this.#C){this.#x=[],this.#S=0;return}let e=new Float32Array(this.#S),t=0;for(let n of this.#x)e.set(n,t),t+=n.length;this.#x=[],this.#S=0;let n=x.upGate===!0&&this.#J()?new Float32Array(e.length):e;try{this.#i.send(JSON.stringify({type:`input_audio_buffer.append`,audio:A(n)}))}catch{}}stopMic(){this.#o=!1;let e=this.#l;if(e){if(`port`in e)try{e.port.postMessage({command:`stop`}),e.port.onmessage=null}catch{}try{e.onaudioprocess=null}catch{}try{e.disconnect()}catch{}this.#l=null}if(this.#d){try{this.#d.disconnect()}catch{}this.#d=null}if(this.#u){try{this.#u.disconnect()}catch{}this.#u=null}this.#c&&=(this.#c.close().catch(()=>{}),null),this.#s&&=(this.#s.getTracks().forEach(e=>e.stop()),null),this.#r.attach(`mic`,null),this.#r.stop(),this.#x=[],this.#S=0,this.#ve()}#ve(){this.#B={noise:.004,active:!1,voiceRun:0,lastVoice:0,len:0,frames:0,pre:[],preLen:0}}#ye(e){if(!this.#C||!this.#o)return;let t=ze(e),n=performance.now();this.#B.active||(this.#B.noise=this.#B.noise*.94+t*.06);let r=t>Math.max(.016,Math.min(this.#B.noise*3,.09));!this.#B.active&&(r?(this.#B.voiceRun++,this.#B.voiceRun>=3&&(this.#B.active=!0,this.#B.voiceRun=0,this.#B.len=0,this.#B.frames=0,this.#B.lastVoice=n,this.#e.voiceState!==`user`&&this.#t.onVoice(`user`))):this.#B.voiceRun=0,!this.#B.active)||(this.#B.len+=e.length,this.#B.frames++,r&&(this.#B.lastVoice=n),(n-this.#B.lastVoice>800||this.#B.len/w>=30)&&this.#ve())}async askText(e){let t=this.#j.then(()=>this.#be(e));return this.#j=t.catch(()=>{}),t}async#be(e){this.#z&&this.#te(!0);let t=this.inCall;if(t&&(this.#R.responseOpen||this.#J())){if(this.#Y(),this.#te(!0),this.#R.responseOpen&&this.#i?.readyState===1)try{this.#i.send(JSON.stringify({type:`response.cancel`}))}catch{}this.#R.responseOpen=!1}t||this.#t.onVoice(`thinking`),this.#e.setThinking(!0),this.#A=!0;let n=this.#D;try{await this.#xe(async n=>{if(this.#a!==n||n.readyState!==1)throw Error(`text_ws_closed`);this.#M||=(n.send(JSON.stringify({type:`session.update`,session:{modalities:[`text`,`audio`],voice:`longanqian`,instructions:k,tools:S,turn_detection:null}})),!0);let r={responseOpen:!1,pending:!1,gen:0,pendingGen:-1},i=``,a=null,o=!1;await new Promise((s,c)=>{let l=!1,u=()=>{l||(l=!0,d(),c(Error(`text_ws_closed`)))},d=()=>{n.removeEventListener(`message`,m),n.removeEventListener(`close`,u)},f=()=>{l||(l=!0,d(),s())},p=e=>{l||(l=!0,d(),c(e))},m=e=>{let s;try{s=JSON.parse(e.data)}catch{return}let c=String(s.type||``);switch(c){case`response.created`:r.responseOpen=!0,o=!0,this.#e.setThinking(!1),!t&&this.#e.voiceState!==`ai`&&this.#t.onVoice(`thinking`);break;case`response.audio_transcript.delta`:case`response.text.delta`:case`response.audio_transcript.done`:case`response.text.done`:if(c.endsWith(`.delta`)?i+=String(s.delta||``):i||=String(s.transcript||s.text||``),!i)break;this.#e.setThinking(!1),this.#z||=(this.#e.startStream(),!0),this.#e.setAssistantLive(i),!t&&this.#e.voiceState!==`ai`&&this.#t.onVoice(`ai`);break;case`response.output_item.added`:{let e=s.item||{};e.type===`function_call`&&e.name&&this.#le(e.name,e.call_id??null);break}case`response.function_call_arguments.done`:a=this.#ue(s,n,r),a.catch(()=>{});break;case`response.done`:{if(r.responseOpen=!1,String(s.response?.status||``)===`failed`){p(Error(`本轮生成失败`));return}let e=a;if(a=null,e){e.then(()=>{l||(!r.responseOpen&&n.readyState===1?(r.responseOpen=!0,n.send(JSON.stringify({type:`response.create`}))):r.responseOpen||f())}).catch(()=>f());return}f();break}case`error`:p(Error(String(s.error?.message||`api_error`)))}};n.addEventListener(`message`,m),n.addEventListener(`close`,u),n.send(JSON.stringify({type:`conversation.item.create`,item:{type:`message`,role:`user`,content:[{type:`input_text`,text:e}]}})),n.send(JSON.stringify({type:`response.create`})),r.responseOpen=!0,window.setTimeout(()=>{!o&&!l&&p(Error(`timeout`))},3e4)})})}catch(e){let t=e.message||String(e);t!==`text_ws_closed`&&this.#t.onError(`文字链路失败：${t}`)}finally{this.#A=!1,this.#e.setThinking(!1),n===this.#D&&(t?this.inCall&&!this.#J()&&this.#e.voiceState!==`user`&&this.#t.onVoice(`user`):this.#t.onVoice(`idle`)),this.#te(!1)}}async#xe(e){if(this.#a&&this.#a.readyState===1)return e(this.#a);if(this.#a)try{this.#a.close()}catch{}let t=new WebSocket(O(`text`));this.#a=t,this.#M=!1,await new Promise((e,n)=>{t.onopen=()=>e(),t.onerror=()=>n(Error(`text_ws_error`))});try{return await e(t)}catch(e){try{t.close()}catch{}throw this.#a===t&&(this.#a=null),e}}#Se=null;#Ce=[];#we=0;#Te=0;#Ee=x.log;setLogEnabled(e){this.#Ee=e}log(e,t,n=`info`){if(!this.#Ee)return;let r={seq:++this.#Te,t:Date.now(),iso:new Date().toISOString(),evt:e,level:n,data:t??null};this.#Ce.push(r),this.#we||=window.setTimeout(()=>this.flushLog(),1200)}#De(){if(!(this.#Se&&this.#Se.readyState<=1))try{let e=new WebSocket(O(`log`));this.#Se=e,e.onopen=()=>this.flushLog(),e.onclose=()=>{this.#Se=null},e.onerror=()=>{}}catch{}}flushLog(){if(this.#we=0,!this.#Ce.length)return;if(!this.#Se||this.#Se.readyState!==1){this.#De();return}let e=this.#Ce.splice(0);try{this.#Se.send(JSON.stringify(e))}catch{this.#Ce=e.concat(this.#Ce)}}dispose(){this.#a=null,this.#Ee=!1,this.#r.stop()}},j=`ai-orb/voice`,Ve=`ai-orb/sync`,He=2e3,Ue=6e3,We=class{#e;#t=`solo`;#n=!1;#r=null;#i=null;#a=null;#o=0;#s=null;#c=!1;constructor(e){this.#e=e}get role(){return this.#t}get isLeader(){return this.#n}listen(){this.#l()}async acquire(){if(this.#l(),this.#n)return!0;if(!this.#i){let e=await this.#p();return this.#f(e),e}let e=this.#i;return new Promise(t=>{e.request(j,{ifAvailable:!0},e=>e?(this.#f(!0),t(!0),new Promise(e=>{this.#s=e,this.#a=()=>e()})):(t(!1),Promise.resolve())).catch(()=>t(!1))})}release(){if(!this.#n)return;let e=this.#a;this.#a=null,this.#s=null,this.#f(!1),e?.(),this.#u({kind:`release`}),this.#o&&=(window.clearInterval(this.#o),0);try{this.#t!==`solo`&&localStorage.removeItem(`${j}/heartbeat`)}catch{}}async requestTakeover(){this.#l(),this.#u({kind:`takeover`});for(let e=0;e<12;e++)if(await new Promise(e=>window.setTimeout(e,120)),await this.acquire())return!0;return!1}post(e){this.#n&&this.#u(e)}postAsAny(e){this.#u(e)}dispose(){this.release(),this.#r?.close(),this.#r=null}#l(){if(this.#c)return;if(this.#c=!0,typeof BroadcastChannel<`u`)try{let e=new BroadcastChannel(Ve);e.onmessage=e=>this.#d(e.data),this.#r=e}catch{}let e=navigator.locks;this.#i=e??null,e?this.#t=`follower`:(this.#t=`solo`,this.#e.onRole(`solo`,!1))}#u(e){try{this.#r?.postMessage(e)}catch{}}#d(e){e&&typeof e==`object`&&(e.kind===`takeover`?this.#n&&(this.release(),this.#e.onTakeoverRequested()):(e.kind,this.#e.onSync(e)))}#f(e){this.#n=e;let t=this.#i?e?`leader`:`follower`:`solo`;this.#t=t,this.#e.onRole(t,e)}async#p(){let e=`${j}/heartbeat`,t=0;try{t=Number(localStorage.getItem(e)||0)}catch{t=0}if(Date.now()-t<Ue)return this.#t=`follower`,!1;let n=()=>{try{localStorage.setItem(e,String(Date.now()))}catch{}};return n(),this.#o=window.setInterval(n,He),window.addEventListener(`pagehide`,()=>{if(this.#n)try{localStorage.removeItem(e)}catch{}},{once:!0}),!0}},M=document.querySelector(`ai-orb-chat`);if(!M)throw Error(`[app] <ai-orb-chat> not found`);M.setOptions({orb:x.orb,orbPreset:x.orbPreset,theme:x.theme,auraMode:x.auraMode});var N=`solo`,P=new We({onRole:e=>{N=e,L(e)},onSync:e=>Ge(e),onTakeoverRequested:()=>{R.stopVoice(),F=!0;try{M.deactivate()}finally{F=!1}M.addMessage(`system`,`另一个标签页接管了语音会话。`)}});P.listen();var F=!1;function Ge(e){F=!0;try{switch(e.kind){case`phase`:e.phase===`active`?(N!==`leader`&&M.setAttribute(`data-follower`,``),M.activateSilent()):N!==`leader`&&M.deactivate();break;case`voice`:M.setVoiceState(e.state),W(e.state);break;case`message`:M.addMessage(e.role,e.content,e.msgKind);break;case`clear`:M.clearMessages()}}finally{F=!1}}var I=!1;function L(e,t=!1){I=t;let n=document.getElementById(`followerBanner`);n&&(n.hidden=!(e===`follower`&&I)),e===`follower`?M.setAttribute(`data-follower`,``):e===`leader`&&M.removeAttribute(`data-follower`)}var R=new Be(M,{onState:(e,t)=>U(e,t),onError:e=>{M.addMessage(`system`,e,`err`),R.log(`app_error`,{text:e},`err`)},onVoice:e=>{M.setVoiceState(e),W(e),P.post({kind:`voice`,state:e})}});M.addEventListener(`orb:phase`,(e=>{document.documentElement.dataset.orbActive=e.detail.phase===`active`?`1`:`0`,!F&&(e.detail.phase===`active`?e.detail.voice===!1?P.post({kind:`phase`,phase:`active`}):Ke():(R.stopVoice(),P.release(),P.postAsAny({kind:`phase`,phase:`idle`}),M.clearInput(),W(`idle`)))})),M.addEventListener(`orb:takeover`,()=>{Q()});async function Ke(){await P.acquire()?(P.post({kind:`phase`,phase:`active`}),R.startVoice()):(L(`follower`,!0),U(`语音由另一个标签页占用`,`info`))}M.addEventListener(`orb:submit`,(e=>{let t=e.detail.text;R.log(`user_text`,{text:t}),N===`follower`&&M.activateSilent(),M.phase===`active`||M.activateSilent(),R.askText(t)})),M.addEventListener(`orb:interrupt`,()=>{R.interrupt()&&R.log(`user_interrupt`,{})}),R.log(`app_start`,{orb:x.orb,preset:x.orbPreset,ua:navigator.userAgent});var z=document.getElementById(`connText`),B=document.getElementById(`voiceBadge`),V=document.getElementById(`callTimer`),H=document.getElementById(`liveDot`);function U(e,t){z&&(z.textContent=e),H&&H.classList.toggle(`on`,t===`ok`||(R?.inCall??!1))}var qe={idle:`待机`,thinking:`思考中`,user:`聆听中`,ai:`说话中`};function W(e){B&&(B.textContent=qe[e],B.dataset.voice=e)}var G=0;function Je(e){let t=Math.max(0,Math.floor(e/1e3));return`${String(Math.floor(t/60)).padStart(2,`0`)}:${String(t%60).padStart(2,`0`)}`}setInterval(()=>{V&&(R.inCall?(G||=Date.now(),V.textContent=`通话 ${Je(Date.now()-G)}`,V.hidden=!1):(G=0,V.hidden=!0))},500);var K=document.getElementById(`settings`),q=document.getElementById(`gear`);function J(e){K?.classList.toggle(`open`,e),document.documentElement.dataset.panelOpen=e?`1`:`0`}q?.addEventListener(`click`,e=>{e.stopPropagation(),J(!K?.classList.contains(`open`))}),document.getElementById(`settingsClose`)?.addEventListener(`click`,()=>J(!1)),document.addEventListener(`keydown`,e=>{e.key===`Escape`&&K?.classList.contains(`open`)&&J(!1)}),document.addEventListener(`pointerdown`,e=>{if(!K?.classList.contains(`open`))return;let t=e.target;K.contains(t)||q?.contains(t)||J(!1)});var Y=document.getElementById(`micSel`);async function X(){if(!Y)return;let e=[];try{e=(await navigator.mediaDevices.enumerateDevices()).filter(e=>e.kind===`audioinput`)}catch{e=[]}Y.innerHTML=``;let t=document.createElement(`option`);t.value=``,t.textContent=e.length?`系统默认（共 ${e.length} 个输入设备）`:`系统默认（未发现设备）`,Y.appendChild(t),e.forEach((e,t)=>{let n=document.createElement(`option`);n.value=e.deviceId,n.textContent=e.label||`麦克风 ${t+1}`,Y.appendChild(n)}),Y.value=R.micDeviceId&&e.some(e=>e.deviceId===R.micDeviceId)?R.micDeviceId:``}Y?.addEventListener(`change`,()=>{R.setMicDevice(Y.value||null)}),X();function Z(e,t,n){let r=document.getElementById(e);if(!r)return;let i=t,a=()=>{r.textContent=i?`开`:`关`,r.classList.toggle(`on`,i)};a(),r.addEventListener(`click`,()=>{i=!i,a(),n(i)})}Z(`tgAec`,x.aec,e=>{R.setAec(e)}),Z(`tgUpGate`,x.upGate,e=>{R.setUpGate(e)}),Z(`tgLog`,x.log,e=>{R.setLogEnabled(e)}),Z(`tgParticles`,M.options.particlesEnabled,e=>{M.setOptions({particlesEnabled:e})}),document.getElementById(`btnMicTest`)?.addEventListener(`click`,async()=>{let e=[];try{let t=(await navigator.mediaDevices.enumerateDevices()).filter(e=>e.kind===`audioinput`);e.push(`发现 ${t.length} 个输入设备`)}catch{e.push(`设备枚举失败`)}e.push(`安全上下文：${window.isSecureContext?`是`:`否`}`),e.push(`嵌入框架：${window.self===window.top?`否`:`是 ⚠`}`);try{let t=await navigator.mediaDevices.getUserMedia({audio:!0}),n=t.getAudioTracks()[0],r=n&&n.getSettings?n.getSettings():{};M.addMessage(`system`,`麦克风自检 ✓ 打开成功\n设备：${n?.label||`(无标签)`} · ${r.sampleRate||`?`}Hz\n${e.join(`；`)}`),t.getTracks().forEach(e=>e.stop()),X()}catch(t){M.addMessage(`system`,`麦克风自检 ✗ ${t.name}：${t.message||t}\n（${e.join(`；`)}）`,`err`)}}),document.getElementById(`btnLogDump`)?.addEventListener(`click`,()=>{R.flushLog(),M.addMessage(`system`,`日志已推送到服务端 logs/ 目录。`)}),document.getElementById(`btnCall`)?.addEventListener(`click`,()=>{M.phase===`idle`?M.activate():R.inCall?R.stopVoice():R.startVoice()}),(function(){let e=[];if(window.self!==window.top&&e.push(`页面被嵌在 iframe / 预览面板里`),location.protocol!==`https:`&&location.hostname!==`127.0.0.1`&&location.hostname!==`localhost`&&e.push(`当前地址是 ${location.host}（非 127.0.0.1 / localhost，也不是 https）`),!e.length)return;let t=document.getElementById(`envWarn`);t&&(t.hidden=!1,t.textContent=`⚠ 检测到可疑环境：${e.join(`；`)}。麦克风很可能拿不到，请用 Chrome / Edge 打开 http://127.0.0.1:8770。`)})();async function Q(){U(`正在接管…`,`info`),await P.requestTakeover()?(I=!1,L(`leader`),M.phase===`active`?R.startVoice():M.activate()):U(`接管失败：另一个页面仍在会话中`,`err`)}document.getElementById(`btnTakeover`)?.addEventListener(`click`,()=>{Q()}),document.getElementById(`followerDismiss`)?.addEventListener(`click`,()=>{let e=document.getElementById(`followerBanner`);e&&(e.hidden=!0)});function $(e){document.documentElement.dataset.theme=e,M.setOptions({theme:e});try{localStorage.setItem(`pet-web-theme`,e)}catch{}}$(localStorage.getItem(`pet-web-theme`)||x.theme),document.getElementById(`tgTheme`)?.addEventListener(`click`,()=>{$(document.documentElement.dataset.theme===`light`?`dark`:`light`)});