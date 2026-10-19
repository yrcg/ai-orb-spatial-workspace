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
:host([data-chat-mode='compact']) .streamInner[data-empty='1'] .empty { color: var(--orb-text-dim); }
/* 空间模式里环境本身就有内容，空场提示只会变成噪点 */
:host([data-chat-spatial='1']) .empty { display: none; }
:host([data-chat-mode='compact']) .streamInner[data-empty='1'] .empty,
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
`,n=class{#e;#t;#n;#r;#i;#a;#o;#s=[];#c=null;#l=null;#u=null;#d=[];#f=0;#p=!1;#m;#h=!0;#g=[];#_=null;#v=null;#y=null;#b=!1;#x=!1;#S=0;#C=!1;#w=0;constructor(e,n,r){this.#e=e,this.#t=n,this.#m=r;let i=document.createElement(`div`);i.innerHTML=t,this.#n=i.querySelector(`.stream`),this.#r=i.querySelector(`.streamInner`),this.#i=i.querySelector(`.composer`),this.#a=i.querySelector(`textarea`),this.#o=i.querySelector(`.send`);for(let t of Array.from(i.children))e.append(t);this.#n.addEventListener(`scroll`,this.#L,{passive:!0}),this.#a.addEventListener(`input`,this.#B),this.#a.addEventListener(`keydown`,this.#V),this.#o.addEventListener(`click`,this.#H),this.#i.addEventListener(`click`,e=>{let t=e.target;t&&t.closest&&t.closest(`.send`)||this.focusInput()}),this.#D()}get messages(){return this.#s.map(e=>({...e}))}setOptions(e){this.#m=e,this.#t.style.setProperty(`--chat-width`,`${e.chatMaxWidth}px`),this.#t.style.setProperty(`--chat-fade`,`${Math.round(e.chatFade*100)}%`)}layout(e,t,n){this.#T(),this.#n.style.top=`${Math.round(e)}px`,this.#n.style.height=`${Math.max(0,Math.round(t))}px`,this.#i.style.top=`${Math.round(n)}px`}layoutSpatial(e){this.#t.dataset.chatSpatial=`1`,this.#t.dataset.chatMode=e.mode,this.#n.style.left=`${Math.round(e.x)}px`,this.#n.style.top=`${Math.round(e.y)}px`,this.#n.style.width=`${Math.round(e.w)}px`,this.#n.style.height=`${Math.max(0,Math.round(e.h))}px`,this.#n.style.transform=`none`,this.#n.style.maxWidth=`none`,this.#i.style.left=`${Math.round(e.composerX)}px`,this.#i.style.top=`${Math.round(e.composerY)}px`,this.#i.style.width=`${Math.round(e.composerW)}px`,this.#i.style.transform=`none`,this.#i.style.maxWidth=`none`}#T(){delete this.#t.dataset.chatSpatial,delete this.#t.dataset.chatMode;for(let e of[`left`,`top`,`width`,`height`,`transform`,`max-width`])this.#n.style.removeProperty(e),this.#i.style.removeProperty(e)}focusInput(){this.#a.focus()}addMessage(e,t,n){this.#R(),this.#N();let r=this.#I(e,t,n);return this.#s.push({role:e,content:t}),this.#z(),r}addMessages(e){this.#R(),this.#N();for(let t of e)this.#I(t.role,t.content),this.#s.push({...t});this.#z()}clearMessages(){this.#N(),this.#s.length=0,this.#r.replaceChildren(),this.#g=[],this.#_=null,this.#v=null,this.#y=null,this.#b=!1,this.#x=!1,this.#k=null,this.#A=null,this.#h=!0,this.#D()}addToolChip(e,t,n){this.#R();let r=document.createElement(`div`);r.className=`msg`,r.dataset.role=`tool`;let i=document.createElement(`span`);i.className=`tool-inline`;let a=document.createElement(`span`);a.className=`tspin`;let o=document.createElement(`span`);o.className=`tlabel`,o.textContent=`正在${n}…`,i.append(a,o),r.append(i),this.#E(r);let s={role:`tool`,content:`正在${n}…`};this.#s.push(s),this.#g.push({callId:t,el:i,msg:s}),this.#z()}finishToolChip(e,t,n,r){let i=-1;if(n&&(i=this.#g.findIndex(e=>e.callId===n)),i<0&&(i=this.#g.findIndex(e=>!e.el.classList.contains(`done`)&&!e.el.classList.contains(`fail`))),i>=0){let{el:e,msg:n}=this.#g.splice(i,1)[0];e.classList.add(t?`done`:`fail`);let a=`${r}${t?` 完成`:` 失败`}`,o=e.querySelector(`.tlabel`);o&&(o.textContent=a),n.content=a}}startStream(){this.#R(),this.#N();let e=document.createElement(`div`);e.className=`msg`,e.dataset.role=`assistant`;let t=document.createElement(`div`);t.className=`text`;let n=document.createElement(`i`);n.className=`cursor`,t.append(n),e.append(t),this.#E(e),this.#c=e,this.#l=t,this.#u=n,this.#s.push({role:`assistant`,content:``}),this.#z()}appendStream(e){this.#l||this.startStream();for(let t of e)this.#d.push(t);this.#p||this.#P()}endStream(){this.#l&&this.#d.length&&(this.#d.splice(0).forEach(e=>this.#l.append(e)),this.#f=0),this.#F(),this.#N()}get streamingTextEl(){return this.#l}setThinking(e){if(e!==this.#b){if(this.#b=e,e){if(this.#O(),!this.#_){let e=document.createElement(`div`);e.className=`thinking`,e.setAttribute(`aria-label`,`正在思考`),e.append(document.createElement(`i`),document.createElement(`i`),document.createElement(`i`)),this.#_=e,this.#r.append(e),this.#z()}}else this.#_&&(this.#_.remove(),this.#_=null,this.#D())}}setListening(e){if(e!==this.#x){if(this.#x=e,e){if(this.#O(),!this.#v){let e=document.createElement(`div`);e.className=`listening`,e.setAttribute(`aria-label`,`正在聆听`);for(let t=0;t<5;t++)e.append(document.createElement(`i`));this.#v=e,this.#r.append(e),this.#z()}}else this.#v&&(this.#v.remove(),this.#v=null,this.#D())}}#E(e){this.#O(),this.#_?this.#r.insertBefore(e,this.#_):this.#v?this.#r.insertBefore(e,this.#v):this.#r.append(e)}#D(){if(this.#s.length||(this.#r.dataset.empty=`1`,this.#y||this.#b||this.#x))return;let e=document.createElement(`div`);e.className=`empty`,e.textContent=`直接说话就行，也可以打字。`,this.#y=e,this.#_?this.#r.insertBefore(e,this.#_):this.#r.append(e)}#O(){this.#r.dataset.empty=`0`,this.#y&&=(this.#y.remove(),null)}snapToBottom(){this.#h=!0,this.#D(),this.#z(!0)}#k=null;#A=null;#j=`user`;beginLive(e,t){this.#k&&this.#j===e||(this.#R(),this.#M(),this.#N(),this.#k=this.#I(e,``,t),this.#A=this.#k.querySelector(`.text`),this.#j=e,this.#z())}setLive(e){this.#A&&(this.#A.textContent=e,this.#z())}commitLive(e){this.#k&&(this.setLive(e),this.#s.push({role:this.#j,content:e}),this.#M())}discardLive(){this.#k&&this.#k.remove(),this.#k=null,this.#A=null,this.#j=`user`}#M(){this.#k&&!this.#k.textContent?.trim()&&this.#k.remove(),this.#k=null,this.#A=null,this.#j=`user`}setAssistantLive(e){this.#l||this.startStream();let t=this.#l;t.textContent=e,this.#u&&t.append(this.#u),this.#F(),this.#z()}#N(){this.#d.length=0,this.#p=!1,this.#f=0,this.#u?.remove(),this.#u=null,this.#c=null,this.#l=null}async#P(){this.#p=!0;let e=Math.max(1,this.#m.streamCps),t=performance.now();await new Promise(n=>{let r=i=>{if(!this.#l){n();return}this.#f+=(i-t)/1e3*e,t=i;let a=Math.floor(this.#f);for(;a-->0&&this.#d.length;)--this.#f,this.#l.insertBefore(document.createTextNode(this.#d.shift()),this.#u);this.#z(),this.#d.length?requestAnimationFrame(r):n()};requestAnimationFrame(r)}),this.#p=!1,this.#F()}#F(){if(!this.#l)return;let e=this.#l.textContent??``,t=this.#s[this.#s.length-1];t&&t.role===`assistant`&&(t.content=e)}#I(e,t,n){let r=document.createElement(`div`);r.className=`msg`,r.dataset.role=e,n&&(r.dataset.kind=n);let i=document.createElement(`div`);return i.className=`text`,i.textContent=t,r.append(i),this.#E(r),r}#L=()=>{this.#R()};#R(){let e=this.#n;this.#h=e.scrollHeight-e.scrollTop-e.clientHeight<24}#z(e=!1){if(!this.#h&&!e)return;if(e){this.#S=0,this.#n.scrollTop=this.#n.scrollHeight,this.#w=performance.now();return}this.#C=!0;let t=performance.now(),n=Math.max(0,70-(t-this.#w));this.#S||=window.setTimeout(()=>{this.#S=0,this.#C&&(this.#C=!1,this.#w=performance.now(),this.#h&&(this.#n.scrollTop=this.#n.scrollHeight))},n)}#B=()=>{let e=this.#a.value;this.#o.dataset.ready=e.trim().length>0?`1`:`0`,this.#i.dataset.hasText=e.length>0?`1`:`0`,this.#a.style.height=`auto`,this.#a.style.height=`${Math.min(96,this.#a.scrollHeight)}px`};#V=e=>{e.isComposing||e.keyCode===229||e.key===`Enter`&&!e.shiftKey&&(e.preventDefault(),this.#U())};#H=()=>{this.#U()};#U(){let e=this.#a.value.trim();e&&(this.#a.value=``,this.#B(),this.addMessage(`user`,e),this.#e.dispatchEvent(new CustomEvent(`orb:submit`,{detail:{text:e},bubbles:!0,composed:!0})))}clearInput(){this.#a.value=``,this.#B()}get composerEl(){return this.#i}},r=new Map;function i(e,t){r.set(e,t)}function a(e){return r.get(e)??null}var o=.42,s=.09,c=.34,l=e=>e,u=e=>e*e,d=e=>1-(1-e)**2,f=e=>1+2.70158*(e-1)**3+1.70158*(e-1)**2;function p(e){let t=/rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(e);if(!t)return null;let[n,r,i]=[Number(t[1]),Number(t[2]),Number(t[3])].map(e=>{let t=e/255;return t<=.03928?t/12.92:((t+.055)/1.055)**2.4});return .2126*n+.7152*r+.0722*i}function m(){let e=[document.body,document.documentElement],t=document.querySelector(`ai-orb-chat`)?.parentElement;t&&e.unshift(t);for(let t of e){if(!t)continue;let e=getComputedStyle(t).backgroundColor;if(!e||e===`transparent`||/rgba?\([^)]*,\s*0(\.0*)?\)$/.test(e))continue;let n=p(e);if(n!=null)return n>.55?`light`:`dark`}return window.matchMedia?.(`(prefers-color-scheme: dark)`).matches?`dark`:`light`}var h=`
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
  /* 层级：遮罩(0) < 粒子/舞台(1-2) < 光晕(3) < 球(4) < 对话(6) */
  z-index: 4;
  /* canvas 带 tabindex="0"，键盘聚焦时浏览器会画一圈 auto 的**方形**焦点框，
     落在圆形球外围非常突兀。这里清掉，改用贴合球体轮廓的圆形微光
     （drop-shadow 走 canvas 的 alpha 通道，形状跟着球而不是画布方块）。 */
  outline: none;
  border: 0;
}
.canvas:focus,
.canvas:focus-visible { outline: none; border: 0; }
.canvas:focus-visible { filter: drop-shadow(0 0 14px rgba(38, 112, 214, 0.5)); }
:host([data-phase='active']) .canvas { cursor: default; }
.particles {
  position: absolute;
  inset: 0;
  z-index: 1;
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
  z-index: 3;
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
  z-index: 0;
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
  z-index: 5;
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
  z-index: 5;
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
  z-index: 3;
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
  z-index: 7;
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
<!-- 空间舞台插槽：放在遮罩之上、球与对话层之下。
     这样面板会被"浮起"而不是被遮罩糊掉，同时球和字幕仍然在面板之上。 -->
<slot name="stage"></slot>
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
`,g=class extends HTMLElement{static get observedAttributes(){return[`dock-size`,`dock-margin-x`,`dock-margin-y`,`background-opacity`,`overlay-blur`,`glow-intensity`,`breathing-amplitude`,`motion-speed`,`zoom`,`glass-opacity`,`chat-enabled`,`orb`,`orb-preset`,`particles-enabled`]}#e={...e};#t;#n;#r;#i;#a;#o;#s;#c;#l;#u=null;#d=null;#f=`idle`;#p=`idle`;#m=`light`;#h=.72;#g=0;#_=0;#v=[];#y=0;#b=0;#x=0;#S=!1;#C=1;#w=1;#T=480;#E=346;#D=.45;#O=0;#k=0;#A=0;#j=0;#M=168;#N=1;#P=0;#F=0;#I=null;#L=!1;#R=null;#z=0;#B={tx:0,ty:0,scale:1,radius:1,exposure:1,glow:0,overlay:0};#V=0;#H=0;#U=-1e9;#W=0;#G=[];#K={tx:0,ty:0,scale:1,radius:1,exposure:1,glow:0,overlay:0};#q=!0;#J=-1;#Y=0;#X=null;#Z=[];#Q=0;#$=0;#ee=new Float32Array(32);#te=null;#ne=0;constructor(){super(),this.dataset.phase=`idle`,this.dataset.voice=`idle`,this.#t=this.attachShadow({mode:`open`}),this.#t.innerHTML=h,this.#n=this.#t.querySelector(`.canvas`),this.#r=this.#t.querySelector(`.particles`),this.#i=this.#t.querySelector(`.aura`),this.#a=this.#t.querySelector(`.trail`),this.#o=this.#t.querySelector(`.shock`),this.#s=this.#t.querySelector(`.overlay`),this.#c=this.#t.querySelector(`.unsupported`),this.#l=this.#t.querySelector(`.close-hint`)}connectedCallback(){this.#le(),this.#Fe(),this.#Ie(),this.#n.addEventListener(`dblclick`,this.#pe),this.#n.addEventListener(`click`,this.#me),this.#n.addEventListener(`keydown`,this.#ge),this.#t.querySelector(`.close-hint`)?.addEventListener(`click`,this.#he),document.addEventListener(`keydown`,this.#_e),window.addEventListener(`resize`,this.#ve),window.addEventListener(`pointermove`,this.#ye,{passive:!0}),document.addEventListener(`visibilitychange`,this.#be),this.#Y=performance.now(),this.#ue()}disconnectedCallback(){this.#n.removeEventListener(`dblclick`,this.#pe),this.#n.removeEventListener(`click`,this.#me),this.#n.removeEventListener(`keydown`,this.#ge),this.#t.querySelector(`.close-hint`)?.removeEventListener(`click`,this.#he),document.removeEventListener(`keydown`,this.#_e),window.removeEventListener(`resize`,this.#ve),window.removeEventListener(`pointermove`,this.#ye),document.removeEventListener(`visibilitychange`,this.#be),this.#De(),window.clearTimeout(this.#_),this.#Be(),this.#u?.destroy(),this.#u=null}attributeChangedCallback(e,t,n){if(n==null)return;let r=()=>Number(n);switch(e){case`dock-size`:this.setOptions({dockOrbSize:r()});break;case`dock-margin-x`:this.setOptions({dockMarginX:r()});break;case`dock-margin-y`:this.setOptions({dockMarginY:r()});break;case`background-opacity`:this.setOptions({backgroundOpacity:r()});break;case`overlay-blur`:this.setOptions({overlayBlur:r()});break;case`glow-intensity`:this.setOptions({glowIntensity:r()});break;case`breathing-amplitude`:this.setOptions({breathingAmplitude:r()});break;case`motion-speed`:this.setOptions({motionSpeed:r()});break;case`zoom`:this.setOptions({zoom:r()});break;case`glass-opacity`:this.setOptions({glassOpacity:r()});break;case`chat-enabled`:this.setOptions({chatEnabled:n!==`false`});break;case`orb`:this.setOptions({orb:n});break;case`orb-preset`:this.setOptions({orbPreset:n});break;case`particles-enabled`:this.setOptions({particlesEnabled:n!==`false`})}}get phase(){return this.#f}get voiceState(){return this.#p}get orb(){return this.#u}get options(){return{...this.#e}}get chat(){return this.#d}setSpatialPlan(e){let t=this.#I!==e;this.#I=e,this.#L=!0;try{this.#Fe()}finally{this.#L=!1}t&&this.#f===`active`&&!this.#R&&this.#re(240)}#re(e){this.#Ae([{t:e,...this.#Ce(),ease:d}])}setOptions(e){let t=this.#e.orb,n=this.#e.orbPreset;this.#e={...this.#e,...e},this.#Fe(),this.#Ie(),(e.orb!==void 0&&e.orb!==t||e.orbPreset!==void 0&&e.orbPreset!==n)&&this.reloadOrb()}async reloadOrb(){this.#Be(),this.#u?.destroy(),this.#u=null,this.#c.hidden=!0,this.#n.style.display=``,this.#R=null,this.#B=this.#Ce(),this.#Ne(this.#B),this.#Pe(this.#B.overlay),await this.#ue()}activate(){this.#ie(!0)}activateSilent(){this.#ie(!1)}#ie(e){this.#f===`active`?e&&this.#se():(this.#f=`active`,this.#se(),this.#we(),this.dispatchEvent(new CustomEvent(`orb:phase`,{detail:{phase:`active`,voice:e},bubbles:!0,composed:!0})))}deactivate(){this.#f!==`idle`&&(this.#f=`idle`,this.#se(),this.setVoiceState(`idle`),this.#Ee(),this.dispatchEvent(new CustomEvent(`orb:phase`,{detail:{phase:`idle`},bubbles:!0,composed:!0})))}toggle(){this.#f===`idle`?this.activate():this.deactivate()}setVoiceState(e){e!==`idle`&&this.#se(),this.#p=e,this.dataset.voice=e,this.#u?.setVisualState(this.#fe()),this.#d?.setThinking(e===`thinking`&&this.#f===`active`),e!==`user`&&this.#d?.setListening(!1),this.#ce(),this.dispatchEvent(new CustomEvent(`orb:voice`,{detail:{state:e},bubbles:!0,composed:!0}))}setAudioBands(e){this.#u?.setAudioBands(e);let t=e?.all??0,n=e?.high??0;this.#$=Math.min(1,Math.max(0,t*.82+n*.18))}setAudioSpectrum(e){if(!e){this.#ee.fill(0);return}let t=Math.min(this.#ee.length,e.length);for(let n=0;n<t;n++)this.#ee[n]=e[n]}notifyActivity(){this.#se()}pulse(e=1){this.#U=performance.now(),this.#W=Math.max(this.#W,Math.min(1.4,e)),this.#se(),this.#ae(.55*Math.min(1,e))}#ae(e=1){let t=this.#o;for(let e of this.#G)window.clearTimeout(e);this.#G=[];let n=this.#oe();t.style.transition=`none`,t.style.opacity=`0`,t.style.transform=`translate(var(--orb-tx), var(--orb-ty)) scale(${(n*.5).toFixed(3)})`,this.#G.push(window.setTimeout(()=>{t.style.transition=`opacity 620ms cubic-bezier(0.16, 0.84, 0.44, 1), transform 620ms cubic-bezier(0.16, 0.84, 0.44, 1)`,t.style.opacity=String(.55*e),t.style.transform=`translate(var(--orb-tx), var(--orb-ty)) scale(${(n*2.2).toFixed(3)})`,this.#G.push(window.setTimeout(()=>{t.style.opacity=`0`},520))},16))}#oe(){return Math.max(.4,this.#B.scale*(this.#E/40))}addMessage(e,t,n){this.#d?.addMessage(e,t,n)}addMessages(e){this.#d?.addMessages(e)}clearMessages(){this.#d?.clearMessages()}get messages(){return this.#d?.messages??[]}addToolChip(e,t,n){this.#d?.addToolChip(e,t,n)}finishToolChip(e,t,n,r){this.#d?.finishToolChip(e,t,n,r)}startStream(){this.#d?.startStream()}appendStream(e){this.#d?.appendStream(e)}endStream(){this.#d?.endStream()}setAssistantLive(e){this.#d?.setAssistantLive(e)}beginLive(e,t){this.#d?.beginLive(e,t)}setLive(e){this.#d?.setLive(e)}commitLive(e){this.#d?.commitLive(e)}discardLive(){this.#d?.discardLive()}setThinking(e){this.#d?.setThinking(e)}setListening(e){this.#d?.setListening(e)}clearInput(){this.#d?.clearInput()}#se(){this.#Y=performance.now()}#ce(){this.#f===`idle`?this.#n.setAttribute(`aria-label`,`双击唤起 AI 对话`):this.#n.setAttribute(`aria-label`,{idle:`AI 对话已展开，双击收起`,thinking:`AI 正在思考`,user:`正在聆听你说话`,ai:`AI 正在回答`}[this.#p])}#le(){!this.#e.chatEnabled||this.#d||(this.#d=new n(this.#t,this,this.#e),this.#d.setOptions(this.#e))}async#ue(){let e=a(this.#e.orb);if(!e){console.warn(`[ai-orb-chat] 未注册的渲染体：${this.#e.orb}`),this.#de();return}let t=e(this.#n,this.#e);this.#u=t,this.#h=t.radiusFactor??.72,await t.init()?(this.dataset.engine=`ready`,this.#Fe(),t.setVisualState(this.#fe()),this.#ze(),this.dispatchEvent(new CustomEvent(`orb:ready`,{bubbles:!0,composed:!0}))):(t.destroy(),this.#u=null,this.#de())}#de(){this.#c.hidden=!1,this.#n.style.display=`none`,this.dataset.engine=`unsupported`,this.#f=`active`,this.dataset.phase=`active`,this.#Re(`--orb-scale`,`0`)}#fe(){return this.#f===`idle`?`dock`:{idle:`active`,thinking:`thinking`,user:`listening`,ai:`speaking`}[this.#p]}#pe=()=>{this.hasAttribute(`data-follower`)?this.dispatchEvent(new CustomEvent(`orb:takeover`,{bubbles:!0,composed:!0})):this.toggle()};#me=()=>{this.#f===`active`&&this.dispatchEvent(new CustomEvent(`orb:interrupt`,{bubbles:!0,composed:!0}))};#he=()=>{this.deactivate()};#ge=e=>{(e.key===`Enter`||e.key===` `)&&(e.preventDefault(),this.toggle())};#_e=e=>{e.key===`Escape`&&document.documentElement.dataset.panelOpen!==`1`&&this.deactivate()};#ve=()=>{window.clearTimeout(this.#g),this.#g=window.setTimeout(()=>this.#Fe(),150)};#ye=e=>{if(this.#f===`active`){this.#H=0;return}let t=e.clientX-this.#A,n=e.clientY-this.#j,r=Math.hypot(t,n),i=Math.max(24,this.#M/2);this.#H=r<i*1.5?Math.min(1,Math.max(0,1-Math.max(0,r-i*.72)/(i*.78))):0};#be=()=>{document.hidden||(this.#x=performance.now())};#xe(){return{tx:this.#O,ty:this.#k,scale:this.#D}}#Se(){return{tx:this.#P,ty:this.#F,scale:this.#N}}#Ce(){return{...this.#f===`active`?this.#Se():this.#xe(),radius:1,exposure:1,glow:this.#ke(),overlay:+(this.#f===`active`)}}#we(){let e=this.#xe(),t=this.#Se(),n=e.scale*.16,r=this.#e,i=[{t:r.collapseMs,tx:e.tx,ty:e.ty,scale:n,radius:.25,exposure:2.4,glow:.55,overlay:.12,ease:u},{t:r.collapseMs+r.coreMs,tx:e.tx,ty:e.ty,scale:n*.92,radius:.2,exposure:3.1,glow:.95,overlay:.3,ease:d},{t:r.collapseMs+r.coreMs+r.trailMs,tx:t.tx,ty:t.ty,scale:Math.max(n*1.4,t.scale*.22),radius:.45,exposure:2.2,glow:.6,overlay:.62,ease:d},{t:r.collapseMs+r.coreMs+r.trailMs+r.expandMs,tx:t.tx,ty:t.ty,scale:t.scale,radius:1,exposure:1,glow:this.#ke(),overlay:1,ease:f}];this.#Ae(i,()=>{this.#f===`active`&&(this.#Te(),this.#u?.setVisualState(this.#fe()),this.dispatchEvent(new CustomEvent(`orb:settled`,{detail:{phase:`active`},bubbles:!0,composed:!0})))}),this.#Oe(r.collapseMs+r.coreMs,r.trailMs),window.setTimeout(()=>{this.#f===`active`&&this.#ae(1)},r.collapseMs+Math.round(r.coreMs*.5)),window.clearTimeout(this.#_),this.#_=window.setTimeout(()=>{this.#f===`active`&&this.#Te()},r.collapseMs+r.coreMs+r.trailMs)}#Te(){this.dataset.phase!==`active`&&(this.dataset.phase=`active`,this.#d?.setThinking(this.#p===`thinking`),this.#d?.snapToBottom(),this.#ce())}#Ee(){let e=this.#xe(),t=this.#Se(),n=t.scale*.16,r=this.#e;window.clearTimeout(this.#_),this.dataset.phase=`idle`,this.#u?.setVisualState(this.#fe()),this.#ce();let i=[{t:r.closeCollapseMs,tx:t.tx,ty:t.ty,scale:n,radius:.25,exposure:2.6,glow:.7,overlay:.6,ease:u},{t:r.closeCollapseMs+r.closeTrailMs,tx:e.tx,ty:e.ty,scale:Math.max(n,e.scale*.42),radius:.5,exposure:1.7,glow:.4,overlay:.18,ease:d},{t:r.closeCollapseMs+r.closeTrailMs+r.closeSettleMs,tx:e.tx,ty:e.ty,scale:e.scale,radius:1,exposure:1,glow:this.#ke(),overlay:0,ease:f}];this.#Ae(i,()=>{this.#f===`idle`&&(this.#u?.setVisualState(this.#fe()),this.dispatchEvent(new CustomEvent(`orb:settled`,{detail:{phase:`idle`},bubbles:!0,composed:!0})))}),this.#Oe(r.closeCollapseMs,r.closeTrailMs),window.setTimeout(()=>{this.#f===`idle`&&this.#ae(.5)},r.closeCollapseMs)}#De(){for(let e of this.#v)window.clearTimeout(e);this.#v=[],this.#a.style.transition=`none`,this.#a.style.opacity=`0`}#Oe(e,t){this.#De();let n=this.#a,r=Math.round(t*.5);this.#v.push(window.setTimeout(()=>{n.style.transition=`opacity ${r}ms ease`,n.style.opacity=`0.9`,this.#v.push(window.setTimeout(()=>{n.style.opacity=`0`},r))},e))}#ke(){return 0}#Ae(e,t){let n=e[e.length-1].t;this.#R={frames:e,start:performance.now(),dur:Math.max(1,n),from:{...this.#B},onDone:t},this.#se(),this.#je(),window.clearInterval(this.#z),this.#z=window.setInterval(()=>this.#je(),16)}#je(){if(!this.#R){window.clearInterval(this.#z),this.#z=0;return}let e=performance.now(),t=this.#Me(e);t&&(this.#B=t,this.#Ne(t),this.#Pe(t.overlay),this.#R||(window.clearInterval(this.#z),this.#z=0))}#Me(e){let t=this.#R;if(!t)return null;let n=e-t.start;if(n>=t.dur){let e=t.frames[t.frames.length-1],n={tx:e.tx,ty:e.ty,scale:e.scale,radius:e.radius,exposure:e.exposure,glow:e.glow,overlay:e.overlay};return this.#R=null,t.onDone?.(),n}let r={t:0,...t.from,ease:l};for(let e of t.frames){if(n<=e.t){let t=Math.max(1,e.t-r.t),i=e.ease((n-r.t)/t);return{tx:r.tx+(e.tx-r.tx)*i,ty:r.ty+(e.ty-r.ty)*i,scale:r.scale+(e.scale-r.scale)*i,radius:r.radius+(e.radius-r.radius)*i,exposure:r.exposure+(e.exposure-r.exposure)*i,glow:r.glow+(e.glow-r.glow)*i,overlay:r.overlay+(e.overlay-r.overlay)*i}}r=e}return null}#Ne(e){this.#Re(`--orb-tx`,`${e.tx.toFixed(1)}px`),this.#Re(`--orb-ty`,`${e.ty.toFixed(1)}px`),this.#Re(`--orb-scale`,e.scale.toFixed(4)),this.#K=e,this.#q=!1}#Pe(e){let t=Math.min(1,Math.max(0,e));if(Math.abs(t-this.#J)<.004)return;this.#J=t,this.#s.style.opacity=String(t);let n=t*this.#e.overlayBlur;this.#Re(`--orb-blur-cur`,`${n.toFixed(1)}px`)}#Fe(){let e=this.#e,t=Math.max(1,window.innerWidth),n=Math.max(1,window.innerHeight);this.#C=t,this.#w=n;let r=Math.round(Math.min(Math.max(n*e.orbCanvasRatio,280),620)),i=r*this.#h;this.#T=r,this.#E=i,this.#Re(`--orb-canvas`,`${r}px`);let a=t<e.narrowWidth?Math.max(e.dockOrbSizeMin,e.dockOrbSize*.8):e.dockOrbSize;this.#Re(`--orb-dock-size`,`${a}px`),this.#Re(`--orb-dock-margin-x`,`${e.dockMarginX}px`),this.#Re(`--orb-dock-margin-y`,`${e.dockMarginY}px`),this.#D=a/i;let o=t-e.dockMarginX-a/2,s=n-e.dockMarginY-a/2;this.#O=o-t/2,this.#k=s-n/2,this.#A=o,this.#j=s,this.#M=a;let c=n*(t<e.narrowWidth?e.activeOrbRatioNarrow:e.activeOrbRatio)*e.activeRadiusScale;this.#N=c/i,this.#P=0,this.#F=(e.activeOrbCenterY-.5)*n;let l=this.#I;if(l?(this.#N=Math.max(24,l.orb.diameter)/i,this.#P=l.orb.x-t/2,this.#F=l.orb.y-n/2,this.#n.style.opacity=l.orb.hidden?`0`:``,this.#n.style.pointerEvents=l.orb.hidden?`none`:``):(this.#n.style.opacity=``,this.#n.style.pointerEvents=``),!this.#R&&!this.#L&&(this.#B=this.#Ce(),this.#Ne(this.#B),this.#Pe(this.#B.overlay)),this.#d&&l){this.#d.layoutSpatial(l.chat);let e=l.chat.composerX+l.chat.composerW/2;this.#l.style.left=`${Math.round(e)}px`,this.#l.style.top=`${Math.round(l.chat.composerY+52)}px`,this.#l.style.bottom=`auto`}else if(this.#l.style.removeProperty(`left`),this.#l.style.removeProperty(`top`),this.#l.style.removeProperty(`bottom`),this.#d){let t=this.#N*i,r=n*e.activeOrbCenterY-t/2,a=n*e.activeOrbCenterY+t/2;this.#d.layout(e.chatTop,Math.max(120,r-e.chatTop-e.chatGap),a+22)}}#Ie(){let e=this.#e;this.#Re(`--orb-background-opacity`,String(e.backgroundOpacity)),this.#Re(`--orb-overlay-blur`,`${e.overlayBlur}px`),this.#Re(`--orb-dock-margin-x`,`${e.dockMarginX}px`),this.#Re(`--orb-dock-margin-y`,`${e.dockMarginY}px`),this.#Le(e.theme),this.#i.style.display=e.auraMode===`ring`?``:`none`,this.#d&&this.#d.setOptions(e),e.particlesEnabled||(this.#X=null)}#Le(e){let t=e===`auto`?m():e;this.dataset.theme!==t&&(this.dataset.theme=t),this.#m=t}#Re(e,t){this.style.setProperty(e,t)}#ze(){this.#S||(this.#S=!0,this.#x=performance.now(),this.#b=requestAnimationFrame(this.#Ve))}#Be(){this.#S=!1,cancelAnimationFrame(this.#b),window.clearInterval(this.#z),this.#z=0}#Ve=e=>{if(!this.#S)return;this.#b=requestAnimationFrame(this.#Ve);let t=Math.min(.05,Math.max(.001,(e-this.#x)/1e3));this.#x=e,this.#y+=t;let n=this.#e,r=this.#f===`active`&&this.#p===`idle`&&e-this.#Y>n.idleSleepMs,i=this.#R?this.#B:this.#Ce();this.#R||(this.#B=i),(this.#q||i.tx!==this.#K.tx)&&this.#Re(`--orb-tx`,`${i.tx.toFixed(1)}px`),(this.#q||i.ty!==this.#K.ty)&&this.#Re(`--orb-ty`,`${i.ty.toFixed(1)}px`),(this.#q||i.scale!==this.#K.scale)&&this.#Re(`--orb-scale`,i.scale.toFixed(4)),this.#q=!1,this.#K=i;let a=1+n.breathingAmplitude*(r?n.sleepBreathScale:1)*Math.sin(this.#y/n.breathePeriod*Math.PI*2),l=n.motionSpeed*(r?n.sleepSpeedScale:1),u=i.exposure*(r?n.sleepExposureScale:1),d=a*i.radius,f=i.glow;this.#V+=(this.#H-this.#V)*Math.min(1,t*10);let p=0;if(this.#W>.001){let t=(e-this.#U)/1e3;p=this.#W*Math.exp(-t/.22),p<.002&&(this.#W=0)}{let e=this.#$>this.#Q?s:c;this.#Q+=(this.#$-this.#Q)*(1-Math.exp(-t/e)),this.#Q<.0015&&(this.#Q=0)}let m={};n.zoom!=null&&(m[5]=n.zoom),n.glassOpacity!=null&&(m[20]=n.glassOpacity),this.#u?.setOverrides({radiusScale:d*(1+this.#V*.012+p*.02),speedScale:l*(1+p*.6),exposureScale:u*(1+this.#V*.08+p*.22),edgeGlow:f+n.glowIntensity*.12+this.#V*.3+p*.5+(n.auraMode===`native`?this.#Q*o:0),byIndex:m}),this.#Pe(i.overlay),n.auraMode===`ring`&&(this.#f===`active`||this.#R)&&this.#He(i,t),n.particlesEnabled&&(this.#f===`active`||this.#R)&&this.#We(t)};#He(e,t){let n=this.#i,r=this.#E*e.scale*.5,i=Math.ceil((r+64)*2),a=Math.min(window.devicePixelRatio||1,2),o=Math.floor(i*a);(n.width!==o||n.height!==o)&&(n.width=o,n.height=o,n.style.width=`${i}px`,n.style.height=`${i}px`,n.style.marginLeft=`${-i/2}px`,n.style.marginTop=`${-i/2}px`,this.#te=null),this.#te||=n.getContext(`2d`);let s=this.#te;if(!s)return;n.style.transform=`translate(${e.tx.toFixed(1)}px, ${e.ty.toFixed(1)}px)`;let c=0;for(let e=0;e<this.#ee.length;e++)c+=this.#ee[e];c/=this.#ee.length,this.#ne+=(c-this.#ne)*Math.min(1,t*12);let l=o/2,u=o/2,d=this.#ee.length,f=r*a,p=this.#p===`ai`||this.#p===`user`;s.clearRect(0,0,o,o),s.lineCap=`round`,s.beginPath(),s.arc(l,u,f+9*a,0,Math.PI*2),s.strokeStyle=`rgba(${this.#Ue()}, ${(.1+this.#ne*.3).toFixed(3)})`,s.lineWidth=1.1*a,s.stroke();let m=10+34*Math.min(1,this.#ne*2.2);for(let e=0;e<d;e++){let t=this.#ee[e],n=e/d*Math.PI*2-Math.PI/2,r=f+9*a,i=(1.2+t*m)*a,o=l+Math.cos(n)*r,c=u+Math.sin(n)*r,h=l+Math.cos(n)*(r+i),g=u+Math.sin(n)*(r+i),_=p?.28+t*.62:.1+t*.3;s.strokeStyle=`rgba(${this.#Ue()}, ${_.toFixed(3)})`,s.lineWidth=2*a,s.lineCap=`round`,s.beginPath(),s.moveTo(o,c),s.lineTo(h,g),s.stroke()}}#Ue(){return this.#m===`light`?`46, 106, 196`:`168, 206, 255`}#We(e){let t=this.#r,n=Math.min(window.devicePixelRatio||1,2),r=Math.floor(this.#C*n),i=Math.floor(this.#w*n);(t.width!==r||t.height!==i)&&(t.width=r,t.height=i),this.#X||=t.getContext(`2d`);let a=this.#X;if(!a)return;let o=this.#e;this.#Z.length!==o.particleCount&&(this.#Z=Array.from({length:o.particleCount},()=>({x:Math.random()*r,y:Math.random()*i,vx:(Math.random()-.5)*6*n,vy:(Math.random()-.5)*6*n,r:(Math.random()*1.1+.3)*n}))),a.clearRect(0,0,r,i),a.fillStyle=`rgba(${this.#m===`light`?`40, 92, 170`:`180, 210, 255`}, ${o.particleOpacity})`;for(let t of this.#Z)t.x+=t.vx*e,t.y+=t.vy*e,t.x<0?t.x+=r:t.x>r&&(t.x-=r),t.y<0?t.y+=i:t.y>i&&(t.y-=i),a.beginPath(),a.arc(t.x,t.y,t.r,0,Math.PI*2),a.fill()}},_=`// Glass Liquid — curated flow programs with an optional glass shell.
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
`,ee={voiceWave:{idle:[1,1,0,.266,.7,.3312,1.196,.1932,2.2,.08,.22,.36,.18,.2,.837,19,.005,0,0,1,.48,.03,2,.42,.77,.23,65,0,0,1,.22,.25,.72,5,.42,1.25,.55,.3,1.2,.7,.0313725,.0196078,.0431373,1,.415686,.184314,.411765,1,.54902,.27451,.321569,1,.333333,.27451,.498039,1,.709804,.541176,.647059,1,1,1,1,1,.894118,.545098,1,1,1,.470588,.564706,1,1,.945098,.980392,1,.905882,.85098,1,1,.00784314,.00392157,.0196078,1,.423529,.243137,.447059,1,.968627,.984314,1,1,.937255,.964706,.992157,1,.878431,.933333,.976471,1,.831373,.901961,.968627,1,.733333,.835294,.952941,1,.65098,.780392,.941176,1,.529412,.690196,.921569,1,.435294,.619608,.909804,1,.435294,.619608,.909804,1,.435294,.619608,.909804,1,.435294,.619608,.909804,1,.435294,.619608,.909804,1],thinking:[1,1,0,.95,.7,.36,2.6,.46,2.2,.08,.22,.36,.18,.2,1.35,19,.005,0,0,1,.48,.1,2,.42,.77,.23,65,0,0,1,.22,.25,.72,5,.42,1.25,.55,.3,1.2,.7,.0352941,.0117647,.054902,1,.807843,.172549,.796078,1,1,.360784,.443137,1,.482353,.32549,1,1,1,.85098,.941176,1,1,1,1,1,.894118,.545098,1,1,1,.470588,.564706,1,1,.945098,.980392,1,.905882,.85098,1,1,.00784314,.00392157,.0196078,1,.807843,.172549,.796078,1,.968627,.984314,1,1,.937255,.964706,.992157,1,.878431,.933333,.976471,1,.831373,.901961,.968627,1,.733333,.835294,.952941,1,.65098,.780392,.941176,1,.529412,.690196,.921569,1,.435294,.619608,.909804,1,.435294,.619608,.909804,1,.435294,.619608,.909804,1,.435294,.619608,.909804,1,.435294,.619608,.909804,1]},custom:{idle:[1,1,0,.56,.72,.3312,1.824,.44,3.848,.58,.36,.28,.2,.22,.7776,12,.02,0,0,1,.42,0,2,.42,.77,.23,65,0,0,1,.22,.25,.72,5,.42,1.25,.55,.3,1.2,.7,.454902,.498039,.964706,1,.909804,.913725,.929412,1,.34902,.419608,.831373,1,.854902,.858824,.905882,1,.796078,.811765,.807843,1,1,1,1,1,.72549,.752941,.792157,1,1,1,1,1,.917647,.956863,1,1,.862745,.917647,1,1,.94902,.94902,.952941,1,.454902,.478431,.482353,1,.968627,.984314,1,1,.937255,.964706,.992157,1,.878431,.933333,.976471,1,.831373,.901961,.968627,1,.733333,.835294,.952941,1,.65098,.780392,.941176,1,.529412,.690196,.921569,1,.435294,.619608,.909804,1,.435294,.619608,.909804,1,.435294,.619608,.909804,1,.435294,.619608,.909804,1,.435294,.619608,.909804,1],thinking:[1,1,0,2,.72,.27,4.25,.44,.5,0,.36,.28,.2,.22,1.06,12,.02,.11,0,1,.42,.15,2,.42,.77,.23,65,0,0,1,.22,.25,.72,5,.42,1.25,.55,.3,1.2,.7,.254902,.47451,.882353,1,.968627,.968627,.972549,1,.0588235,.341176,.760784,1,.862745,.921569,.980392,1,1,1,1,1,1,1,1,1,.72549,.752941,.792157,1,1,1,1,1,.917647,.956863,1,1,.862745,.917647,1,1,.94902,.94902,.952941,1,.0745098,.0470588,.87451,1,.968627,.984314,1,1,.937255,.964706,.992157,1,.878431,.933333,.976471,1,.831373,.901961,.968627,1,.733333,.835294,.952941,1,.65098,.780392,.941176,1,.529412,.690196,.921569,1,.435294,.619608,.909804,1,.435294,.619608,.909804,1,.435294,.619608,.909804,1,.435294,.619608,.909804,1,.435294,.619608,.909804,1]},chromatic:{idle:[1,1,0,.336,.51,.3,3,.5,2.2,.1,.14,.46,.2,.16,.7776,22,.005,0,0,1,.54,0,1.24,.147,.77,.1104,76,-1,0,.32,.216,.209,.72,5,.42,1.25,.55,.3,1.2,.7,.721569,.737255,.729412,1,.4,.419608,.411765,1,.619608,.639216,.631373,1,.156863,.168627,.176471,1,.819608,.835294,.827451,1,.968627,.988235,1,1,.431373,.862745,1,1,1,.501961,.427451,1,.968627,.988235,1,1,.85098,.952941,1,1,.0117647,.0509804,.0509804,1,.470588,.537255,.560784,1,.968627,.984314,1,1,.937255,.964706,.992157,1,.878431,.933333,.976471,1,.831373,.901961,.968627,1,.733333,.835294,.952941,1,.65098,.780392,.941176,1,.529412,.690196,.921569,1,.435294,.619608,.909804,1,.435294,.619608,.909804,1,.435294,.619608,.909804,1,.435294,.619608,.909804,1,.435294,.619608,.909804,1],thinking:[1,1,0,1.72,.51,.3,3,.5,2.2,.1,.14,.46,.2,.16,1.08,22,.005,0,0,1,.54,0,2.3,.56,.77,.55,76,-1,0,1.18,.9,.38,.72,5,.42,1.25,.55,.3,1.2,.7,.0784314,.168627,.858824,1,.862745,.858824,.921569,1,.890196,.886275,.913725,1,.117647,.168627,.745098,1,1,1,1,1,.968627,.988235,1,1,.431373,.862745,1,1,1,.501961,.427451,1,.968627,.988235,1,1,.85098,.952941,1,1,.0117647,.0509804,.0509804,1,.741176,.937255,1,1,.968627,.984314,1,1,.937255,.964706,.992157,1,.878431,.933333,.976471,1,.831373,.901961,.968627,1,.733333,.835294,.952941,1,.65098,.780392,.941176,1,.529412,.690196,.921569,1,.435294,.619608,.909804,1,.435294,.619608,.909804,1,.435294,.619608,.909804,1,.435294,.619608,.909804,1,.435294,.619608,.909804,1]}},te=`custom`;ee.custom;var ne=770,re=1350,ie=[[6,`mid`,1.45,0,8],[7,`mid`,0,1.05,1],[8,`mid`,0,1,8],[21,`low`,0,.85,1],[10,`high`,.22,0,2],[3,`all`,0,.85,5],[14,`all`,0,.1,4]],ae={9:.8,10:.65,11:.65,14:.75,19:1,21:.7,12:.85,22:.85},oe=.07,se=170,ce=13,le=2.6,ue=.35,de=.16,fe=.55,pe=.22,me=.32,he=.05,ge=.22,_e=1.15,ve=e=>Number.isFinite(e)?Math.min(1,Math.max(0,e)):0;function ye(e){return e<=.04045?e/12.92:((e+.055)/1.055)**2.4}function be(e){return e<=.0031308?e*12.92:1.055*e**(1/2.4)-.055}function xe(e,t,n){return be(ye(e)+(ye(t)-ye(e))*n)}var Se=40,Ce=84;function we(e){let t=[e[Se],e[41],e[42]],n=-1;for(let r=0;r<4;r++){let i=Se+r*4,a=[e[i],e[i+1],e[i+2]],o=Math.max(...a)-Math.min(...a);o>n&&Math.max(...a)>.25&&(n=o,t=a)}let r=Math.max(...t);if(r>.001){let e=Math.min(2.4,.95/r);t=[t[0]*e,t[1]*e,t[2]*e].map(e=>Math.min(1,e))}return t}function Te(e,t){e[Ce]=t[0],e[85]=t[1],e[86]=t[2],e[87]=1}function Ee(e){let t=e.idle.slice(),n=e.thinking.slice(),r=(e,r,i,a,o=1)=>{let s=t.slice(),c=(e,r)=>{s[e]=t[e]+(n[e]-t[e])*r};return s[3]=e,c(6,r),c(7,r),c(8,r),c(21,r),s[14]=i,s[17]=a,s[4]=t[4]*o,s},i=t.slice();for(let e=Se;e<i.length;e++)i[e]=n[e];let a=(e,r)=>{i[e]=t[e]+(n[e]-t[e])*r};a(3,.55),a(6,.5),a(7,.5),a(8,.4),a(21,.4),a(14,.7),a(17,.6);let o=we(t),s={idle:t,dock:i,active:r(3.2,1,.92,.09,.9),thinking:r(1.5,.75,.8,.07,.86),listening:r(1.6,.42,.86,.05,.92),speaking:r(2.4,.68,1,.12,.94)};for(let e of Object.values(s))Te(e,o);return s}var De=class{#e;#t=null;#n=null;#r=null;#i=null;#a=null;#o=`bgra8unorm`;#s;#c=new Float32Array(136);#l=new Float32Array(136);#u=new Float32Array(136);#d=new Float32Array(136);#f=`idle`;#p=`idle`;#m=0;#h=0;#g=0;#_=0;#v=0;#y=!1;#b=!1;#x=2;#S={low:0,mid:0,high:0,all:0};#C=0;#w=0;#T=0;#E=0;#D=0;#O={};constructor(e,t=te){this.#e=e;let n=ee[t]??ee.custom;this.#s=Ee(n),this.#c.set(this.#s.idle),this.#l.set(this.#s.idle),this.#u.set(this.#s.idle),this.#d.set(this.#s.idle)}get radiusFactor(){return this.#s.idle[4]}get state(){return this.#f}get envelope(){return{contour:this.#D,emph:this.#w,spring:this.#T}}get uniformsSnapshot(){let e=this.#c;return{exposure:e[14],radius:e[4],warp:e[6],ridge:e[7],deform:e[21],edgeGlow:e[17],colorA:[e[40],e[41],e[42]],glowColor:[e[84],e[85],e[86]]}}async init(){let e=navigator.gpu;if(!e)return!1;let t,n=null;try{let r=await e.requestAdapter();if(!r||(t=await r.requestDevice(),n=this.#e.getContext(`webgpu`),!n))return!1;this.#o=e.getPreferredCanvasFormat(),n.configure({device:t,format:this.#o,alphaMode:`premultiplied`})}catch(e){return console.warn(`[liquid-orb] WebGPU 初始化失败`,e),!1}this.#t=t,this.#n=n,t.lost.then(e=>{console.warn(`[liquid-orb] WebGPU device lost:`,e.message||e.reason),this.#F()}),t.addEventListener(`uncapturederror`,e=>{console.error(`[liquid-orb] WebGPU error:`,e.error.message)});try{this.#k()}catch(e){return console.warn(`[liquid-orb] 管线创建失败`,e),!1}return this.#P(),!0}#k(){let e=this.#t;if(!e)return;let t=e.createShaderModule({code:_}),n={color:{srcFactor:`one`,dstFactor:`one-minus-src-alpha`,operation:`add`},alpha:{srcFactor:`one`,dstFactor:`one-minus-src-alpha`,operation:`add`}};this.#r=e.createRenderPipeline({layout:`auto`,vertex:{module:t,entryPoint:`vs_main`},fragment:{module:t,entryPoint:`fs_main`,targets:[{format:this.#o,blend:n}]},primitive:{topology:`triangle-list`}});let r=new Float32Array(this.#d);this.#i=e.createBuffer({size:r.byteLength,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),this.#a=e.createBindGroup({layout:this.#r.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:this.#i}}]})}setVisualState(e){if(e===this.#f||!this.#s[e])return;let t=performance.now();this.#A(t),this.#l.set(this.#d),this.#u.set(this.#s[e]),this.#p=e,this.#m=t,this.#h=e===`active`?ne:re,this.#f=e}setState(e){this.setVisualState(e)}setAudioBands(e){let t=e=>{let t=ve(e??0);return t<oe?0:t};this.#S={low:t(e?.low),mid:t(e?.mid),high:t(e?.high),all:t(e?.all)}}setOverrides(e){this.#O=e}setMaxPixelRatio(e){this.#x=Math.max(1,Math.min(3,e))}#A(e){if(this.#h<=0)return;let t=Math.min(1,Math.max(0,(e-this.#m)/this.#h)),n=this.#p===`thinking`?1-(1-t)**3:t*t*(3-2*t);for(let e=3;e<this.#d.length;e++){let t=e>=40&&(e-40)%4<3;this.#d[e]=t?xe(this.#l[e],this.#u[e],n):this.#l[e]+(this.#u[e]-this.#l[e])*n}}#j(e){let t=ae[Math.round(e[15])]??0;if(t)for(let[n,r,i,a,o]of ie){let s=this.#S[r]*t;if(!s)continue;let c=e[n];e[n]=Math.min(o,Math.max(c,c*(1+a*s)+i*s))}}#M(e,t){let n=this.#S.all;(t>0?(n-this.#C)/t:0)>le&&n>ue&&(this.#w=Math.min(1,this.#w+.9)),this.#C=n,this.#w=Math.max(0,this.#w-t*2.2);let r=n>this.#D?he:ge;if(t>0){let e=1-Math.exp(-t/r);this.#D+=(n-this.#D)*e}let i=Math.min(1,Math.max(0,this.#D));e[6]+=fe*i,e[7]=Math.min(1,e[7]*(1+pe*i)),e[21]=Math.min(1,e[21]+me*i);let a=n*.5+this.#w;t>0&&(this.#E+=(a-this.#T)*se*t-this.#E*ce*t,this.#T+=this.#E*t,this.#T=Math.max(-.06,Math.min(.06,this.#T))),e[4]*=1+this.#T*.25,e[14]*=1+this.#T*.1+this.#w*de}#N(e){let t=this.#O;if(t.byIndex)for(let n of Object.keys(t.byIndex))e[Number(n)]=t.byIndex[Number(n)];t.radiusScale!==void 0&&(e[4]*=t.radiusScale),t.speedScale!==void 0&&(e[3]*=t.speedScale),t.exposureScale!==void 0&&(e[14]*=t.exposureScale),t.edgeGlow!==void 0&&(e[17]=t.edgeGlow)}#P(){this.#y||this.#b||(this.#y=!0,this.#_=0,this.#v=requestAnimationFrame(this.#I))}#F(){this.#y=!1,cancelAnimationFrame(this.#v)}#I=e=>{if(this.#b)return;this.#v=requestAnimationFrame(this.#I);let t=this.#t,n=this.#n;if(!t||!n)return;let r=Math.min(window.devicePixelRatio||1,this.#x),i=Math.max(1,Math.floor(this.#e.clientWidth*r)),a=Math.max(1,Math.floor(this.#e.clientHeight*r));(this.#e.width!==i||this.#e.height!==a)&&(this.#e.width=i,this.#e.height=a);let o=this.#_===0?0:Math.min(.1,Math.max(0,(e-this.#_)/1e3));this.#_=e,this.#A(e);let s=this.#c;s.set(this.#d);let c=this.#d[14];this.#j(s),this.#M(s,o),this.#N(s),c>.001&&(s[14]=Math.min(s[14],c*_e));let l=Math.max(s[3],0);this.#g+=o*l,s[0]=i,s[1]=a,s[2]=this.#g/Math.max(l,.001),t.queue.writeBuffer(this.#i,0,s);try{let e=t.createCommandEncoder(),r=e.beginRenderPass({colorAttachments:[{view:n.getCurrentTexture().createView(),clearValue:{r:0,g:0,b:0,a:0},loadOp:`clear`,storeOp:`store`}]});r.setPipeline(this.#r),r.setBindGroup(0,this.#a),r.draw(3),r.end(),t.queue.submit([e.finish()])}catch(e){console.error(`[liquid-orb] 渲染出错`,e),this.#F()}};destroy(){this.#b=!0,this.#F(),this.#i?.destroy(),this.#t?.destroy(),this.#t=null,this.#n=null}},Oe=[[`low`,20,250],[`mid`,250,2e3],[`high`,2e3,8e3]],ke=class{#e;#t;#n={mic:null,bus:null};#r=null;#i={low:0,mid:0,high:0,all:0};#a={low:0,mid:0,high:0,all:0};#o=null;#s=null;#c=0;#l=0;#u=!1;#d=.045;#f=.28;#p=new Float32Array(32);#m=new Float32Array(32);constructor(e,t){this.#e=e,this.#t=t??null}get bands(){return{...this.#i}}get source(){return this.#r}attach(e,t){this.#n[e]=t,e===this.#r&&(this.#o=t?new Uint8Array(new ArrayBuffer(t.analyser.frequencyBinCount)):null,this.#s=t?new Float32Array(new ArrayBuffer(t.analyser.fftSize)):null)}setSource(e){if(e===this.#r)return;this.#r=e;let t=e?this.#n[e]:null;this.#o=t?new Uint8Array(new ArrayBuffer(t.analyser.frequencyBinCount)):null,this.#s=t?new Float32Array(new ArrayBuffer(t.analyser.fftSize)):null,t||(this.#a={low:0,mid:0,high:0,all:0},this.#m.fill(0))}start(){this.#u||(this.#u=!0,this.#l=performance.now(),this.#c=requestAnimationFrame(this.#h))}stop(){this.#u=!1,cancelAnimationFrame(this.#c),this.#a={low:0,mid:0,high:0,all:0},this.#i={low:0,mid:0,high:0,all:0},this.#m.fill(0),this.#p.fill(0),this.#e(this.#i),this.#t?.(this.#p)}#h=e=>{if(!this.#u)return;this.#c=requestAnimationFrame(this.#h);let t=Math.min(.1,Math.max(.001,(e-this.#l)/1e3));this.#l=e;let n=this.#r?this.#n[this.#r]:null,r=n?.analyser??null,i=this.#o,a=this.#s;if(!r||!i||!a||!n){this.#a={low:0,mid:0,high:0,all:0},this.#_();return}r.getByteFrequencyData(i),r.getFloatTimeDomainData(a);let o=0;for(let e=0;e<a.length;e++)o+=a[e]*a[e];let s=Math.sqrt(o/Math.max(1,a.length)),c=(n.ctx.sampleRate||48e3)/2/i.length,l={low:0,mid:0,high:0,all:0},u=0;for(let[e,t,n]of Oe){let r=Math.max(0,Math.floor(t/c)),a=Math.min(i.length-1,Math.ceil(n/c)),o=0;for(let e=r;e<=a;e++)o+=i[e];let s=a>=r?o/(a-r+1)/255:0;l[e]=s,u+=s}let d=Math.min(1,Math.max(0,s-.004)*5.5);this.#a={low:Math.min(1,l.low*1.9),mid:Math.min(1,l.mid*2.5),high:Math.min(1,l.high*2.2),all:Math.max(d,Math.min(1,u/3*2))},this.#g(i,c),this.#_(t)};#g(e,t){let n=this.#m.length,r=Math.min(1e4,t*e.length),i=Math.log(80),a=Math.log(r);for(let r=0;r<n;r++){let o=Math.exp(i+(a-i)*(r/n)),s=Math.exp(i+(a-i)*((r+1)/n)),c=Math.max(0,Math.floor(o/t)),l=Math.min(e.length-1,Math.max(c,Math.ceil(s/t)-1)),u=0;for(let t=c;t<=l;t++)u+=e[t];let d=u/Math.max(1,l-c+1)/255,f=1+r/n*.9;this.#m[r]=Math.min(1,d*3*f)}}#_(e=1/60){let t=(t,n,r=this.#d,i=this.#f)=>{let a=n>t?r:i,o=1-Math.exp(-e/Math.max(1e-4,a));return t+(n-t)*o};this.#i={low:t(this.#i.low,this.#a.low),mid:t(this.#i.mid,this.#a.mid),high:t(this.#i.high,this.#a.high),all:t(this.#i.all,this.#a.all)};for(let e of[`low`,`mid`,`high`,`all`])this.#i[e]<1e-4&&(this.#i[e]=0);if(this.#e(this.#i),this.#t){for(let e=0;e<this.#p.length;e++)this.#p[e]=t(this.#p[e],this.#m[e],.05,.3),this.#p[e]<8e-4&&(this.#p[e]=0);this.#t(this.#p)}}};i(`liquid`,(e,t)=>new De(e,t.orbPreset)),customElements.get(`ai-orb-chat`)||customElements.define(`ai-orb-chat`,g);var v={orb:`liquid`,orbPreset:`custom`,brand:`瀚涛百事通`,kbPath:`/kb`,chunkMs:1e3,aec:!0,upGate:!1,log:!0,theme:`light`,auraMode:`native`},Ae=[{type:`function`,name:`query_company_policy`,description:`查询公司内部制度与政策。凡是涉及公司自身事务——规章制度、办事流程、报销、发票、入职离职、考勤、请假、年假、加班、出差、补贴、薪酬绩效、培训、合同、组织与部门、项目情况、系统账号等——都必须先调用它拿到资料再回答，绝对不允许凭印象编造公司信息。`,parameters:{type:`object`,properties:{topic:{type:`string`,description:`要查的主题，如「笔记本补贴」「考勤制度」「年假天数」`}},required:[`topic`]}},{type:`function`,name:`get_datetime`,description:`获取今天的日期、星期和当前时间。当用户问到日期、时间、今天几号、今天星期几、现在几点时调用它，不要凭记忆回答。`,parameters:{type:`object`,properties:{}}}],je={query_company_policy:`查公司制度`,get_datetime:`查日期时间`},Me=new Set([`query_company_policy`]),Ne=`成都`;function Pe(){let e=new Date,t=`日一二三四五六`[e.getDay()];return{date:`${e.getFullYear()}年${e.getMonth()+1}月${e.getDate()}日`,weekday:`星期${t}`,time:`${String(e.getHours()).padStart(2,`0`)}:${String(e.getMinutes()).padStart(2,`0`)}`,location:Ne}}var Fe=!1;function Ie(e){Fe=e}function Le(){return Fe}async function Re(e,t){let n=Math.round(t||30),r=await(await fetch(`${v.kbPath}?q=${encodeURIComponent(e)}&t=${n}`,{cache:`no-store`})).json();if(!r||!r.ok)throw Error(r&&r.error||`kb_failed`);return r}async function ze(e,t,n){let r=Math.round(t||20),i=await(await fetch(`${v.kbPath}/chart?q=${encodeURIComponent(e)}&t=${r}`,{cache:`no-store`,signal:n})).json();if(!i||!i.ok)throw Error(i&&i.error||`kb_chart_failed`);return i}function Be(e){if(!e||e.length<4)return!1;if(/(分布|占比|比例|趋势|对比|统计|排名|同比|环比|各部门|各分公司|各区域|各团队|各类|各项)/.test(e))return!0;let t=/(近\S{0,4}(天|周|月|年)|逐月|逐日|逐周|月度|年度|季度)/.test(e),n=/(工单|数量|金额|时长|次数|人数|销量|产量|完成|受理|处理量|满意度|占比)/.test(e);return t&&n}async function Ve(e,t,n){if(e===`query_company_policy`){n.tool();let e=await Re(String(t.topic||``),25);return String(e.answer||``).slice(0,1500)||`（知识库没有返回相关内容）`}if(e===`get_datetime`){let e=Pe();return`${e.date} ${e.weekday} ${e.time}`}return`（没有名为 ${e} 的工具）`}var He=/```(chart|view|md-chart)(?:[:：]([a-zA-Z0-9_-]+))?[ \t]*\r?\n([\s\S]*?)```/g,Ue=/```(chart|view|md-chart)(?:[:：][a-zA-Z0-9_-]+)?[ \t]*\r?\n[\s\S]*$/,We=new Set([`bars`,`line`,`table`,`cards`,`text`,`scene3d`]);function Ge(e){return typeof e==`object`&&e&&!Array.isArray(e)?e:null}function Ke(e){let t=e.split(/\r?\n/).map(e=>e.trim()).filter(e=>e.startsWith(`|`));if(t.length<3)return null;let n=e=>e.replace(/^\|/,``).replace(/\|$/,``).split(`|`).map(e=>e.trim()),r=n(t[0]),i=n(t[1]);if(!r.length||i.length!==r.length||!i.every(e=>/^:?-{2,}:?$/.test(e)))return null;let a=t.slice(2).map(n).filter(e=>e.some(e=>e!==``));return a.length?{headers:r,rows:a}:null}function qe(e){let t=e.replace(/[,\s%]/g,``).replace(/[^\d.+-]/g,``);if(!t||t===`-`||t===`.`)return null;let n=Number(t);return Number.isFinite(n)?n:null}function Je(e,t,n,r){let i=t.map(e=>e[0]??``),a=[];for(let n=1;n<e.length;n++){let r=t.map(e=>qe(e[n]??``));r.every(e=>e==null)||a.push({name:e[n]||`系列${a.length+1}`,values:r.map(e=>e??0)})}return a.length?r?{labels:i,series:a,unit:r}:{labels:i,series:a}:null}function Ye(e,t){return{columns:e.map((e,t)=>({key:`c${t}`,label:e})),rows:t.map(e=>Object.fromEntries(e.map((e,t)=>[`c${t}`,e])))}}function Xe(e){let t={},n=e.split(/\r?\n/),r=0;for(;r<n.length;r++){let e=n[r].trim();if(!e)continue;let i=/^([a-zA-Z_][\w-]*)\s*[:：]\s*(.+)$/.exec(e);if(!i)break;t[i[1].toLowerCase()]=i[2].trim()}return{meta:t,rest:n.slice(r).join(`
`)}}function Ze(e,t){let n=e.trim();if(!n)return null;if(n.startsWith(`{`)){let e;try{e=JSON.parse(n)}catch{return null}let r=Ge(e);if(!r)return null;let i=String(r.type??r.kind??t??`bars`),a=We.has(i)?i:`bars`,o=r.data??(r.labels||r.series?{labels:r.labels,series:r.series,unit:r.unit}:null);return o?{kind:a,title:typeof r.title==`string`?r.title:void 0,subtitle:typeof r.subtitle==`string`?r.subtitle:void 0,unit:typeof r.unit==`string`?r.unit:void 0,data:o,raw:n}:null}let{meta:r,rest:i}=Xe(n),a=Ke(i);if(!a)return null;let o=(r.type||t||``).toLowerCase(),s=r.unit;if(o===`table`)return{kind:`table`,title:r.title,subtitle:r.subtitle,unit:s,data:Ye(a.headers,a.rows),raw:n};let c=o===`line`?`line`:`bars`,l=Je(a.headers,a.rows,c,s);return l?{kind:c,title:r.title,subtitle:r.subtitle,unit:s,data:l,raw:n}:null}function y(e){if(!e||!e.includes("```"))return{text:e??``,charts:[],openFence:!1};let t=[],n=e.replace(He,(e,n,r,i)=>{let a=Ze(String(i),r?String(r):void 0);return a&&t.push(a),`
`}),r=Ue.exec(n);return r&&(n=n.slice(0,r.index)),n=n.replace(/\n{3,}/g,`

`).trim(),{text:n,charts:t,openFence:!!r}}function Qe(e,t){return e.map((n,r)=>({id:`chart-${t}-${r}`,kind:n.kind,role:r===0?`focus`:`support`,priority:r===0?0:Math.min(3,r),title:n.title??(e.length>1?`图表 ${r+1}`:`数据视图`),subtitle:n.subtitle,prefer:`auto`,size:n.kind===`table`?{min:[300,200],pref:[560,420]}:{min:[300,200],pref:[620,380]},data:n.data,interaction:`hover`,lifecycle:`session`,why:`对话中的数据`}))}function $e(e){return e>=2?`immersive`:`split-right`}var et=class{#e;constructor(e){this.#e=e}#t(e,t){let n=this.#e();if(n)try{let{ctx:r,destination:i}=n,a=r.currentTime+.05,o=r.createGain();o.gain.value=t,o.connect(i);let s=0;for(let[t,n,i]of e){let e=r.createOscillator(),c=r.createGain();e.type=`sine`,e.frequency.value=t;let l=a+n;c.gain.setValueAtTime(1e-4,l),c.gain.exponentialRampToValueAtTime(1,l+Math.min(.05,i*.2)),c.gain.exponentialRampToValueAtTime(1e-4,l+i),e.connect(c),c.connect(o),e.start(l),e.stop(l+i+.02),s=Math.max(s,n+i)}n.hold(Math.round((s+.15)*1e3))}catch{}}ready(){this.#t([[523.25,0,.85],[659.25,.4,.85],[880,.8,1.45]],.18)}exit(){this.#t([[880,0,.5],[659.25,.34,.5],[523.25,.68,.7]],.14)}error(){this.#t([[440,0,.16],[330,.2,.22]],.1)}tool(){this.#t([[440,0,.16],[659.25,.13,.22]],.12)}},b=16e3,tt=24e3,nt=.2,rt=location.protocol===`https:`,x=(location.port===`8770`||rt)&&location.hostname?location.host:`127.0.0.1:8770`,it=()=>`${rt?`wss`:`ws`}://${x}`,S=e=>`${it()}/ws?mode=${e}`,at=`${rt?`https`:`http`}://${x}`;async function ot(){try{return(await fetch(`${at}/health`,{cache:`no-store`})).ok}catch{return!1}}var st=[`你是「瀚涛百事通」，一个聪明、亲切、反应快的中文语音助手，此刻正在和用户**打电话**。`,`【说话风格】像真人聊天一样自然、口语化；回答**简短**，通常一到三句话，不要长篇大论。`,`  不要输出 emoji、markdown、列表、编号或括号里的旁白；你的每一个字都会被读出来。`,`  不要动不动就自我介绍或说「作为一个人工智能助手」；除非用户问起，不要报家门。`,`【倾听与打断】你是全双工的，可以一边听一边说。用户随时可能插话——`,`  一旦用户开口，立刻停下、先听用户说完，再自然地接住新内容，不要抢话、不要自顾自说完。`,`  用户只是「嗯」「对」这类附和时，可以继续把话说完，不必每次都让位。`,`【查资料】凡是涉及**公司自身事务**（规章制度、办事流程、报销发票、入职离职、考勤请假、`,`  年假、加班出差、补贴、薪酬绩效、培训、合同、组织部门、项目、系统账号等），`,`  你必须**先调用 query_company_policy 查到资料再回答**，绝对不许凭印象编造公司信息。`,`  查到资料后，用你自己的话**简要口语化地复述重点**（先给结论和关键数字），`,`  不要逐字照读原文条款，也不要罗列一大批细节。`,`  问到日期、时间、今天几号、星期几、现在几点时，调用 get_datetime，不要凭记忆回答。`,`  不要在回答里出现「工具」「知识库」「查询结果」「根据资料」这类字眼，`,`  直接把结果当成你本来就知道的事情，自然地讲出来。`].join(``);function ct(e){let t=e.length,n=new Uint8Array(t*2),r=new DataView(n.buffer);for(let n=0;n<t;n++){let t=Math.max(-1,Math.min(1,e[n]||0));r.setInt16(n*2,t<0?t*32768:t*32767,!0)}let i=``,a=32768;for(let e=0;e<n.length;e+=a)i+=String.fromCharCode.apply(null,n.subarray(e,e+a));return btoa(i)}function lt(e){let t=atob(e),n=t.length>>1,r=new Uint8Array(n*2);for(let e=0;e<t.length;e++)r[e]=t.charCodeAt(e)&255;let i=new DataView(r.buffer),a=new Float32Array(n);for(let e=0;e<n;e++)a[e]=i.getInt16(e*2,!0)/32768;return a}function ut(e,t,n){if(t===n)return e;let r=n/t,i=Math.round(e.length*r),a=new Float32Array(i);for(let t=0;t<i;t++){let n=t/r,i=Math.floor(n),o=Math.min(i+1,e.length-1),s=n-i;a[t]=e[i]*(1-s)+e[o]*s}return a}function dt(e){let t=0;for(let n=0;n<e.length;n+=16)t+=e[n]*e[n];return Math.sqrt(t/Math.max(1,e.length/16))}var ft=class{#e;#t;#n;#r;#i=null;#a=null;#o=!1;#s=null;#c=null;#l=null;#u=null;#d=null;#f=null;#p=null;#m=null;#h=0;#g=new Set;#_=0;#v=!1;#y=0;#b=0;#x=[];#S=0;#C=!1;#w=``;#T=v.aec;#E=v.chunkMs;#D=0;#O=!1;#k=0;#A=!1;#j=null;#M=0;#N=Promise.resolve();#P=!1;#F=``;#I=!1;#L=!1;#R=null;#z=0;#B={responseOpen:!1,pending:!1,gen:0,pendingGen:-1,toolsInFlight:0,toolCalls:[]};#V={responseOpen:!1,pending:!1,gen:0,pendingGen:-1,toolsInFlight:0};#H=!1;#U={noise:.004,active:!1,voiceRun:0,lastVoice:0,len:0,frames:0,pre:[],preLen:0};#W=!1;constructor(e,t){this.#e=e,this.#t=t,this.#r=new ke(t=>e.setAudioBands(t),t=>e.setAudioSpectrum(t)),this.#n=new et(()=>this.#G())}get sounds(){return this.#n}get audio(){return this.#r}get connected(){return!!this.#i&&this.#i.readyState===1}get inCall(){return!!this.#i&&(this.#i.readyState===0||this.#i.readyState===1)}get micDeviceId(){return this.#f}setMicDevice(e){this.#f=e,this.#o&&(this.stopMic(),window.setTimeout(()=>void this.startMic(),300))}setAec(e){this.#T=e}setChunkMs(e){this.#E=e}setUpGate(e){v.upGate=e}#G(){let e=this.#Y();return!e||!this.#m?null:{ctx:e,destination:this.#m,hold:e=>{this.#y=Math.max(this.#y,performance.now()+e)}}}async startVoice(){if(this.inCall)return;let e=++this.#D;if(this.#O=!1,this.#t.onState(`连接中…`,`info`),this.#t.onVoice(`thinking`),this.#B={responseOpen:!1,pending:!1,gen:0,pendingGen:-1,toolsInFlight:0,toolCalls:[]},!await ot()){if(e!==this.#D)return;this.#t.onError(`中继未连接（${x}）。请先运行 server.py，再用 http://${x} 打开本页。`),this.#n.error(),this.#t.onVoice(`idle`);return}if(e!==this.#D)return;this.#C=!1,this.#v=!1;let t=new WebSocket(S(`audio`));this.#i=t,t.onopen=()=>{if(e!==this.#D)try{t.close()}catch{}else this.#t.onState(`初始化…`),this.#q()},t.onclose=e=>{this.#i===t&&(this.#i=null,this.stopMic(),this.#Te(),this.#t.onState(`已断开`),this.#t.onVoice(`idle`),this.#r.setSource(null),!this.#O&&(e&&e.code&&e.code!==1e3&&e.code!==1005?(this.#n.error(),this.#t.onError(`通话断开（code ${e.code}${e.reason?` ${e.reason}`:``}）`)):this.#n.exit()))},t.onerror=()=>{if(e===this.#D&&(this.#t.onError(`WebSocket 连接出错`),this.#n.error(),this.stopMic(),this.#t.onVoice(`idle`),this.#i===t)){this.#i=null;try{t.close()}catch{}}},t.onmessage=e=>{try{this.#J(JSON.parse(e.data))}catch{}}}stopVoice(){this.#pe();let e=!!this.#i;if(this.#D++,this.#O=!0,this.#ie(!0),this.#e.discardLive(),this.#e.setListening(!1),this.#e.setThinking(!1),this.#B={responseOpen:!1,pending:!1,gen:0,pendingGen:-1,toolsInFlight:0,toolCalls:[]},this.#A=!1,this.#I=!1,this.#C=!1,this.#v=!1,this.stopMic(),this.#Te(),this.#Q(),this.#r.setSource(null),e){this.#n.exit();let e=this.#p;window.setTimeout(()=>{this.inCall||this.#p!==e||this.#$()},1300)}else this.#$();if(this.#i){try{this.#i.close()}catch{}this.#i=null}if(this.#a){try{this.#a.close()}catch{}this.#a=null}this.#t.onState(`未连接`),this.#t.onVoice(`idle`)}#K(e,t=1400){let n=++this.#k;this.#t.onState(e),window.setTimeout(()=>{n===this.#k&&this.inCall&&!this.#B.responseOpen&&this.#t.onState(`已连接`,`ok`)},t)}interrupt(){if(!this.inCall&&!this.#A)return!1;let e=this.#B.responseOpen||this.#A,t=this.inCall&&this.#Z();if(!e&&!t)return!1;if(this.#Q(),this.#ie(!0),this.#e.setThinking(!1),this.#v=!1,this.#B.responseOpen=!1,this.#B.pending=!1,e){let e=this.#a&&this.#a.readyState===1,t=this.#A&&e?this.#a:this.#i;if(t?.readyState===1)try{t.send(JSON.stringify({type:`response.cancel`}))}catch{}}return this.#A=!1,this.#K(t?`— 已打断 —`:`— 已取消 —`),this.#e.pulse(.35),this.inCall&&this.#t.onVoice(`user`),!0}#q(){this.#i&&this.#i.readyState===1&&this.#i.send(JSON.stringify({type:`session.update`,session:{modalities:[`text`,`audio`],voice:`longanqian`,instructions:st,tools:Ae,input_audio_transcription:{model:`qwen3-asr-flash-realtime`,language:`zh`},enable_speech_emotion:!0,turn_detection:{type:`server_vad`,threshold:.5,silence_duration_ms:800,prefix_padding_ms:300,create_response:!0,interrupt_response:!0}}}))}#J(e){switch(String(e.type||``)){case`session.created`:{if(!this.#i||this.#i.readyState!==1)break;this.#C=!0;let t=e.session||{};this.#w=`session ${(t.id||``).slice(-6)}`,this.#t.onState(`通话中`,`ok`),this.#n.ready(),this.#e.pulse(.9),this.startMic();break}case`input_audio_buffer.speech_started`:this.#Q(),this.#v=!0,this.#oe(!0,e.item_id);break;case`input_audio_buffer.speech_stopped`:this.#oe(!1,e.item_id);break;case`input_audio_buffer.committed`:this.#B.gen++;break;case`conversation.item.input_audio_transcription.delta`:{let t=String(e.stash||e.text||``);t&&this.#ue(t,e.item_id,!1);break}case`conversation.item.input_audio_transcription.completed`:{let t=String(e.transcript||e.stash||``);this.#ue(t,e.item_id,!0);break}case`response.created`:this.#t.onVoice(`thinking`),this.#B.responseOpen=!0,this.#v=!1,this.#ee();break;case`response.output_item.added`:{let t=e.item||{};t.type===`function_call`&&t.name&&this.#he(t.name,t.call_id??null);break}case`response.function_call_arguments.done`:this.#ge(e).catch(()=>{});break;case`response.audio_transcript.delta`:this.#re(String(e.delta||``)),this.#t.onVoice(`ai`),this.#r.setSource(`bus`);break;case`response.audio.delta`:if(this.#v)break;if(e.delta){let t=lt(String(e.delta));this.#X(t),this.#L||(this.#L=!0,this.#R=this.#b),this.#t.onVoice(`ai`),this.#r.setSource(`bus`)}break;case`response.done`:{let t=(e.response||{}).status||``;this.#B.responseOpen=!1,t===`cancelled`?(this.#Q(),this.#ie(!0),this.#e.setThinking(!1),this.#K(`— 已打断 —`),this.inCall&&this.#t.onVoice(`user`)):t===`failed`?(this.#t.onError(`本轮生成失败`),this.#n.error(),this.#e.setThinking(!1),this.#ie(!1),this.inCall?this.#t.onVoice(`user`):this.#t.onVoice(`idle`)):(this.#ae(),this.#e.setThinking(!1)),this.#ve();break}case`error`:{let t=String(e.error?.message||JSON.stringify(e));if(/another response is in progress/i.test(t))break;this.#t.onError(t),this.#n.error(),this.#e.setThinking(!1),this.#B.responseOpen=!1,this.#t.onVoice(this.inCall?`user`:`idle`);break}}}#Y(){if(!this.#p){let e=window.AudioContext||window.webkitAudioContext;if(!e)return null;this.#p=new e({sampleRate:tt}),this.#m=this.#p.createGain(),this.#m.connect(this.#p.destination);let t=this.#p.createAnalyser();t.fftSize=1024,t.smoothingTimeConstant=.6,this.#m.connect(t);let n={analyser:t,ctx:this.#p};this.#r.attach(`bus`,n)}return this.#p.state===`suspended`&&this.#p.resume().catch(()=>{}),this.#p}#X(e){let t=this.#Y();if(!t||!this.#m)return;let n=t.createBuffer(1,e.length,tt);n.copyToChannel(e,0);let r=t.createBufferSource();r.buffer=n,r.connect(this.#m);let i=this.#h>t.currentTime?this.#h:t.currentTime+nt;r.start(i),this.#h=i+n.duration,this.#b=i,this.#g.add(r),r.onended=()=>{this.#g.delete(r)},this.#_||=window.setInterval(()=>{this.#p&&this.#p.currentTime>=this.#h-.05&&(window.clearInterval(this.#_),this.#_=0,this.#e.voiceState===`ai`&&(this.#t.onVoice(`user`),this.#r.setSource(`mic`)),this.#ie(!1))},120)}#Z(){return this.#y&&performance.now()<this.#y?!0:!!(this.#p&&this.#h>this.#p.currentTime+.02)}#Q(){for(let e of this.#g)try{e.stop()}catch{}this.#g.clear(),this.#_&&=(window.clearInterval(this.#_),0),this.#p&&(this.#h=this.#p.currentTime),this.#y=0}#$(){if(this.#Q(),this.#p){try{this.#p.close()}catch{}this.#p=null,this.#m=null,this.#h=0}this.#r.attach(`bus`,null)}#ee(){this.#te(),this.#F=``,this.#I=!0,this.#L=!1,this.#R=null}#te(){this.#z&&=(window.clearInterval(this.#z),0)}#ne(){if(!this.#I||!this.#F||!this.#L||this.#R==null||!this.#p)return;let e=Math.max(0,this.#p.currentTime-this.#R),t=y(this.#F).text,n=t.slice(0,Math.min(t.length,Math.floor(e*6.5)));n&&(this.#H||=(this.#e.startStream(),!0),this.#e.setAssistantLive(n))}#re(e){this.#F+=e,this.#I?(this.#z||=window.setInterval(()=>this.#ne(),60),this.#ne()):(this.#e.appendStream(e),this.#H=!0)}#ie(e){if(this.#te(),this.#H||this.#I&&this.#F){let t=y(this.#F);t.charts.length&&this.#me(t.charts,`voice`),this.#I&&t.text&&!e&&this.#e.setAssistantLive(t.text),this.#e.endStream()}this.#H=!1,this.#I=!1,this.#L=!1,this.#R=null,this.#F=``}#ae(){let e=0,t=()=>{++e>120||!this.#Z()?this.#ie(!1):window.setTimeout(t,50)};window.setTimeout(t,50)}#oe(e,t){e?(this.#H&&this.#ie(!0),this.#e.discardLive(),this.#e.setThinking(!1),this.#e.setListening(!0),this.#t.onVoice(`user`),this.#r.setSource(`mic`),this.#se=!1,this.#ce=t,window.setTimeout(()=>{this.#de(t)},4e3)):(this.#e.setListening(!1),this.#e.setThinking(!0),this.inCall&&this.#e.voiceState!==`thinking`&&this.#t.onVoice(`thinking`))}#se=!1;#ce;#le;#ue(e,t,n){n&&t&&t===this.#le||(this.#se=!0,this.#ce=t,this.#e.setListening(!1),this.#e.beginLive(`user`),this.#e.setLive(e||`没听清`),n&&(this.#e.commitLive(e||`没听清`),this.#le=t))}#de(e){this.#se||e!==this.#ce||(this.#e.setListening(!1),this.#e.commitLive(`没听清`),this.#le=e)}#fe(e){if(!Le())return;if(!Be(e)){this.log(`chart_skip`,{q:e.slice(0,60)});return}this.#j?.abort();let t=new AbortController;this.#j=t;let n=++this.#M,r=performance.now();this.log(`chart_request`,{q:e.slice(0,60)}),ze(e,22,t.signal).then(e=>{if(t.signal.aborted||n!==this.#M)return;let i=Math.round(performance.now()-r),a=y(String(e.answer||``));a.charts.length?(this.log(`chart_ready`,{ok:!0,ms:i,count:a.charts.length}),this.#me(a.charts,`side`)):this.log(`chart_ready`,{ok:!1,ms:i,reason:`no_chart_block`})}).catch(e=>{t.signal.aborted||this.log(`chart_ready`,{ok:!1,ms:Math.round(performance.now()-r),err:String(e?.message||e)})})}#pe(){this.#M++,this.#j?.abort(),this.#j=null}#me(e,t){e.length&&(this.#e.dispatchEvent(new CustomEvent(`orb:visuals`,{detail:{charts:e,source:t??`tool`},bubbles:!0,composed:!0})),this.log(`visuals`,{count:e.length,kinds:e.map(e=>e.kind),source:t??`tool`}))}#he(e,t){let n=je[e]||e;this.#e.addToolChip(e,t,n),this.#t.onVoice(`thinking`)}async#ge(e,t=this.#i,n=this.#B){let r=String(e.name||``),i=e.call_id||null,a={};try{a=JSON.parse(String(e.arguments||`{}`))}catch{}this.#H&&this.#ie(!1),n.toolsInFlight++,r===`query_company_policy`&&this.#fe(String(a.topic||``));let o=``,s=!0;try{o=await Ve(r,a,{tool:()=>{Me.has(r)&&this.#n.tool()}})}catch(e){o=`（查询失败，请稍后再问一次）`,s=!1,this.#t.onError(`工具失败：${String(e?.message||e)}`)}finally{n.toolsInFlight=Math.max(0,n.toolsInFlight-1)}(o.startsWith(`（查询失败`)||o.startsWith(`（没有名为`))&&(s=!1),this.#e.finishToolChip(r,s,i,je[r]||r),this.#e.pulse(s?.45:.3);let c=y(o);c.charts.length&&this.#me(c.charts,r);let l=c.text||`（数据已整理好，请用一两句话概括结论。）`;t&&t.readyState===1&&(t.send(JSON.stringify({type:`conversation.item.create`,item:{type:`function_call_output`,call_id:i,output:l}})),n.pending=!0,n.pendingGen=n.gen,this.#ve(t,n))}#_e(e,t){return!e||e.readyState!==1||t.responseOpen||t.toolsInFlight>0?!1:(e.send(JSON.stringify({type:`response.create`})),t.responseOpen=!0,t.pending=!1,!0)}#ve(e=this.#i,t=this.#B){t.pending&&(t.pendingGen===t.gen?this.#_e(e,t):t.pending=!1)}#ye(){let e=this.#f?{deviceId:{exact:this.#f}}:{},t=[];return t.push({...e,channelCount:1}),this.#T&&t.push({...e,channelCount:1,echoCancellation:!0,noiseSuppression:!0,autoGainControl:!0}),this.#T&&t.push({...e,echoCancellation:!0,noiseSuppression:!0}),this.#f&&t.push({deviceId:{exact:this.#f}}),[...t.map(e=>({audio:e,video:!1})),{audio:!0,video:!1}]}async#be(){if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){let e=Error(`当前浏览器/上下文不支持 getUserMedia`);throw e.name=window.isSecureContext?`NotReadableError`:`SecurityError`,e}let e=this.#ye(),t=null;for(let n=0;n<e.length;n++)try{return await navigator.mediaDevices.getUserMedia(e[n])}catch(e){t=e;let n=e.name;if(n===`NotAllowedError`||n===`PermissionDeniedError`||n===`NotFoundError`||n===`DevicesNotFoundError`)throw e;await new Promise(e=>window.setTimeout(e,220))}throw t||Error(`未知原因`)}#xe(){let e=window.AudioContext||window.webkitAudioContext;try{return new e({sampleRate:b})}catch{return new e}}async startMic(){if(this.#o)return;let e=this.#D,t;try{t=await this.#be()}catch(t){if(e!==this.#D)return;let n=t.name||`MicError`;this.#t.onError(`麦克风不可用【${n}】：${t.message||t}`),this.#n.error(),this.stopVoice();return}if(e!==this.#D||!this.inCall)t.getTracks().forEach(e=>e.stop());else try{this.#s=t;let e=this.#xe();this.#c=e,e.state===`suspended`&&await e.resume();let n=e.createMediaStreamSource(t);this.#u=n,this.#x=[],this.#S=0,this.#Te(),this.#o=!0;let r=e.createAnalyser();r.fftSize=1024,r.smoothingTimeConstant=.6,n.connect(r),this.#r.attach(`mic`,{analyser:r,ctx:e}),this.#r.setSource(this.#e.voiceState===`ai`?`bus`:`mic`),this.#r.start(),await this.#Se(e,n),this.#t.onState(`已连接`,`ok`),t.getAudioTracks()[0]&&this.#e.voiceState!==`ai`&&this.#t.onVoice(`user`)}catch(e){this.stopMic(),this.#t.onError(`音频初始化失败：${e.message||e}`),this.#n.error()}}async#Se(e,t){let n=Math.max(1600,Math.round(e.sampleRate*.1));if(e.audioWorklet&&typeof AudioWorkletNode<`u`)try{await e.audioWorklet.addModule(`mic-capture-worklet.js`);let r=new AudioWorkletNode(e,`pet-mic-capture`,{numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[1],processorOptions:{chunkSamples:n}});r.port.onmessage=t=>{let n=t.data;n&&n.type===`chunk`&&n.samples&&this.#Ce(n.samples,e.sampleRate)};let i=e.createGain();i.gain.value=0,t.connect(r),r.connect(i),i.connect(e.destination),this.#l=r,this.#d=i,r.port.postMessage({command:`start`});return}catch{}let r=e.createScriptProcessor(4096,1,1);r.onaudioprocess=t=>{this.#o&&this.#Ce(t.inputBuffer.getChannelData(0),e.sampleRate)};let i=e.createGain();i.gain.value=0,t.connect(r),r.connect(i),i.connect(e.destination),this.#l=r,this.#d=i}#Ce(e,t){if(!this.#o)return;let n=t===b?e:ut(e,t,b);if(n.length){if(this.#x.push(n),this.#S+=n.length,this.#Z())this.#W||=(this.#Te(),!0);else{this.#W&&=!1;try{this.#Ee(n)}catch{}}this.#S>=Math.round(b*this.#E/1e3)&&this.#we()}}#we(){if(!this.#i||this.#i.readyState!==1||!this.#C){this.#x=[],this.#S=0;return}let e=new Float32Array(this.#S),t=0;for(let n of this.#x)e.set(n,t),t+=n.length;this.#x=[],this.#S=0;let n=v.upGate===!0&&this.#Z()?new Float32Array(e.length):e;try{this.#i.send(JSON.stringify({type:`input_audio_buffer.append`,audio:ct(n)}))}catch{}}stopMic(){this.#o=!1;let e=this.#l;if(e){if(`port`in e)try{e.port.postMessage({command:`stop`}),e.port.onmessage=null}catch{}try{e.onaudioprocess=null}catch{}try{e.disconnect()}catch{}this.#l=null}if(this.#d){try{this.#d.disconnect()}catch{}this.#d=null}if(this.#u){try{this.#u.disconnect()}catch{}this.#u=null}this.#c&&=(this.#c.close().catch(()=>{}),null),this.#s&&=(this.#s.getTracks().forEach(e=>e.stop()),null),this.#r.attach(`mic`,null),this.#r.stop(),this.#x=[],this.#S=0,this.#Te()}#Te(){this.#U={noise:.004,active:!1,voiceRun:0,lastVoice:0,len:0,frames:0,pre:[],preLen:0}}#Ee(e){if(!this.#C||!this.#o)return;let t=dt(e),n=performance.now();this.#U.active||(this.#U.noise=this.#U.noise*.94+t*.06);let r=t>Math.max(.016,Math.min(this.#U.noise*3,.09));!this.#U.active&&(r?(this.#U.voiceRun++,this.#U.voiceRun>=3&&(this.#U.active=!0,this.#U.voiceRun=0,this.#U.len=0,this.#U.frames=0,this.#U.lastVoice=n,this.#e.voiceState!==`user`&&this.#t.onVoice(`user`))):this.#U.voiceRun=0,!this.#U.active)||(this.#U.len+=e.length,this.#U.frames++,r&&(this.#U.lastVoice=n),(n-this.#U.lastVoice>800||this.#U.len/b>=30)&&this.#Te())}async askText(e){let t=this.#N.then(()=>this.#De(e));return this.#N=t.catch(()=>{}),t}async#De(e){this.#H&&this.#ie(!0);let t=this.inCall;if(t&&(this.#B.responseOpen||this.#Z())){if(this.#Q(),this.#ie(!0),this.#B.responseOpen&&this.#i?.readyState===1)try{this.#i.send(JSON.stringify({type:`response.cancel`}))}catch{}this.#B.responseOpen=!1}t||this.#t.onVoice(`thinking`),this.#e.setThinking(!0),this.#A=!0;let n=this.#D;try{let n=``;if(await this.#Oe(async r=>{if(this.#a!==r||r.readyState!==1)throw Error(`text_ws_closed`);this.#P||=(r.send(JSON.stringify({type:`session.update`,session:{modalities:[`text`,`audio`],voice:`longanqian`,instructions:st,tools:Ae,turn_detection:null}})),!0);let i=this.#V,a=``,o=null,s=!1;await new Promise((c,l)=>{let u=!1,d=()=>{u||(u=!0,f(),l(Error(`text_ws_closed`)))},f=()=>{r.removeEventListener(`message`,h),r.removeEventListener(`close`,d)},p=()=>{u||(u=!0,f(),c())},m=e=>{u||(u=!0,f(),l(e))},h=e=>{let c;try{c=JSON.parse(e.data)}catch{return}let l=String(c.type||``);switch(l){case`response.created`:i.responseOpen=!0,s=!0,this.#e.setThinking(!1),!t&&this.#e.voiceState!==`ai`&&this.#t.onVoice(`thinking`);break;case`response.audio_transcript.delta`:case`response.text.delta`:case`response.audio_transcript.done`:case`response.text.done`:if(l.endsWith(`.delta`)?a+=String(c.delta||``):a||=String(c.transcript||c.text||``),!a)break;this.#e.setThinking(!1),this.#H||=(this.#e.startStream(),!0),this.#e.setAssistantLive(y(a).text),!t&&this.#e.voiceState!==`ai`&&this.#t.onVoice(`ai`);break;case`response.output_item.added`:{let e=c.item||{};e.type===`function_call`&&e.name&&this.#he(e.name,e.call_id??null);break}case`response.function_call_arguments.done`:o=this.#ge(c,r,i),o.catch(()=>{});break;case`response.done`:{if(i.responseOpen=!1,String(c.response?.status||``)===`failed`){m(Error(`本轮生成失败`));return}let e=o;o=null,(e?e.then(()=>void 0).catch(()=>void 0):Promise.resolve()).then(()=>{u||i.toolsInFlight>0||i.pending&&this.#_e(r,i)||i.responseOpen||(n=a,p())});break}case`error`:{let e=String(c.error?.message||`api_error`);if(/another response is in progress/i.test(e)){i.responseOpen=!0;break}m(Error(e));break}}};r.addEventListener(`message`,h),r.addEventListener(`close`,d),(()=>{if(i.responseOpen&&r.readyState===1){try{r.send(JSON.stringify({type:`response.cancel`}))}catch{}i.responseOpen=!1}r.send(JSON.stringify({type:`conversation.item.create`,item:{type:`message`,role:`user`,content:[{type:`input_text`,text:e}]}})),this.#_e(r,i)})(),window.setTimeout(()=>{!s&&!u&&m(Error(`timeout`))},3e4)})}),n){let e=y(n);e.charts.length&&this.#me(e.charts,`text`)}}catch(e){let t=e.message||String(e);t!==`text_ws_closed`&&this.#t.onError(`文字链路失败：${t}`)}finally{this.#A=!1,this.#e.setThinking(!1),n===this.#D&&(t?this.inCall&&!this.#Z()&&this.#e.voiceState!==`user`&&this.#t.onVoice(`user`):this.#t.onVoice(`idle`)),this.#ie(!1)}}async#Oe(e){if(this.#a&&this.#a.readyState===1)return e(this.#a);if(this.#a)try{this.#a.close()}catch{}let t=new WebSocket(S(`text`));this.#a=t,this.#P=!1,this.#V={responseOpen:!1,pending:!1,gen:0,pendingGen:-1,toolsInFlight:0},await new Promise((e,n)=>{t.onopen=()=>e(),t.onerror=()=>n(Error(`text_ws_error`))});try{return await e(t)}catch(e){try{t.close()}catch{}throw this.#a===t&&(this.#a=null),e}}#ke=null;#Ae=[];#je=0;#Me=0;#Ne=v.log;setLogEnabled(e){this.#Ne=e}log(e,t,n=`info`){if(!this.#Ne)return;let r={seq:++this.#Me,t:Date.now(),iso:new Date().toISOString(),evt:e,level:n,data:t??null};this.#Ae.push(r),this.#je||=window.setTimeout(()=>this.flushLog(),1200)}#Pe(){if(!(this.#ke&&this.#ke.readyState<=1))try{let e=new WebSocket(S(`log`));this.#ke=e,e.onopen=()=>this.flushLog(),e.onclose=()=>{this.#ke=null},e.onerror=()=>{}}catch{}}flushLog(){if(this.#je=0,!this.#Ae.length)return;if(!this.#ke||this.#ke.readyState!==1){this.#Pe();return}let e=this.#Ae.splice(0);try{this.#ke.send(JSON.stringify(e))}catch{this.#Ae=e.concat(this.#Ae)}}dispose(){this.#a=null,this.#Ne=!1,this.#r.stop()}},C=`ai-orb/voice`,pt=`ai-orb/sync`,mt=2e3,ht=6e3,gt=class{#e;#t=`solo`;#n=!1;#r=null;#i=null;#a=null;#o=0;#s=null;#c=!1;constructor(e){this.#e=e}get role(){return this.#t}get isLeader(){return this.#n}listen(){this.#l()}async acquire(){if(this.#l(),this.#n)return!0;if(!this.#i){let e=await this.#p();return this.#f(e),e}let e=this.#i;return new Promise(t=>{e.request(C,{ifAvailable:!0},e=>e?(this.#f(!0),t(!0),new Promise(e=>{this.#s=e,this.#a=()=>e()})):(t(!1),Promise.resolve())).catch(()=>t(!1))})}release(){if(!this.#n)return;let e=this.#a;this.#a=null,this.#s=null,this.#f(!1),e?.(),this.#u({kind:`release`}),this.#o&&=(window.clearInterval(this.#o),0);try{this.#t!==`solo`&&localStorage.removeItem(`${C}/heartbeat`)}catch{}}async requestTakeover(){this.#l(),this.#u({kind:`takeover`});for(let e=0;e<12;e++)if(await new Promise(e=>window.setTimeout(e,120)),await this.acquire())return!0;return!1}post(e){this.#n&&this.#u(e)}postAsAny(e){this.#u(e)}dispose(){this.release(),this.#r?.close(),this.#r=null}#l(){if(this.#c)return;if(this.#c=!0,typeof BroadcastChannel<`u`)try{let e=new BroadcastChannel(pt);e.onmessage=e=>this.#d(e.data),this.#r=e}catch{}let e=navigator.locks;this.#i=e??null,e?this.#t=`follower`:(this.#t=`solo`,this.#e.onRole(`solo`,!1))}#u(e){try{this.#r?.postMessage(e)}catch{}}#d(e){e&&typeof e==`object`&&(e.kind===`takeover`?this.#n&&(this.release(),this.#e.onTakeoverRequested()):(e.kind,this.#e.onSync(e)))}#f(e){this.#n=e;let t=this.#i?e?`leader`:`follower`:`solo`;this.#t=t,this.#e.onRole(t,e)}async#p(){let e=`${C}/heartbeat`,t=0;try{t=Number(localStorage.getItem(e)||0)}catch{t=0}if(Date.now()-t<ht)return this.#t=`follower`,!1;let n=()=>{try{localStorage.setItem(e,String(Date.now()))}catch{}};return n(),this.#o=window.setInterval(n,mt),window.addEventListener(`pagehide`,()=>{if(this.#n)try{localStorage.removeItem(e)}catch{}},{once:!0}),!0}},w=new Map;function T(e){if(!e.kind)throw Error(`[spatial] renderer.kind 不能为空`);w.set(e.kind,e)}function _t(e){return w.get(e)??null}var vt={min:[240,160],interaction:`none`,cost:`low`,fullscreen:!1};function yt(e){return w.get(e)?.capabilities??vt}function bt(e){let t=document.createElement(`div`);return t.className=`sp-fallback`,t.textContent=`未注册的展示类型：${e}`,{el:t,update(){},dispose(){t.remove()}}}function E(e){return typeof e==`object`&&e&&!Array.isArray(e)?e:null}function D(e){let t=document.createElement(`div`);return t.className=`sp-empty`,t.textContent=e,t}function xt(e){let t=E(e);if(!t||!Array.isArray(t.columns)||!Array.isArray(t.rows))return null;let n=t.columns.flatMap(e=>{let t=E(e);return!t||typeof t.key!=`string`?[]:[{key:t.key,label:typeof t.label==`string`?t.label:t.key,align:t.align===`right`||t.align===`center`?t.align:`left`}]});return n.length?{columns:n,rows:t.rows.filter(e=>E(e)!=null)}:null}function St(e){let t=E(e);if(t&&typeof t.text==`string`){let e=document.createElement(`span`);return e.className=`sp-badge`,e.dataset.tone=typeof t.tone==`string`?t.tone:`idle`,e.textContent=t.text,e}return e==null?`—`:String(e)}var Ct=class{el;#e;#t;#n;#r=``;constructor(){this.el=document.createElement(`div`),this.el.className=`sp-table`,this.#e=document.createElement(`table`),this.#t=document.createElement(`thead`),this.#n=document.createElement(`tbody`),this.#e.append(this.#t,this.#n),this.el.append(this.#e)}update(e){let t=xt(e.data),n=JSON.stringify(t??e.data??null);if(n===this.#r)return;if(this.#r=n,!t){this.#t.replaceChildren(),this.#n.replaceChildren(),this.el.replaceChildren(D(`表格数据需要 { columns, rows }`));return}(!this.el.firstElementChild||this.el.firstElementChild.className===`sp-empty`)&&this.el.replaceChildren(this.#e);let r=document.createElement(`tr`);for(let e of t.columns){let t=document.createElement(`th`);t.textContent=e.label,t.style.textAlign=e.align??`left`,r.append(t)}this.#t.replaceChildren(r),this.#n.replaceChildren();for(let e of t.rows){let n=document.createElement(`tr`);for(let r of t.columns){let t=document.createElement(`td`);t.style.textAlign=r.align??`left`;let i=St(e[r.key]);typeof i==`string`?t.textContent=i:t.append(i),n.append(t)}this.#n.append(n)}}dispose(){this.el.remove()}},wt={kind:`table`,capabilities:{min:[280,170],pref:[520,320],max:[1200,1400],interaction:`hover`,cost:`low`,fullscreen:!0},create:()=>new Ct};function Tt(e){let t=E(e);return!t||!Array.isArray(t.items)?null:t.items.flatMap(e=>{let t=E(e);return!t||typeof t.label!=`string`?[]:[{label:t.label,value:typeof t.value==`string`||typeof t.value==`number`?String(t.value):`—`,delta:typeof t.delta==`string`?t.delta:void 0,tone:t.tone===`up`||t.tone===`down`?t.tone:`flat`,hint:typeof t.hint==`string`?t.hint:void 0}]})}var Et=class{el;#e=``;constructor(){this.el=document.createElement(`div`),this.el.className=`sp-cards`}update(e){let t=Tt(e.data),n=JSON.stringify(t??e.data??null);n!==this.#e&&(this.#e=n,!t||!t.length?this.el.replaceChildren(D(`卡片数据需要 { items: [...] }`)):this.el.replaceChildren(...t.map(e=>{let t=document.createElement(`div`);t.className=`sp-card`;let n=document.createElement(`div`);n.className=`sp-card-label`,n.textContent=e.label;let r=document.createElement(`div`);if(r.className=`sp-card-value`,r.textContent=e.value,t.append(n,r),e.delta){let n=document.createElement(`div`);n.className=`sp-card-delta`,n.dataset.tone=e.tone??`flat`,n.textContent=e.delta,t.append(n)}if(e.hint){let n=document.createElement(`div`);n.className=`sp-card-hint`,n.textContent=e.hint,t.append(n)}return t})))}dispose(){this.el.remove()}},Dt={kind:`cards`,capabilities:{min:[190,130],pref:[300,240],max:[900,900],interaction:`hover`,cost:`low`,fullscreen:!0},create:()=>new Et};function Ot(e){if(typeof e==`string`)return{paragraphs:[e],bullets:[]};let t=E(e);return t?{paragraphs:Array.isArray(t.paragraphs)?t.paragraphs.filter(e=>typeof e==`string`).slice(0,20):[],bullets:Array.isArray(t.bullets)?t.bullets.filter(e=>typeof e==`string`).slice(0,24):[]}:{paragraphs:[],bullets:[]}}var kt=class{el;#e=``;constructor(){this.el=document.createElement(`div`),this.el.className=`sp-text`}update(e){let t=Ot(e.data),n=JSON.stringify(t);if(n!==this.#e){this.#e=n,this.el.replaceChildren();for(let e of t.paragraphs){let t=document.createElement(`p`);t.textContent=e,this.el.append(t)}if(t.bullets.length){let e=document.createElement(`ul`);for(let n of t.bullets){let t=document.createElement(`li`);t.textContent=n,e.append(t)}this.el.append(e)}!t.paragraphs.length&&!t.bullets.length&&this.el.append(D(`暂无文本内容`))}}dispose(){this.el.remove()}},At={kind:`text`,capabilities:{min:[220,120],pref:[360,260],max:[1e3,1600],interaction:`none`,cost:`low`,fullscreen:!0},create:()=>new kt},jt=`http://www.w3.org/2000/svg`;function Mt(e){return typeof e==`object`&&e&&!Array.isArray(e)?e:null}function Nt(e){let t=Mt(e);if(!t||!Array.isArray(t.labels)||!Array.isArray(t.series))return null;let n=t.labels.filter(e=>typeof e==`string`).slice(0,64),r=t.series.flatMap(e=>{let t=Mt(e);if(!t||!Array.isArray(t.values))return[];let r=t.values.slice(0,n.length).map(e=>{let t=typeof e==`number`?e:Number(e);return Number.isFinite(t)?t:0});return r.length?[{name:typeof t.name==`string`?t.name:`系列`,values:r,color:typeof t.color==`string`?t.color:void 0}]:[]});return!n.length||!r.length?null:{labels:n,series:r,unit:typeof t.unit==`string`?t.unit:void 0}}function O(e){return document.createElementNS(jt,e)}function Pt(e){if(!Number.isFinite(e)||e<=0)return 1;let t=10**Math.floor(Math.log10(e)),n=e/t;return(n<=1?1:n<=2?2:n<=5?5:10)*t}function k(e){return Math.abs(e)>=1e4?`${Math.round(e/1e3)}k`:Math.abs(e)>=100?String(Math.round(e)):Number.isInteger(e)?String(e):e.toFixed(1)}function A(e,t,n,r){let i=O(`defs`),a=O(`linearGradient`);a.setAttribute(`id`,t),a.setAttribute(`x1`,`0`),a.setAttribute(`y1`,`0`),a.setAttribute(`x2`,r?`0`:`1`),a.setAttribute(`y2`,r?`1`:`0`);for(let[e,t]of[[`0`,`0.55`],[`1`,`0.08`]]){let r=O(`stop`);r.setAttribute(`offset`,e),r.setAttribute(`stop-color`,n),r.setAttribute(`stop-opacity`,t),a.append(r)}i.append(a),e.append(i)}function Ft(e,t){return t||`var(--sp-series-${e%4+1})`}function It(e){return{x:46,y:12,w:Math.max(40,e.w-46-10),h:Math.max(40,e.h-12-30)}}function Lt(e,t,n,r){let i=It(n),a=O(`line`);a.setAttribute(`x1`,String(i.x)),a.setAttribute(`x2`,String(i.x+i.w)),a.setAttribute(`y1`,String(i.y+i.h)),a.setAttribute(`y2`,String(i.y+i.h)),a.setAttribute(`stroke`,`var(--sp-line)`),a.setAttribute(`stroke-width`,`1`),e.append(a);for(let[t,n]of[[0,i.y+i.h],[r,i.y]]){let r=O(`text`);r.setAttribute(`x`,String(i.x-10)),r.setAttribute(`y`,(n+3.5).toFixed(1)),r.setAttribute(`text-anchor`,`end`),r.setAttribute(`font-size`,`10`),r.setAttribute(`letter-spacing`,`0.06em`),r.setAttribute(`fill`,`var(--sp-faint)`),r.textContent=k(t),e.append(r)}let o=t.labels.length-1,s=new Set([0,Math.floor(o/2),o]),c=i.w/Math.max(1,t.labels.length);return t.labels.forEach((t,n)=>{if(!s.has(n))return;let r=O(`text`),a=n===0?`start`:n===o?`end`:`middle`,l=n===0?i.x:n===o?i.x+i.w:i.x+c*(n+.5);r.setAttribute(`x`,l.toFixed(1)),r.setAttribute(`y`,String(i.y+i.h+18)),r.setAttribute(`text-anchor`,a),r.setAttribute(`font-size`,`10`),r.setAttribute(`letter-spacing`,`0.06em`),r.setAttribute(`fill`,`var(--sp-faint)`),r.textContent=t,e.append(r)}),i}function Rt(e,t,n,r,i){let a=O(`circle`);a.setAttribute(`cx`,t.toFixed(1)),a.setAttribute(`cy`,n.toFixed(1)),a.setAttribute(`r`,`5`),a.setAttribute(`fill`,`none`),a.setAttribute(`stroke`,`var(--sp-accent)`),a.setAttribute(`stroke-width`,`1.4`),a.setAttribute(`opacity`,`0.55`),e.append(a);let o=O(`circle`);o.setAttribute(`cx`,t.toFixed(1)),o.setAttribute(`cy`,n.toFixed(1)),o.setAttribute(`r`,`2.4`),o.setAttribute(`fill`,`var(--sp-accent)`),e.append(o);let s=O(`text`);s.setAttribute(`x`,t.toFixed(1)),s.setAttribute(`y`,(n-14).toFixed(1)),s.setAttribute(`text-anchor`,`middle`),s.setAttribute(`font-size`,`11`),s.setAttribute(`font-weight`,`500`),s.setAttribute(`fill`,`var(--sp-text)`),s.textContent=i?`${k(r)}${i}`:k(r),e.append(s)}var zt=class{el;svgEl;legend;#e=``;constructor(){this.el=document.createElement(`div`),this.el.className=`sp-chart`,this.legend=document.createElement(`div`),this.legend.className=`sp-legend`,this.svgEl=O(`svg`),this.svgEl.classList.add(`sp-svg`),this.el.append(this.legend,this.svgEl)}update(e,t){let n=Nt(e.data),r=`${t.w}x${t.h}:${JSON.stringify(n??e.data??null)}`;if(r===this.#e)return;if(this.#e=r,this.legend.replaceChildren(),this.svgEl.replaceChildren(),!n){let e=document.createElement(`div`);e.className=`sp-empty`,e.textContent=`图表数据需要 { labels, series }`,this.el.replaceChildren(e);return}this.el.firstElementChild?.classList.contains(`sp-empty`)&&this.el.replaceChildren(this.legend,this.svgEl);let i=Math.max(120,Math.round(t.w)),a=Math.max(100,Math.round(t.h));if(this.svgEl.setAttribute(`width`,String(i)),this.svgEl.setAttribute(`height`,String(a)),this.svgEl.setAttribute(`viewBox`,`0 0 ${i} ${a}`),n.unit){let e=document.createElement(`span`);e.className=`sp-unit`,e.textContent=n.unit,this.legend.append(e)}n.series.forEach((e,t)=>{let n=document.createElement(`span`);n.className=`sp-legend-item`;let r=document.createElement(`i`);r.style.background=Ft(t,e.color),n.append(r,document.createTextNode(e.name)),this.legend.append(n)});let o=Pt(Math.max(...n.series.flatMap(e=>e.values)));this.draw(n,t,o)}dispose(){this.el.remove()}},Bt=class extends zt{draw(e,t,n){let r=Lt(this.svgEl,e,t,n),i=r.w/e.labels.length,a=Math.min(i*.58,34*e.series.length),o=Math.max(3,a/e.series.length-3);e.series.forEach((e,t)=>{A(this.svgEl,`sp-grad-bar-${t}`,`var(--sp-series-${t%4+1})`,!0)});let s={value:-1,x:0,y:0};e.labels.forEach((t,c)=>{e.series.forEach((e,t)=>{let l=Math.max(0,e.values[c]??0),u=n>0?l/n*r.h:0,d=r.x+i*c+(i-a)/2+t*(o+3),f=r.y+r.h-u,p=O(`rect`);p.setAttribute(`x`,d.toFixed(1)),p.setAttribute(`y`,f.toFixed(1)),p.setAttribute(`width`,o.toFixed(1)),p.setAttribute(`height`,Math.max(.5,u).toFixed(1)),p.setAttribute(`rx`,String(Math.min(4,o/2))),p.setAttribute(`fill`,t===0?`url(#sp-grad-bar-${t})`:`color-mix(in srgb, var(--sp-series-${t%4+1}) 34%, transparent)`),this.svgEl.append(p),t===0&&l>s.value&&(s={value:l,x:d+o/2,y:f})})}),s.value>=0&&e.series.length&&Rt(this.svgEl,s.x,s.y,s.value,e.unit)}},Vt=class extends zt{draw(e,t,n){let r=Lt(this.svgEl,e,t,n),i=r.w/Math.max(1,e.labels.length-1),a=t=>r.x+i*t+(e.labels.length===1?r.w/2:0),o=e=>r.y+r.h-(n>0?Math.max(0,e)/n*r.h:0);A(this.svgEl,`sp-grad-area`,`var(--sp-series-1)`,!0),A(this.svgEl,`sp-grad-line`,`var(--sp-series-1)`,!1);let s={value:-1/0,x:0,y:0};e.series.forEach((e,t)=>{let n=Ft(t,e.color),i=e.values.map((e,t)=>`${a(t).toFixed(1)},${o(e).toFixed(1)}`);if(t===0){let t=`M ${a(0).toFixed(1)} ${(r.y+r.h).toFixed(1)} L ${i.join(` L `)} L ${a(e.values.length-1).toFixed(1)} ${(r.y+r.h).toFixed(1)} Z`,n=O(`path`);n.setAttribute(`d`,t),n.setAttribute(`fill`,`url(#sp-grad-area)`),this.svgEl.append(n)}let c=O(`polyline`);c.setAttribute(`points`,i.join(` `)),c.setAttribute(`fill`,`none`),c.setAttribute(`stroke`,t===0?`url(#sp-grad-line)`:n),c.setAttribute(`stroke-width`,t===0?`2.2`:`1.2`),c.setAttribute(`stroke-linejoin`,`round`),c.setAttribute(`stroke-linecap`,`round`),c.setAttribute(`opacity`,t===0?`1`:`0.5`),this.svgEl.append(c),t===0&&e.values.forEach((e,t)=>{e>s.value&&(s={value:e,x:a(t),y:o(e)})})}),Number.isFinite(s.value)&&Rt(this.svgEl,s.x,s.y,s.value,e.unit)}},Ht={kind:`bars`,capabilities:{min:[250,170],pref:[640,380],max:[1400,900],interaction:`hover`,cost:`low`,fullscreen:!0},create:()=>new Bt},Ut={kind:`line`,capabilities:{min:[250,170],pref:[640,380],max:[1400,900],interaction:`hover`,cost:`low`,fullscreen:!0},create:()=>new Vt};function Wt(e){return typeof e==`object`&&e&&!Array.isArray(e)?e:null}var Gt=`http://www.w3.org/2000/svg`;function j(e){return document.createElementNS(Gt,e)}function M(e){let t=Math.imul(e^2654435769,2246822507);return t^=t>>>13,t=Math.imul(t,3266489909),t^=t>>>16,(t>>>0)/4294967295}var Kt=class{el;#e;#t;#n;#r=``;constructor(){this.el=document.createElement(`div`),this.el.className=`sp-scene3d`,this.#e=j(`svg`),this.#e.classList.add(`sp-scene3d-svg`),this.#t=document.createElement(`div`),this.#t.className=`sp-scene3d-caption`,this.#n=document.createElement(`div`),this.#n.className=`sp-scene3d-layers`,this.el.append(this.#e,this.#t,this.#n)}update(e,t){let n=Wt(e.data),r=`${t.w}x${t.h}:${JSON.stringify(n??null)}`;if(r===this.#r)return;this.#r=r;let i=typeof n?.caption==`string`?n.caption:e.title??`3D 场景`;this.#t.textContent=i;let a=Array.isArray(n?.layers)?n.layers.filter(e=>typeof e==`string`).slice(0,8):[];this.#n.replaceChildren(...a.map(e=>{let t=document.createElement(`span`);return t.textContent=e,t})),this.#n.hidden=a.length===0,this.#i(t)}#i(e){let t=Math.max(160,Math.round(e.w)),n=Math.max(120,Math.round(e.h));this.#e.setAttribute(`width`,String(t)),this.#e.setAttribute(`height`,String(n)),this.#e.setAttribute(`viewBox`,`0 0 ${t} ${n}`),this.#e.replaceChildren();let r=Math.min(t/11.55,n/8.58,84),i=r*.5,a=t/2,o=n*.46,s=(e,t)=>a+(e-t)*r/2,c=(e,t)=>o+(e+t)*i/2,l=j(`g`);l.setAttribute(`stroke`,`var(--sp-grid)`),l.setAttribute(`stroke-width`,`1`),l.setAttribute(`fill`,`none`);for(let e=0;e<=11;e+=1)for(let t of[0,1]){let n=j(`line`);t===0?(n.setAttribute(`x1`,s(e,0).toFixed(1)),n.setAttribute(`y1`,c(e,0).toFixed(1)),n.setAttribute(`x2`,s(e,11).toFixed(1)),n.setAttribute(`y2`,c(e,11).toFixed(1))):(n.setAttribute(`x1`,s(0,e).toFixed(1)),n.setAttribute(`y1`,c(0,e).toFixed(1)),n.setAttribute(`x2`,s(11,e).toFixed(1)),n.setAttribute(`y2`,c(11,e).toFixed(1))),l.append(n)}this.#e.append(l);let u=[];for(let e=1;e<11;e+=1)for(let t=1;t<11;t+=1){if(M(e*131+t*977)<.52)continue;let n=.35+M(e*37+t*53)*1.5;u.push({gx:e,gy:t,hgt:n,palm:Math.floor(M(e*19+t*71)*4),hot:M(e*7+t*23)>.93})}u.sort((e,t)=>e.gx+e.gy-(t.gx+t.gy));let d=u.reduce((e,t,n)=>t.hot&&(e<0||t.hgt>u[e].hgt)?n:e,-1),f=d>=0?u[d]:null,p=.62;for(let e of u){let t=s(e.gx,e.gy),n=c(e.gx,e.gy),a=r/2*p,o=i/2*p,l=e.hgt*i*1.15,u=e.palm+1,d=f!=null&&e===f,m=j(`g`);m.setAttribute(`opacity`,d?`0.92`:`0.5`);let h=j(`path`);h.setAttribute(`d`,`M ${t-a} ${n} L ${t} ${n+o} L ${t} ${n+o-l} L ${t-a} ${n-l} Z`),h.setAttribute(`fill`,`color-mix(in srgb, var(--sp-series-${u}) 22%, transparent)`),m.append(h);let g=j(`path`);g.setAttribute(`d`,`M ${t+a} ${n} L ${t} ${n+o} L ${t} ${n+o-l} L ${t+a} ${n-l} Z`),g.setAttribute(`fill`,`color-mix(in srgb, var(--sp-series-${u}) 13%, transparent)`),m.append(g);let _=j(`path`);if(_.setAttribute(`d`,`M ${t} ${n-l-o} L ${t+a} ${n-l} L ${t} ${n-l+o} L ${t-a} ${n-l} Z`),_.setAttribute(`fill`,d?`color-mix(in srgb, var(--sp-accent) 78%, transparent)`:`color-mix(in srgb, var(--sp-series-${u}) 40%, transparent)`),m.append(_),d){let e=j(`ellipse`);e.setAttribute(`cx`,String(t)),e.setAttribute(`cy`,String(n+o)),e.setAttribute(`rx`,String(a*1.9)),e.setAttribute(`ry`,String(o*1.6)),e.setAttribute(`fill`,`color-mix(in srgb, var(--sp-accent) 10%, transparent)`),m.insertBefore(e,m.firstChild),this.#e.append(m);let r=j(`text`);r.setAttribute(`x`,String(t)),r.setAttribute(`y`,String(n-l-o-10)),r.setAttribute(`text-anchor`,`middle`),r.setAttribute(`font-size`,`10.5`),r.setAttribute(`letter-spacing`,`0.08em`),r.setAttribute(`fill`,`var(--sp-text)`),r.textContent=`重点区域`,this.#e.append(r)}else this.#e.append(m)}let m=j(`ellipse`);m.setAttribute(`cx`,String(a)),m.setAttribute(`cy`,String(o+11/2*i*.86)),m.setAttribute(`rx`,String(r*2.1)),m.setAttribute(`ry`,String(i*1)),m.setAttribute(`fill`,`none`),m.setAttribute(`stroke`,`color-mix(in srgb, var(--sp-accent) 26%, transparent)`),m.setAttribute(`stroke-width`,`1`),this.#e.append(m)}dispose(){this.el.remove()}},qt={kind:`scene3d`,capabilities:{min:[360,260],pref:[900,560],max:[2200,1600],interaction:`inspect`,cost:`high`,fullscreen:!0},create:()=>new Kt},Jt=class{el;#e;#t=``;constructor(){this.el=document.createElement(`div`),this.el.className=`sp-html`;let e=document.createElement(`span`);e.className=`sp-html-badge`,e.textContent=`沙箱内容`,this.#e=document.createElement(`iframe`),this.#e.setAttribute(`sandbox`,`allow-scripts`),this.#e.setAttribute(`referrerpolicy`,`no-referrer`),this.#e.setAttribute(`loading`,`lazy`),this.#e.title=`AI 生成的交互内容`,this.el.append(e,this.#e)}update(e){let t=Wt(e.data),n=typeof t?.html==`string`?t.html:``;n!==this.#t&&(this.#t=n,this.#e.srcdoc=n||`<!doctype html><meta charset="utf-8"><body style="font:13px system-ui;color:#64748b;display:grid;place-items:center;height:100vh;margin:0">暂无 HTML 内容</body>`)}dispose(){this.#e.srcdoc=``,this.el.remove()}};T(wt),T(Dt),T(At),T(Ht),T(Ut),T(qt),T({kind:`html`,capabilities:{min:[280,180],pref:[600,380],max:[1600,1200],interaction:`inspect`,cost:`medium`,fullscreen:!0},create:()=>new Jt});var Yt=new Set([`companion`,`split-left`,`split-right`,`stage`,`immersive`,`focus`]),Xt=new Set([`focus`,`support`,`ambient`,`control`,`dialogue`]),Zt=new Set([`auto`,`left`,`right`,`center`,`corner`,`rail`]),Qt=new Set([`none`,`hover`,`inspect`,`edit`]),$t=new Set([`turn`,`session`,`pinned`]);function N(e){return typeof e==`object`&&e&&!Array.isArray(e)?e:null}function P(e,t){let n=typeof e==`number`?e:Number(e);return Number.isFinite(n)?n:t}function F(e,t,n){return Math.min(n,Math.max(t,e))}function I(e){if(!Array.isArray(e)||e.length<2)return;let t=P(e[0],NaN),n=P(e[1],NaN);if(Number.isFinite(t)&&Number.isFinite(n))return[F(t,120,2400),F(n,80,2e3)]}function en(e){let t=N(e);if(!t)return;let n={},r=I(t.min),i=I(t.pref),a=I(t.max);return r&&(n.min=r),i&&(n.pref=i),a&&(n.max=a),Object.keys(n).length?n:void 0}function tn(e){let t=N(e);if(!t)return;let n={};if(t.maxAreaPct!=null){let e=P(t.maxAreaPct,1);n.maxAreaPct=F(e>1?e/100:e,.05,1)}return typeof t.fullscreen==`boolean`&&(n.fullscreen=t.fullscreen),t.maxZ!=null&&(n.maxZ=F(Math.round(P(t.maxZ,1)),0,10)),t.ttlMs!=null&&(n.ttlMs=F(Math.round(P(t.ttlMs,0)),0,6e5)),Object.keys(n).length?n:void 0}function nn(e,t){let n=N(e);if(!n)return null;let r=typeof n.id==`string`&&n.id.trim()?n.id.trim().slice(0,80):`surface-${t}`,i=typeof n.kind==`string`&&n.kind.trim()?n.kind.trim().slice(0,60):`text`,a=typeof n.role==`string`&&Xt.has(n.role)?n.role:`support`,o=typeof n.prefer==`string`&&Zt.has(n.prefer)?n.prefer:`auto`,s=typeof n.interaction==`string`&&Qt.has(n.interaction)?n.interaction:`none`,c=typeof n.lifecycle==`string`&&$t.has(n.lifecycle)?n.lifecycle:`turn`;return{id:r,kind:i,role:a,priority:F(Math.round(P(n.priority,2)),0,3),title:typeof n.title==`string`?n.title.slice(0,120):void 0,subtitle:typeof n.subtitle==`string`?n.subtitle.slice(0,200):void 0,prefer:o,size:en(n.size),data:n.data,source:typeof n.source==`string`&&n.source.trim()?n.source.trim().slice(0,40):`inline`,interaction:s,lifecycle:c,permissions:tn(n.permissions),actions:Array.isArray(n.actions)?n.actions.slice(0,12).flatMap(e=>{let t=N(e);if(!t||typeof t.id!=`string`||typeof t.label!=`string`)return[];let n=t.kind===`navigate`||t.kind===`focus`?t.kind:`submit`;return[{id:t.id,label:t.label.slice(0,40),kind:n}]}):void 0,why:typeof n.why==`string`?n.why.slice(0,240):void 0}}function rn(e,t=0){let n=N(e)??{},r=typeof n.mode==`string`&&Yt.has(n.mode)?n.mode:`companion`,i=new Set,a=[],o=Array.isArray(n.surfaces)?n.surfaces.slice(0,24):[];for(let e=0;e<o.length;e++){let t=nn(o[e],e);if(!t)continue;let n=t.id,r=2;for(;i.has(n);)n=`${t.id}-${r++}`;i.add(n),a.push({...t,id:n})}let s=typeof n.focusId==`string`?n.focusId:null,c=s&&i.has(s)?s:null,l=n.chat===`compact`||n.chat===`hidden`?n.chat:`center`,u=n.transition===`gentle`||n.transition===`cinematic`?n.transition:`standard`,d=N(n.orb),f=d?.preferredCorner,p=f===`bl`||f===`tr`||f===`tl`||f===`br`?f:void 0,m=d?{maxDiameterPx:d.maxDiameterPx==null?void 0:F(Math.round(P(d.maxDiameterPx,0)),44,240),pinned:d.pinned===!0,hidden:d.hidden===!0,preferredCorner:p}:void 0;return{rev:Math.max(0,Math.round(P(n.rev,t))),mode:r,surfaces:a,focusId:c,orb:m,chat:l,transition:u,provenance:N(n.provenance),label:typeof n.label==`string`?n.label.slice(0,40):void 0}}var L=14,an=16,on={focus:0,control:1,support:2,ambient:3,dialogue:4};function R(e,t,n){return Math.min(n,Math.max(t,e))}function sn(e){let t=2166136261;for(let n=0;n<e.length;n++)t^=e.charCodeAt(n),t=Math.imul(t,16777619);return t>>>0}function cn(e,t,n=0){return e.x<t.x+t.w+n&&e.x+e.w+n>t.x&&e.y<t.y+t.h+n&&e.y+e.h+n>t.y}function ln(e,t,n){let r=Math.round(n*.46),i=Math.max(240,n-r-16);return e===`split-left`?{focusX:t.left,focusW:r,chatX:t.left+r+16,chatW:i}:{focusX:t.left+i+16,focusW:r,chatX:t.left,chatW:i}}function un(e,t,n,r,i,a){if(e===`companion`)return[];if(e===`split-left`||e===`split-right`){let t=ln(e,n,r);return[{id:`focus`,rect:{x:t.focusX,y:n.top,w:t.focusW,h:i},side:e===`split-left`?`left`:`right`,roles:[`focus`,`support`]}]}if(e===`immersive`){if(a<=1)return[{id:`full`,rect:{x:0,y:0,w:t.w,h:t.h},side:`center`,roles:[`focus`,`support`],allowOrbOverlap:!0}];let e=R(Math.round(t.h*.224),120,200),i=n.left+e+44,o=Math.round((r-e-44)*.6),s=i+o+18,c=Math.max(220,t.w-n.right-s),l=n.top,u=Math.max(220,t.h-n.bottom-l),d=[{id:`main`,rect:{x:i,y:l,w:o,h:u},side:`center`,roles:[`focus`,`support`]}];if(c>=220){let e=Math.floor((u-18)/2);d.push({id:`rail-top`,rect:{x:s,y:l,w:c,h:e},side:`right`,roles:[`support`,`control`]}),d.push({id:`rail-bottom`,rect:{x:s,y:l+e+18,w:c,h:u-e-18},side:`right`,roles:[`support`,`ambient`]})}return d}if(e===`focus`){let e=R(Math.round(r*.64),520,1e3),t=r-e-L,a=i,o=[{id:`focus`,rect:{x:n.left,y:n.top,w:e,h:a},side:`center`,roles:[`focus`,`support`]}];if(t>=220){let r=Math.floor((a-L)/2);o.push({id:`right-top`,rect:{x:n.left+e+L,y:n.top,w:t,h:r},side:`right`,roles:[`support`,`control`]}),o.push({id:`right-bottom`,rect:{x:n.left+e+L,y:n.top+r+L,w:t,h:a-r-L},side:`right`,roles:[`support`,`ambient`]})}return o}let o=R(Math.round(r*.52),540,980),s=n.left+Math.round((r-o)/2),c=Math.floor((r-o-28)/2),l=i,u=[{id:`focus`,rect:{x:s,y:n.top,w:o,h:l},side:`center`,roles:[`focus`,`support`]}];if(c>=200){let e=Math.floor((l-L)/2);u.push({id:`left-top`,rect:{x:n.left,y:n.top,w:c,h:e},side:`left`,roles:[`support`,`control`]}),u.push({id:`left-bottom`,rect:{x:n.left,y:n.top+e+L,w:c,h:l-e-L},side:`left`,roles:[`support`,`ambient`]}),u.push({id:`right-top`,rect:{x:s+o+L,y:n.top,w:c,h:e},side:`right`,roles:[`support`,`control`]}),u.push({id:`right-bottom`,rect:{x:s+o+L,y:n.top+e+L,w:c,h:l-e-L},side:`right`,roles:[`support`,`ambient`]})}return u}function dn(e,t,n,r){let i=r.orb?.maxDiameterPx,a=e=>i?Math.min(e,i):e,o=r.orb?.hidden===!0;if(e===`companion`){let e=a(120);return{x:t.w-n.right-e/2,y:t.h-n.bottom-e/2+12,diameter:e,hidden:o}}let s=a(R(Math.round(t.h*.224),120,200)),c=t.w-n.left-n.right;if(e===`split-left`||e===`split-right`){let r=t.h-n.top-n.bottom,i=ln(e,n,c),a=i.chatX,l=i.chatW,u=a+s/2+12,d=a+l-s/2-12,f=a+l/2;return{x:d>=u?R(f,u,d):u,y:R(n.top+r*.68,n.top+s/2+88,t.h-n.bottom-s/2-64),diameter:s,hidden:o}}return{x:n.left+22+s/2,y:t.h-n.bottom-22-s/2,diameter:s,hidden:o}}function fn(e,t,n,r,i){let a={x:0,y:0,w:0,h:0,composerX:0,composerY:0,composerW:0,mode:`hidden`};if(e===`companion`)return{...a,mode:`center`};if(e===`split-left`||e===`split-right`){let t=ln(e,n,i),a=Math.max(260,Math.min(620,t.chatW-16)),o=t.chatX+(t.chatW-a)/2,s=r.y-r.diameter/2,c=r.y+r.diameter/2;return{x:Math.round(o),y:Math.round(n.top+6),w:Math.round(a),h:Math.round(Math.max(120,s-n.top-36)),composerX:Math.round(o),composerY:Math.round(c+18),composerW:Math.round(a),mode:`center`}}let o=t.h-n.bottom,s=Math.round(o-84-34),c=r.x+r.diameter/2+28,l=Math.max(c,n.left),u=Math.max(320,t.w-n.right-l),d=Math.round(Math.min(760,u)),f=Math.round(l+(u-d)/2);return{x:f,y:s,w:d,h:84,composerX:f,composerY:Math.round(o-34),composerW:d,mode:`compact`}}function pn(e,t,n,r,i,a){if(t.permissions?.fullscreen===!1&&r){let t=Math.round(e.w*.08),n=Math.round(e.h*.08);e={x:e.x+t,y:e.y+n,w:e.w-t*2,h:e.h-n*2}}let o=Math.min(Math.max(160,t.size?.min?.[0]??n.min[0]),Math.max(160,e.w-8)),s=Math.min(Math.max(120,t.size?.min?.[1]??n.min[1]),Math.max(120,e.h-8)),c=Math.min(e.w,t.size?.max?.[0]??n.max?.[0]??1/0),l=Math.min(e.h,t.size?.max?.[1]??n.max?.[1]??1/0);if(c+.5<o||l+.5<s)return null;let u=i?e.w-12:t.size?.pref?.[0]??e.w,d=a?e.h-12:t.size?.pref?.[1]??e.h,f=R(u,o,c),p=R(d,s,l);n.aspect&&n.aspect>0&&(p=R(f/n.aspect,s,l),f=R(p*n.aspect,o,c));let m=t.permissions?.maxAreaPct;if(m&&f*p>m*e.w*e.h){let t=Math.sqrt(m*e.w*e.h/(f*p));f=Math.max(o,f*t),p=Math.max(s,p*t)}return f+.5<o||p+.5<s?null:{x:Math.round(e.x+(e.w-f)/2),y:Math.round(e.y+(e.h-p)/2),w:Math.round(f),h:Math.round(p)}}function mn(e,t,n,r){if(!cn(e,t,0))return e;let i=[];t.y-e.y>=r&&i.push({x:e.x,y:e.y,w:e.w,h:t.y-e.y-L}),t.x-e.x>=n&&i.push({x:e.x,y:e.y,w:t.x-e.x-L,h:e.h});let a=e.y+e.h-(t.y+t.h);a>=r&&i.push({x:e.x,y:t.y+t.h+L,w:e.w,h:a-L});let o=e.x+e.w-(t.x+t.w);o>=n&&i.push({x:t.x+t.w+L,y:e.y,w:o-L,h:e.h});let s=null,c=0;for(let e of i){if(e.w<n||e.h<r||cn(e,t,0))continue;let i=e.w*e.h;i>c&&(s=e,c=i)}return s}function hn(e,t){return!t||t===`auto`||t===e.side||(t===`corner`||t===`rail`)&&e.side!==`center`?0:e.side===`center`?2:1}function gn(e,t){return!!(e.roles.includes(t)||t===`focus`&&e.roles.includes(`support`)||t===`ambient`&&e.roles.includes(`support`))}function _n(e,t){return t?0:e.transition===`gentle`?170:e.transition===`cinematic`?340:220}function vn(e){let{viewport:t,insets:n,scene:r}=e,i=r.mode===`companion`&&r.surfaces.length>0?{...r,mode:`split-right`}:r,a=Math.max(1,t.w-n.left-n.right);Math.max(1,t.h-n.top-n.bottom);let o=dn(i.mode,t,n,i),s=fn(i.mode,t,n,o,a),c=(i.mode===`stage`||i.mode===`focus`)&&s.w>0?s.y-12:t.h-n.bottom,l=Math.max(200,c-n.top),u=un(i.mode,t,n,a,l,i.surfaces.length),d=i.focusId??null,f=[...i.surfaces].sort((e,t)=>{let n=e.id===d?0:1,r=t.id===d?0:1;if(n!==r)return n-r;let i=on[e.role??`support`],a=on[t.role??`support`];return i===a?(e.priority??2)===(t.priority??2)?sn(e.id)-sn(t.id):(e.priority??2)-(t.priority??2):i-a}),p={},m=[],h=new Set,g=[],_={x:o.x-o.diameter/2-an,y:o.y-o.diameter/2-an,w:o.diameter+32,h:o.diameter+32};for(let t of f){if(Object.keys(p).length>=8){m.push(t.id);continue}let n=t.id===d?`focus`:t.role??`support`,r=e.capabilities(t.kind),i=u.filter(e=>!h.has(e.id)&&gn(e,n)).map((e,n)=>({slot:e,index:n,rank:hn(e,t.prefer)})).sort((e,t)=>e.rank-t.rank||e.index-t.index),a=null,o=null;for(let{slot:e}of i){let i=pn(e.rect,t,r,e.id===`full`,n===`focus`,!0);if(!i)continue;let s=e.allowOrbOverlap?i:mn(i,_,Math.max(160,r.min[0]),Math.max(120,r.min[1]));if(s&&!g.some(e=>cn(s,e,L))){a=s,o=e;break}}!a||!o?m.push(t.id):(p[t.id]=a,g.push(a),h.add(o.id))}return{rev:i.rev,mode:i.mode,rects:p,collapsed:m,orb:o,chat:s,transitionMs:_n(i,e.reducedMotion),reason:`mode=${i.mode} focus=${d??`-`} visible=${Object.keys(p).length} collapsed=${m.length}`}}var yn=new Map;function bn(e){if(!e.type)throw Error(`[spatial] source.type 不能为空`);yn.set(e.type,e)}function xn(e){return yn.get(e)??null}bn({type:`inline`,resolve:async e=>e.data}),bn({type:`mock`,resolve:async(e,t)=>(await new Promise((e,n)=>{let r=window.setTimeout(e,420);t.addEventListener(`abort`,()=>{window.clearTimeout(r),n(new DOMException(`aborted`,`AbortError`))},{once:!0})}),e.data)});async function Sn(e,t){let n=xn(e.source??`inline`);return n?n.resolve(e,t):e.data}var Cn=`
<style>
:host {
  position: fixed;
  inset: 0;
  /* 层级必须低于球(4)与对话层(6)：舞台是"桌面"，不是浮在球上面的 HUD */
  z-index: 2;
  pointer-events: none;
  --sp-text: rgba(22, 32, 48, 0.9);
  --sp-dim: rgba(22, 32, 48, 0.56);
  --sp-faint: rgba(22, 32, 48, 0.36);
  --sp-line: rgba(22, 32, 48, 0.08);
  --sp-panel: rgba(255, 255, 255, 0.5);
  --sp-panel-solid: #ffffff;
  --sp-grid: rgba(22, 32, 48, 0.06);
  --sp-accent: #2f6fd0;
  --sp-series-1: #2f6fd0;
  --sp-series-2: #4fa3a0;
  --sp-series-3: #c9a04a;
  --sp-series-4: #9a7bd0;
  --sp-feather: 26px;
  font-family: -apple-system, 'Segoe UI', 'Microsoft YaHei', 'PingFang SC', sans-serif;
}
:host([data-theme='dark']) {
  --sp-text: rgba(238, 242, 248, 0.92);
  --sp-dim: rgba(232, 235, 240, 0.6);
  --sp-faint: rgba(232, 235, 240, 0.38);
  --sp-line: rgba(255, 255, 255, 0.08);
  --sp-panel: rgba(18, 22, 28, 0.42);
  --sp-panel-solid: #12161c;
  --sp-grid: rgba(255, 255, 255, 0.06);
  --sp-accent: #8fd8ff;
  --sp-series-1: #8fd8ff;
  --sp-series-2: #6fd8c0;
  --sp-series-3: #e9c46a;
  --sp-series-4: #c3a6f5;
}

/* ---------------------------------------------------------------
   无边界浮层：没有卡片底、没有描边、没有投影。
   边缘用 mask 羽化，让内容像从模糊背景里浮出来，而不是贴在上面。
   只有文字、数据和一个极淡的径向光晕。
   --------------------------------------------------------------- */
.surface {
  position: absolute;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  padding: 26px 30px 28px;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  color: var(--sp-text);
  pointer-events: auto;
  overflow: hidden;
  contain: layout style;
  will-change: transform, opacity;
  transform-origin: 50% 50%;
  -webkit-mask-image:
    linear-gradient(to right, transparent 0, #000 var(--sp-feather), #000 calc(100% - var(--sp-feather)), transparent 100%),
    linear-gradient(to bottom, transparent 0, #000 var(--sp-feather), #000 calc(100% - var(--sp-feather)), transparent 100%);
  -webkit-mask-composite: source-in;
  mask-image:
    linear-gradient(to right, transparent 0, #000 var(--sp-feather), #000 calc(100% - var(--sp-feather)), transparent 100%),
    linear-gradient(to bottom, transparent 0, #000 var(--sp-feather), #000 calc(100% - var(--sp-feather)), transparent 100%);
  mask-composite: intersect;
}
/* 极淡的色雾：左上和右下各一点，制造"有体积"的错觉 */
.surface::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  background:
    radial-gradient(62% 58% at 22% 8%, color-mix(in srgb, var(--sp-accent) 8%, transparent), transparent 72%),
    radial-gradient(46% 44% at 92% 102%, color-mix(in srgb, var(--sp-accent) 5%, transparent), transparent 70%);
}
.surface > * { position: relative; z-index: 1; }

/* 空间表面里不要可见滚动条：内容该"浮"着，不是"装"在框里 */
.surface ::-webkit-scrollbar { width: 0; height: 0; }
.surface * { scrollbar-width: none; }
.surface[data-entering='1'] { opacity: 0; transform: translateY(10px); }
.surface[data-leaving='1'] { opacity: 0; pointer-events: none; }
.surface[data-role='focus'] { padding: 30px 36px 32px; }
:host([data-mode='immersive']) .surface[data-role='focus'] {
  padding: 34px 44px 36px;
}
:host([data-mode='stage']) .surface[data-role='focus'] {
  padding: 26px 40px 30px;
}

/* 标题：轻声细语，不抢数据 */
.head {
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex: 0 0 auto;
  margin-bottom: 16px;
  min-width: 0;
}
.head .title {
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.12em;
  color: var(--sp-dim);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}
.head .subtitle {
  font-size: 11px;
  color: var(--sp-faint);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}
.head .why {
  margin-left: auto;
  flex: 0 0 auto;
  font-size: 10px;
  letter-spacing: 0.14em;
  color: var(--sp-faint);
  opacity: 0.8;
}
.body {
  flex: 1 1 auto;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* ---- 基础渲染器 ---- */
.sp-empty {
  display: grid;
  place-items: center;
  height: 100%;
  font-size: 12px;
  color: var(--sp-faint);
  text-align: center;
  padding: 12px;
}

/* 表格：只留极淡的行分隔，表头不铺底 */
.sp-table { overflow: auto; flex: 1 1 auto; min-height: 0; }
.sp-table table { width: 100%; border-collapse: collapse; font-size: 13px; }
.sp-table th {
  position: sticky; top: 0; z-index: 1;
  text-align: left; font-weight: 400; color: var(--sp-faint);
  font-size: 10.5px; letter-spacing: 0.14em;
  padding: 0 10px 10px;
  /* 表头只靠一条细线区分，不铺一条白色带子（那会让"无边界"露馅） */
  background: transparent;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  border-bottom: 1px solid var(--sp-line);
  white-space: nowrap;
}
.sp-table td {
  padding: 11px 10px; color: var(--sp-dim);
  border-bottom: 1px solid var(--sp-grid);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 260px;
}
.sp-table td:first-child {
  color: var(--sp-text);
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em;
}
.sp-table tr:last-child td { border-bottom: none; }
.sp-table tbody tr { transition: background-color 160ms ease; }
.sp-table tbody tr:hover { background: color-mix(in srgb, var(--sp-accent) 4%, transparent); }
.sp-badge {
  display: inline-block; padding: 1px 8px; border-radius: 999px; font-size: 11px;
  background: var(--sp-grid); color: var(--sp-dim);
}
.sp-badge[data-tone='ok'] { background: rgba(47, 158, 107, 0.1); color: #2f9e6b; }
.sp-badge[data-tone='warn'] { background: rgba(192, 122, 42, 0.12); color: #c07a2a; }
.sp-badge[data-tone='bad'] { background: rgba(198, 76, 84, 0.12); color: #c64c54; }
.sp-badge[data-tone='idle'] { background: var(--sp-grid); color: var(--sp-faint); }

/* 指标：没有卡片框，只有大数字和细标签 */
.sp-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(96px, 1fr));
  gap: 18px 20px;
  overflow: auto;
  flex: 1 1 auto;
  min-height: 0;
  align-content: start;
}
.sp-card { min-width: 0; padding: 0; }
.sp-card-label {
  font-size: 10.5px; letter-spacing: 0.12em; color: var(--sp-faint);
}
.sp-card-value {
  font-size: 26px; font-weight: 500; line-height: 1.1;
  margin-top: 7px; color: var(--sp-text);
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.02em;
}
.sp-card-delta { font-size: 11.5px; margin-top: 7px; color: var(--sp-faint); }
.sp-card-delta[data-tone='up'] { color: #2f9e6b; }
.sp-card-delta[data-tone='down'] { color: #c64c54; }
.sp-card-hint { font-size: 11px; color: var(--sp-faint); margin-top: 4px; }

.sp-text { overflow: auto; flex: 1 1 auto; min-height: 0; font-size: 13.5px; line-height: 1.8; color: var(--sp-dim); }
.sp-text p { margin: 0 0 14px; }
.sp-text p:last-child { margin-bottom: 0; }
.sp-text ul { margin: 0; padding-left: 16px; }
.sp-text li { margin-bottom: 8px; }
.sp-text li::marker { color: var(--sp-accent); }

/* 图表：无网格、无轴框，只留一条基线和一个重点标注 */
.sp-chart { display: flex; flex-direction: column; gap: 8px; flex: 1 1 auto; min-height: 0; }
.sp-svg { overflow: visible; flex: 1 1 auto; min-height: 0; }
.sp-legend { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; font-size: 10.5px; letter-spacing: 0.06em; color: var(--sp-faint); }
.sp-legend-item { display: inline-flex; align-items: center; gap: 5px; }
.sp-legend-item i { width: 5px; height: 5px; border-radius: 50%; display: inline-block; }
.sp-unit { margin-right: auto; }

/* 3D 场景：没有容器框，网格本身就是空间 */
.sp-scene3d {
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
  border-radius: 0;
  overflow: hidden;
  background:
    radial-gradient(58% 54% at 50% 46%, color-mix(in srgb, var(--sp-accent) 9%, transparent), transparent 70%);
}
.sp-scene3d-svg { display: block; width: 100%; height: 100%; }
.sp-scene3d-caption {
  /* 左下角停靠球，说明文字放右下，避免压住球 */
  position: absolute; right: 2px; bottom: 2px;
  font-size: 10.5px; letter-spacing: 0.12em; color: var(--sp-faint);
}
.sp-scene3d-layers {
  position: absolute; right: 2px; top: 0;
  display: flex; flex-direction: column; gap: 6px; align-items: flex-end;
}
.sp-scene3d-layers span {
  font-size: 10px; letter-spacing: 0.1em;
  padding: 0; color: var(--sp-faint);
}

.sp-html { position: relative; flex: 1 1 auto; min-height: 0; }
.sp-html iframe {
  width: 100%; height: 100%; border: 0; border-radius: 12px;
  background: transparent;
}
.sp-html-badge {
  position: absolute; right: 0; top: -2px; z-index: 2;
  font-size: 9.5px; letter-spacing: 0.12em;
  padding: 0; color: var(--sp-faint);
}

.sp-fallback {
  display: grid; place-items: center; height: 100%;
  font-size: 12px; color: var(--sp-faint);
}

/* 折叠 chip：同样无边框，只有一层很淡的雾 */
.chips {
  position: absolute;
  left: 132px;
  bottom: 24px;
  display: flex;
  gap: 10px;
  max-width: calc(100vw - 220px);
  overflow-x: auto;
  pointer-events: none;
}
.chips::-webkit-scrollbar { width: 0; height: 0; }
.chip {
  pointer-events: auto;
  display: inline-flex; align-items: center; gap: 7px;
  font: inherit; font-size: 11px; letter-spacing: 0.08em;
  padding: 5px 12px; border-radius: 999px;
  border: 0;
  background: color-mix(in srgb, var(--sp-panel-solid) 36%, transparent);
  color: var(--sp-dim);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  cursor: pointer;
  white-space: nowrap;
  animation: sp-chip-in 240ms ease both;
}
.chip:hover { color: var(--sp-text); }
.chip i { width: 4px; height: 4px; border-radius: 50%; background: var(--sp-accent); opacity: 0.7; }
@keyframes sp-chip-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }

@media (prefers-reduced-motion: reduce) {
  .surface { transition: opacity 120ms linear !important; }
  .sp-scene3d-core { animation: none; }
}
</style>
<div class="planes"></div>
<div class="chips" role="list" aria-label="未展开的内容"></div>
`,wn=class extends HTMLElement{#e;#t;#n;#r=new Map;#i=rn({rev:0,mode:`companion`,surfaces:[]});#a=null;#o={top:0,right:0,bottom:0,left:0};#s=!1;#c=`light`;#l=0;#u=!1;constructor(){super(),this.#e=this.attachShadow({mode:`open`}),this.#e.innerHTML=Cn,this.#t=this.#e.querySelector(`.planes`),this.#n=this.#e.querySelector(`.chips`),this.#u=window.matchMedia?.(`(prefers-reduced-motion: reduce)`).matches??!1}connectedCallback(){window.addEventListener(`resize`,this.#f),this.#d(this.#c),this.#s&&this.refresh()}disconnectedCallback(){window.removeEventListener(`resize`,this.#f);for(let e of this.#r.values())e.dataAbort?.abort(),window.clearTimeout(e.ttlTimer),e.view.dispose(),e.el.remove();this.#r.clear()}get scene(){return this.#i}get plan(){return this.#a}get enabled(){return this.#s}setInsets(e){this.#o={top:Math.max(0,e.top??this.#o.top),right:Math.max(0,e.right??this.#o.right),bottom:Math.max(0,e.bottom??this.#o.bottom),left:Math.max(0,e.left??this.#o.left)},this.refresh()}setTheme(e){this.#c=e,this.#d(e)}setEnabled(e){this.#s!==e&&(this.#s=e,this.#e.host.toggleAttribute(`data-enabled`,e),e?this.refresh():this.#y())}setScene(e){let t=rn(e,this.#i.rev);return this.#i=t,this.refresh()}refresh(){let e=vn({viewport:{w:window.innerWidth,h:window.innerHeight,dpr:Math.min(window.devicePixelRatio||1,2.5)},insets:this.#o,scene:this.#i,capabilities:yt,reducedMotion:this.#u});return this.#a=e,this.dataset.mode=e.mode,this.#p(e),this.dispatchEvent(new CustomEvent(`spatial:layout`,{detail:{scene:this.#i,plan:e},bubbles:!0,composed:!0})),e}focusSurface(e){this.#i.surfaces.some(t=>t.id===e)&&this.setScene({...this.#i,focusId:e,rev:this.#i.rev+1})}#d(e){this.dataset.theme=e}#f=()=>{this.#s&&(window.clearTimeout(this.#l),this.#l=window.setTimeout(()=>this.refresh(),90))};#p(e){if(!this.#s)return;let t=new Map(this.#i.surfaces.map(e=>[e.id,e])),n=new Map;for(let[e,t]of this.#r){let r=t.el.getBoundingClientRect();n.set(e,{x:r.left,y:r.top,w:r.width,h:r.height})}for(let[n,r]of this.#r)t.has(n)||this.#v(n,r,e.transitionMs);for(let t of this.#i.surfaces){let r=e.rects[t.id];if(!r){let n=this.#r.get(t.id);n&&this.#v(t.id,n,e.transitionMs);continue}let i=this.#r.get(t.id);i||(i=this.#m(t),this.#r.set(t.id,i)),this.#h(i,t,r,n.get(t.id)??null,e.transitionMs)}this.#b(e)}#m(e){let t=document.createElement(`section`);t.className=`surface`,t.dataset.id=e.id,t.dataset.kind=e.kind,t.dataset.role=e.role??`support`,t.setAttribute(`part`,`surface surface-${e.id}`),t.setAttribute(`role`,`region`),t.setAttribute(`aria-label`,e.title||e.kind);let n=document.createElement(`div`);n.className=`head`;let r=document.createElement(`div`);r.className=`title`;let i=document.createElement(`div`);i.className=`subtitle`,n.append(r,i);let a=document.createElement(`div`);a.className=`body`,t.append(n,a),this.#t.append(t);let o=_t(e.kind),s=o?o.create():bt(e.kind);a.append(s.el);let c={spec:e,el:t,body:a,view:s,rendererKind:e.kind,lastRect:null,dataAbort:null,ttlTimer:0,entering:!0};return t.dataset.entering=`1`,requestAnimationFrame(()=>{requestAnimationFrame(()=>{t.dataset.entering=`0`,c.entering=!1})}),c}#h(e,t,n,r,i){if(e.rendererKind!==t.kind){e.view.dispose();let n=_t(t.kind);e.view=n?n.create():bt(t.kind),e.body.replaceChildren(e.view.el),e.rendererKind=t.kind}e.spec=t,e.el.dataset.role=t.role??`support`,e.el.dataset.kind=t.kind;let a=e.el.querySelector(`.head`),o=a.querySelector(`.title`),s=a.querySelector(`.subtitle`);a.hidden=!(t.title||t.subtitle||t.why),o.textContent=t.title??``,s.textContent=t.subtitle??``,o.hidden=!t.title,s.hidden=!t.subtitle;let c=a.querySelector(`.why`);t.why?(c||(c=document.createElement(`span`),c.className=`why`,a.append(c)),c.textContent=t.why):c&&c.remove();let l=r==null,u=r?r.x-n.x:0,d=r?r.y-n.y:0,f=r&&r.w>0?r.w/Math.max(1,n.w):1,p=r&&r.h>0?r.h/Math.max(1,n.h):1;e.el.style.width=`${n.w}px`,e.el.style.height=`${n.h}px`,e.el.style.left=`${n.x}px`,e.el.style.top=`${n.y}px`,!l&&i>0&&(Math.abs(u)>.5||Math.abs(d)>.5||Math.abs(f-1)>.004||Math.abs(p-1)>.004)?(e.el.style.transition=`none`,e.el.style.transform=`translate(${u.toFixed(1)}px, ${d.toFixed(1)}px) scale(${f.toFixed(4)}, ${p.toFixed(4)})`,e.el.offsetWidth,e.el.style.transition=`transform ${i}ms cubic-bezier(0.2, 0, 0, 1)`,e.el.style.transform=`translate(0, 0) scale(1, 1)`):(e.el.style.transition=``,e.el.style.transform=``),e.lastRect=n,this.#g(e,t),window.clearTimeout(e.ttlTimer),t.permissions?.ttlMs&&t.permissions.ttlMs>0&&(e.ttlTimer=window.setTimeout(()=>{this.#x(t.id)},t.permissions.ttlMs)),e.view.update(t,this.#_(e))}#g(e,t){if(e.dataAbort?.abort(),!t.source||t.source===`inline`)return;let n=new AbortController;e.dataAbort=n,Sn(t,n.signal).then(r=>{if(n.signal.aborted)return;let i={...t,data:r};e.spec=i,e.view.update(i,this.#_(e))}).catch(()=>{})}#_(e){let t=e.body.clientWidth,n=e.body.clientHeight;if(t>0&&n>0)return{w:t,h:n};let r=e.lastRect;return r?{w:Math.max(1,r.w-72),h:Math.max(1,r.h-80)}:{w:320,h:200}}#v(e,t,n){this.#r.delete(e),t.dataAbort?.abort(),window.clearTimeout(t.ttlTimer),n>0?(t.el.dataset.leaving=`1`,window.setTimeout(()=>{t.view.dispose(),t.el.remove()},n)):(t.view.dispose(),t.el.remove())}#y(){for(let[e,t]of this.#r)this.#r.delete(e),t.dataAbort?.abort(),window.clearTimeout(t.ttlTimer),t.view.dispose(),t.el.remove();this.#n.replaceChildren()}#b(e){let t=e.collapsed;this.#n.replaceChildren(),this.#n.hidden=t.length===0;for(let e of t){let t=this.#i.surfaces.find(t=>t.id===e);if(!t)continue;let n=document.createElement(`button`);n.type=`button`,n.className=`chip`,n.setAttribute(`role`,`listitem`),n.title=t.why||t.title||t.kind;let r=document.createElement(`i`);n.append(r,document.createTextNode(t.title||t.kind)),n.addEventListener(`click`,()=>{this.focusSurface(e)}),this.#n.append(n)}}#x(e){if(!this.#i.surfaces.find(t=>t.id===e))return;let t={...this.#i,rev:this.#i.rev+1,surfaces:this.#i.surfaces.filter(t=>t.id!==e),focusId:this.#i.focusId===e?null:this.#i.focusId};this.setScene(t),this.dispatchEvent(new CustomEvent(`spatial:dismiss`,{detail:{id:e},bubbles:!0,composed:!0}))}};customElements.get(`ai-spatial-stage`)||customElements.define(`ai-spatial-stage`,wn);var Tn={id:`orders`,kind:`table`,role:`focus`,priority:0,title:`最近工单`,subtitle:`6 条 · 2 条待审批`,why:`逐条核对`,size:{min:[360,240],pref:[560,420],max:[1e3,900]},data:{columns:[{key:`id`,label:`编号`},{key:`title`,label:`事项`},{key:`owner`,label:`申请人`},{key:`status`,label:`状态`},{key:`age`,label:`更新`}],rows:[{id:`WO-2418`,title:`笔记本补贴申领`,owner:`李工`,status:{text:`处理中`,tone:`warn`},age:`10 分钟前`},{id:`WO-2417`,title:`差旅报销复核`,owner:`王敏`,status:{text:`已完成`,tone:`ok`},age:`32 分钟前`},{id:`WO-2416`,title:`会议室设备报修`,owner:`陈琦`,status:{text:`待审批`,tone:`warn`},age:`1 小时前`},{id:`WO-2415`,title:`权限变更申请`,owner:`赵磊`,status:{text:`已完成`,tone:`ok`},age:`2 小时前`},{id:`WO-2414`,title:`供应商资料归档`,owner:`周宁`,status:{text:`已退回`,tone:`bad`},age:`3 小时前`},{id:`WO-2413`,title:`月度考勤核对`,owner:`孙悦`,status:{text:`处理中`,tone:`warn`},age:`4 小时前`}]}},En={id:`kpis`,kind:`cards`,role:`support`,priority:1,title:`本月指标`,size:{min:[220,150],pref:[300,220]},data:{items:[{label:`工单量`,value:`1,284`,delta:`+12.4%`,tone:`up`},{label:`处理时长`,value:`3.2 天`,delta:`−8.1%`,tone:`up`},{label:`待审批`,value:`17`,delta:`3 项超时`,tone:`down`},{label:`满意度`,value:`96.8%`,delta:`+1.2%`,tone:`up`}]}},Dn={id:`trend`,kind:`line`,role:`support`,priority:2,title:`近七日处理量`,subtitle:`单位：件`,size:{min:[300,200],pref:[520,300]},data:{labels:[`周一`,`周二`,`周三`,`周四`,`周五`,`周六`,`周日`],series:[{name:`处理完成`,values:[142,168,156,201,188,96,74]},{name:`新受理`,values:[166,174,182,196,211,88,62]}]}},On={id:`dept`,kind:`bars`,role:`support`,priority:2,title:`各部门工单分布`,size:{min:[300,200],pref:[520,300]},data:{labels:[`研发`,`市场`,`行政`,`财务`,`客服`,`运维`],series:[{name:`工单数`,values:[286,174,232,118,356,118]}]}},kn={id:`map3d`,kind:`scene3d`,role:`focus`,priority:0,title:`园区资产空间分布`,subtitle:`3D 场景 · 只读`,why:`空间关系`,size:{min:[480,320],pref:[1100,640]},data:{caption:`楼层 1–6 · 设备 214 台`,layers:[`楼宇体块`,`设备点位`,`巡检路径`]}},An={id:`note`,kind:`text`,role:`support`,priority:2,title:`结论`,size:{min:[220,140],pref:[300,240]},data:{paragraphs:[`待审批工单集中在设备报修，平均等待 1.8 天。`,`建议今天优先处理 3 条超时记录。`],bullets:[`WO-2416 等待最久`,`WO-2418 缺附件`,`权限变更需二次确认`]}};function jn(e){let t={rev:Date.now()%1e5,transition:`standard`};switch(e){case`split-left`:return{...t,mode:e,label:`split-left`,surfaces:[Tn]};case`split-right`:return{...t,mode:e,label:`split-right`,surfaces:[Tn]};case`stage`:return{...t,mode:e,label:`stage`,surfaces:[{...Dn,role:`focus`,priority:0},En,On]};case`immersive`:return{...t,mode:e,label:`immersive`,chat:`compact`,surfaces:[{...kn,role:`focus`,priority:0,prefer:`center`},{...En,role:`support`,priority:1,prefer:`left`},{...On,role:`support`,priority:2,prefer:`right`}]};case`focus`:return{...t,mode:e,label:`focus`,surfaces:[Tn,En,An]};default:return{...t,mode:`companion`,label:`companion`,surfaces:[]}}}var Mn=[{value:`split-right`,label:`右分栏`},{value:`immersive`,label:`全局`}],Nn=class{stage;#e;#t;#n=`split-right`;#r=null;#i=e=>{let{plan:t}=e.detail;this.#e.setSpatialPlan(t.mode===`companion`?null:t)};#a=e=>{if(!this.#t)return;let t=e.detail;t?.charts?.length&&this.showCharts(t.charts)};constructor(e){this.#e=e.orb;let t=document.querySelector(`ai-spatial-stage`);if(!t)throw Error(`[spatial] <ai-spatial-stage> not found`);this.stage=t,this.#t=e.enabled===!0,t.setTheme(e.theme??`light`),t.setInsets(e.insets??{top:68,right:24,bottom:20,left:24}),t.addEventListener(`spatial:layout`,this.#i),this.#e.addEventListener(`orb:visuals`,this.#a),t.setEnabled(this.#t)}get enabled(){return this.#t}get mode(){return this.#n}setEnabled(e){this.#t=e,this.stage.setEnabled(e),e?this.setMode(this.#n):(this.#e.setSpatialPlan(null),this.#r=null)}setTheme(e){this.stage.setTheme(e)}setMode(e){this.#n=e,this.#t&&this.applyScene(jn(e))}showCharts(e){if(!this.#t||!e.length)return null;let t=(this.#r?.rev??0)+1,n=$e(e.length),r={rev:t,mode:n,surfaces:Qe(e,t),chat:n===`immersive`?`compact`:`center`,transition:`standard`,provenance:{route:`chart-markdown`,confidence:1},label:`${n} · ${e.length} 块`};return this.#n=n,this.applyScene(r),r}clearScene(){this.#n=`split-right`,this.applyScene({rev:(this.#r?.rev??0)+1,mode:`split-right`,surfaces:[]})}applyScene(e){if(!this.#t)return;let t=rn(e,this.#r?.rev??0);this.#r=t,this.stage.setScene(t),t.surfaces.length>0&&this.#e.phase===`idle`&&this.#e.activateSilent()}reset(){this.#n=`companion`,this.#r=null,this.stage.setScene(jn(`companion`)),this.#e.setSpatialPlan(null)}dispose(){this.stage.removeEventListener(`spatial:layout`,this.#i),this.#e.removeEventListener(`orb:visuals`,this.#a),this.#e.setSpatialPlan(null)}},z=document.querySelector(`ai-orb-chat`);if(!z)throw Error(`[app] <ai-orb-chat> not found`);z.setOptions({orb:v.orb,orbPreset:v.orbPreset,theme:v.theme,auraMode:v.auraMode});var B=`solo`,V=new gt({onRole:e=>{B=e,In(e)},onSync:e=>Pn(e),onTakeoverRequested:()=>{U.stopVoice(),H=!0;try{z.deactivate()}finally{H=!1}z.addMessage(`system`,`另一个标签页接管了语音会话。`)}});V.listen();var H=!1;function Pn(e){H=!0;try{switch(e.kind){case`phase`:e.phase===`active`?(B!==`leader`&&z.setAttribute(`data-follower`,``),z.activateSilent()):B!==`leader`&&z.deactivate();break;case`voice`:z.setVoiceState(e.state),Hn(e.state);break;case`message`:z.addMessage(e.role,e.content,e.msgKind);break;case`clear`:z.clearMessages()}}finally{H=!1}}var Fn=!1;function In(e,t=!1){Fn=t;let n=document.getElementById(`followerBanner`);n&&(n.hidden=!(e===`follower`&&Fn)),e===`follower`?z.setAttribute(`data-follower`,``):e===`leader`&&z.removeAttribute(`data-follower`)}var U=new ft(z,{onState:(e,t)=>G(e,t),onError:e=>{z.addMessage(`system`,e,`err`),U.log(`app_error`,{text:e},`err`)},onVoice:e=>{z.setVoiceState(e),Hn(e),V.post({kind:`voice`,state:e})}});z.addEventListener(`orb:phase`,(e=>{document.documentElement.dataset.orbActive=e.detail.phase===`active`?`1`:`0`,!H&&(e.detail.phase===`active`?e.detail.voice===!1?V.post({kind:`phase`,phase:`active`}):Ln():(U.stopVoice(),V.release(),V.postAsAny({kind:`phase`,phase:`idle`}),z.clearInput(),Hn(`idle`)))})),z.addEventListener(`orb:takeover`,()=>{qn()});async function Ln(){await V.acquire()?(V.post({kind:`phase`,phase:`active`}),U.startVoice()):(In(`follower`,!0),G(`语音由另一个标签页占用`,`info`))}z.addEventListener(`orb:submit`,(e=>{let t=e.detail.text;U.log(`user_text`,{text:t}),B===`follower`&&z.activateSilent(),z.phase===`active`||z.activateSilent(),U.askText(t)})),z.addEventListener(`orb:interrupt`,()=>{U.interrupt()&&U.log(`user_interrupt`,{})}),U.log(`app_start`,{orb:v.orb,preset:v.orbPreset,ua:navigator.userAgent});var Rn=document.getElementById(`connText`),zn=document.getElementById(`voiceBadge`),W=document.getElementById(`callTimer`),Bn=document.getElementById(`liveDot`);function G(e,t){Rn&&(Rn.textContent=e),Bn&&Bn.classList.toggle(`on`,t===`ok`||(U?.inCall??!1))}var Vn={idle:`待机`,thinking:`思考中`,user:`聆听中`,ai:`说话中`};function Hn(e){zn&&(zn.textContent=Vn[e],zn.dataset.voice=e)}var Un=0;function Wn(e){let t=Math.max(0,Math.floor(e/1e3));return`${String(Math.floor(t/60)).padStart(2,`0`)}:${String(t%60).padStart(2,`0`)}`}setInterval(()=>{W&&(U.inCall?(Un||=Date.now(),W.textContent=`通话 ${Wn(Date.now()-Un)}`,W.hidden=!1):(Un=0,W.hidden=!0))},500);var K=document.getElementById(`settings`),Gn=document.getElementById(`gear`);function q(e){K?.classList.toggle(`open`,e),document.documentElement.dataset.panelOpen=e?`1`:`0`}Gn?.addEventListener(`click`,e=>{e.stopPropagation(),q(!K?.classList.contains(`open`))}),document.getElementById(`settingsClose`)?.addEventListener(`click`,()=>q(!1)),document.addEventListener(`keydown`,e=>{e.key===`Escape`&&K?.classList.contains(`open`)&&q(!1)}),document.addEventListener(`pointerdown`,e=>{if(!K?.classList.contains(`open`))return;let t=e.target;K.contains(t)||Gn?.contains(t)||q(!1)});var J=document.getElementById(`micSel`);async function Kn(){if(!J)return;let e=[];try{e=(await navigator.mediaDevices.enumerateDevices()).filter(e=>e.kind===`audioinput`)}catch{e=[]}J.innerHTML=``;let t=document.createElement(`option`);t.value=``,t.textContent=e.length?`系统默认（共 ${e.length} 个输入设备）`:`系统默认（未发现设备）`,J.appendChild(t),e.forEach((e,t)=>{let n=document.createElement(`option`);n.value=e.deviceId,n.textContent=e.label||`麦克风 ${t+1}`,J.appendChild(n)}),J.value=U.micDeviceId&&e.some(e=>e.deviceId===U.micDeviceId)?U.micDeviceId:``}J?.addEventListener(`change`,()=>{U.setMicDevice(J.value||null)}),Kn();function Y(e,t,n){let r=document.getElementById(e);if(!r)return;let i=t,a=()=>{r.textContent=i?`开`:`关`,r.classList.toggle(`on`,i)};a(),r.addEventListener(`click`,()=>{i=!i,a(),n(i)})}Y(`tgAec`,v.aec,e=>{U.setAec(e)}),Y(`tgUpGate`,v.upGate,e=>{U.setUpGate(e)}),Y(`tgLog`,v.log,e=>{U.setLogEnabled(e)}),Y(`tgParticles`,z.options.particlesEnabled,e=>{z.setOptions({particlesEnabled:e})}),document.getElementById(`btnMicTest`)?.addEventListener(`click`,async()=>{let e=[];try{let t=(await navigator.mediaDevices.enumerateDevices()).filter(e=>e.kind===`audioinput`);e.push(`发现 ${t.length} 个输入设备`)}catch{e.push(`设备枚举失败`)}e.push(`安全上下文：${window.isSecureContext?`是`:`否`}`),e.push(`嵌入框架：${window.self===window.top?`否`:`是 ⚠`}`);try{let t=await navigator.mediaDevices.getUserMedia({audio:!0}),n=t.getAudioTracks()[0],r=n&&n.getSettings?n.getSettings():{};z.addMessage(`system`,`麦克风自检 ✓ 打开成功\n设备：${n?.label||`(无标签)`} · ${r.sampleRate||`?`}Hz\n${e.join(`；`)}`),t.getTracks().forEach(e=>e.stop()),Kn()}catch(t){z.addMessage(`system`,`麦克风自检 ✗ ${t.name}：${t.message||t}\n（${e.join(`；`)}）`,`err`)}}),document.getElementById(`btnLogDump`)?.addEventListener(`click`,()=>{U.flushLog(),z.addMessage(`system`,`日志已推送到服务端 logs/ 目录。`)}),document.getElementById(`btnCall`)?.addEventListener(`click`,()=>{z.phase===`idle`?z.activate():U.inCall?U.stopVoice():U.startVoice()}),(function(){let e=[];if(window.self!==window.top&&e.push(`页面被嵌在 iframe / 预览面板里`),location.protocol!==`https:`&&location.hostname!==`127.0.0.1`&&location.hostname!==`localhost`&&e.push(`当前地址是 ${location.host}（非 127.0.0.1 / localhost，也不是 https）`),!e.length)return;let t=document.getElementById(`envWarn`);t&&(t.hidden=!1,t.textContent=`⚠ 检测到可疑环境：${e.join(`；`)}。麦克风很可能拿不到，请用 Chrome / Edge 打开 http://127.0.0.1:8770。`)})();async function qn(){G(`正在接管…`,`info`),await V.requestTakeover()?(Fn=!1,In(`leader`),z.phase===`active`?U.startVoice():z.activate()):G(`接管失败：另一个页面仍在会话中`,`err`)}document.getElementById(`btnTakeover`)?.addEventListener(`click`,()=>{qn()}),document.getElementById(`followerDismiss`)?.addEventListener(`click`,()=>{let e=document.getElementById(`followerBanner`);e&&(e.hidden=!0)});var X=null;try{X=new Nn({orb:z,enabled:!1,theme:v.theme})}catch(e){console.warn(`[spatial] 初始化失败，已回退到默认布局：`,e)}var Z=document.getElementById(`tgSpatial`),Q=document.getElementById(`spatialMode`);function Jn(e){document.documentElement.dataset.theme=e,z.setOptions({theme:e}),X?.setTheme(e);try{localStorage.setItem(`pet-web-theme`,e)}catch{}}Jn(localStorage.getItem(`pet-web-theme`)||v.theme),document.getElementById(`tgTheme`)?.addEventListener(`click`,()=>{Jn(document.documentElement.dataset.theme===`light`?`dark`:`light`)});var $=!1;function Yn(){Z&&(Z.textContent=$?`开`:`关`,Z.classList.toggle(`on`,$)),Q&&(Q.disabled=!$)}if(X&&Q){for(let e of Mn){let t=document.createElement(`option`);t.value=e.value,t.textContent=e.label,Q.append(t)}Q.value=X?.mode??`split-right`,Q.addEventListener(`change`,()=>{X?.setMode(Q.value)})}Yn(),Z?.addEventListener(`click`,()=>{X&&($=!$,Yn(),X.setEnabled($),Ie($),$&&(Q&&(Q.value=X.mode),X.setMode(X.mode)),G($?`空间工作区已启用`:`空间工作区已关闭`,$?`ok`:`info`))});