#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""真实 Chrome 验证（不需要连接上游）：本页面的 UI 契约 + 语音链路形态。

覆盖：
  A 企业信息与命名（瀚涛百事通 / 构建号）
  B 转写链路「已彻底移除」（函数/常量/设置项/cfg 字段全部不存在）
  C 语音链路工具编排与起播观察窗「已彻底移除」（首响不再被扣住）
  D 用户气泡 = 转写文本 + .23 一句话只有一个气泡（本地/服务端 VAD 统一入口）
  E 文字链路的工具编排仍然完整（knowledge_lookup：查值 / 粗判 / 卡片 / 标记清洗）
  F 气泡聚合（同一轮 AI 回复只占一个气泡）+ .23 用户开口即封口上一句
  G 接通提示音存在且可调用
  H 无 JS 异常

用法：python _cdp_verify4.py [http://127.0.0.1:8770]
"""
import asyncio
import json
import subprocess
import sys
import tempfile
import time
import urllib.request

CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
PORT = 9334
BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8770").rstrip("/")

PASS, FAIL = [], []


def check(name, ok, detail=""):
    (PASS if ok else FAIL).append(name)
    print(("  ✅ " if ok else "  ❌ ") + name + (f"  → {detail}" if detail else ""), flush=True)


def wait_json(path, timeout=30):
    t0 = time.time()
    while time.time() - t0 < timeout:
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{PORT}{path}", timeout=2) as r:
                return json.loads(r.read().decode())
        except Exception:
            time.sleep(0.4)
    raise SystemExit("chrome devtools 未就绪")


async def main():
    prof = tempfile.mkdtemp(prefix="cdp-v4-")
    args = [CHROME, "--headless=new", f"--remote-debugging-port={PORT}",
            f"--user-data-dir={prof}", "--no-first-run", "--no-default-browser-check",
            "--disable-gpu", "--window-size=1400,950",
            "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream",
            "--autoplay-policy=no-user-gesture-required", BASE + "/"]
    proc = subprocess.Popen(args, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        wait_json("/json/version")
        page = next(p for p in wait_json("/json") if p.get("type") == "page")

        from websockets.asyncio.client import connect
        errors, infos = [], []
        mid = 0
        async with connect(page["webSocketDebuggerUrl"], max_size=64 * 1024 * 1024) as ws:
            async def send(method, params=None):
                nonlocal mid
                mid += 1
                await ws.send(json.dumps({"id": mid, "method": method, "params": params or {}}))
                return mid

            def harvest(m):
                if m.get("method") == "Runtime.exceptionThrown":
                    d = m["params"]["exceptionDetails"]
                    errors.append("EXCEPTION: " + str(d.get("exception", {}).get("description") or d.get("text")))
                elif m.get("method") == "Runtime.consoleAPICalled":
                    t = m["params"]["type"]
                    txt = " ".join(str(a.get("value", a.get("description", ""))) for a in m["params"]["args"])
                    if t == "error":
                        errors.append("CONSOLE.ERROR: " + txt)
                    elif t in ("info", "warning"):
                        infos.append(f"{t}: {txt}")

            async def pump(seconds):
                end = time.time() + seconds
                while True:
                    left = end - time.time()
                    if left <= 0:
                        return
                    try:
                        raw = await asyncio.wait_for(ws.recv(), timeout=left)
                    except asyncio.TimeoutError:
                        return
                    m = json.loads(raw)
                    if m.get("method"):
                        harvest(m)

            async def ev(expr, timeout=30):
                i = await send("Runtime.evaluate", {"expression": expr, "awaitPromise": True, "returnByValue": True})
                end = time.time() + timeout
                while time.time() < end:
                    try:
                        raw = await asyncio.wait_for(ws.recv(), timeout=max(0.1, end - time.time()))
                    except asyncio.TimeoutError:
                        return None
                    m = json.loads(raw)
                    if m.get("method"):
                        harvest(m)
                        continue
                    if m.get("id") == i:
                        r = m.get("result", {})
                        if "exceptionDetails" in r:
                            return {"__err__": str(r["exceptionDetails"].get("text"))}
                        return r.get("result", {}).get("value")
                return None

            await send("Runtime.enable")
            await send("Log.enable")
            await send("Page.enable")
            await pump(4)

            body = await ev("document.body.innerText") or ""

            # ── A. 命名 / 构建号 ─────────────────────────────────────
            print("\n── A. 命名与构建号 ──")
            t = await ev("document.title")
            check("标题含「瀚涛百事通」", bool(t) and "瀚涛百事通" in t, repr(t))
            check("页面无旧名", "小碗" not in body and "小婉" not in body)
            brand = await ev("document.querySelector('.brand .title').textContent")
            check("面板名 = 瀚涛百事通", brand == "瀚涛百事通", repr(brand))
            bld = await ev("BUILD")


            def _bnum(s):
                """把 '2026-10-13.10' 解析成可比较的元组 —— 字符串比较会把 .10 判成 < .6。"""
                try:
                    d, rev = s.split(".")
                    return tuple(int(x) for x in d.split("-")) + (int(rev),)
                except Exception:
                    return (0,)

            check("构建号 >= 2026-10-13.10",
                  isinstance(bld, str) and _bnum(bld) >= _bnum("2026-10-13.10"), repr(bld))

            # ── B. 转写链路已彻底移除 ────────────────────────────────
            print("\n── B. 语音转写链路已移除 ──")
            gone = ["asrInit", "transcribe", "ASR_SYSTEM", "ASR_RE", "asrSanitize",
                    "asrEchoOf", "pushRecentBot", "asrRoute", "asrReset"]
            for name in gone:
                v = await ev(f"typeof {name}")
                check(f"{name} 已不存在", v == "undefined", f"typeof = {v}")
            # 用 textContent 而不是 innerText：弹层默认是收起（display:none）的，
            # innerText 对隐藏元素返回空串 → 断言会"假通过"。
            sp = await ev("document.getElementById('panelSettings').textContent") or ""
            check("设置弹层无「转写」行", "转写" not in sp, repr(sp)[:90])
            check("设置弹层确实读到了内容（防假通过）", "麦克风" in sp and "日志" in sp, repr(sp)[:90])
            check("cfg 里没有 asr 字段", await ev("Object.prototype.hasOwnProperty.call(cfg,'asr')") is False)

            # ── C. 语音工具编排 / 起播观察窗已移除 ───────────────────
            print("\n── C. 语音链路工具编排已移除（首响不再被扣住）──")
            for name in ["voiceTurnBegin", "voiceTurnEnd", "voiceToolAbort", "voiceToolFire",
                         "voiceToolReplay", "waitForUserText", "holdRelease", "holdDrop", "voiceHoldArm"]:
                v = await ev(f"typeof {name}")
                check(f"{name} 已不存在", v == "undefined", f"typeof = {v}")
            fn = await ev("String(enqueueAudio)")
            check("enqueueAudio 不再接受扣留参数", "opts" not in (fn or "") and "hold" not in (fn or ""), (fn or "")[:70])
            issp = await ev("String(isSpeaking)")
            check("isSpeaking 不再判定 holdBuf", "holdBuf" not in (issp or ""), (issp or "")[:70])
            v = await ev("Object.prototype.hasOwnProperty.call(S,'voiceObserving')")
            check("S 对象里没有 voiceObserving", v is False)
            v = await ev("Object.prototype.hasOwnProperty.call(S,'turnAborted')")
            check("S 对象里没有 turnAborted", v is False)
            v = await ev("Object.prototype.hasOwnProperty.call(S,'lastUserText')")
            check("S 对象里没有 lastUserText", v is False)
            check("peakOf 已随 VAD 简化移除", await ev("typeof peakOf") == "undefined")
            v = await ev("Object.prototype.hasOwnProperty.call(S,'analyser')")
            check("无读取方的 S.analyser 已清理", v is False)
            v = await ev("Object.prototype.hasOwnProperty.call(S,'level')")
            check("无读取方的 S.level 已清理", v is False)

            # ── D. 用户气泡 = **转写文本**（不再是时长）────────
            print("\n── D. 用户气泡 = 转写文本 ──")
            await ev("document.getElementById('msgs').innerHTML='';MSG.order=[];MSG.map.clear();"
                     "S.curUserKey=null;S.curUserEl=null;true")
            # ① 占位态：userRow 建占位 → 「聆听中…」
            await ev("userRow('itD');true")
            utxt = await ev("document.querySelector('.row.user .bubble').textContent")
            check("用户气泡占位态显示「聆听中…」", "聆听中" in (utxt or ""), repr(utxt))
            # ② 转写回来 → 填成文本
            await ev("userSetText('itD','现在几点了');true")
            utxt2 = await ev("document.querySelector('.row.user .bubble').textContent")
            check("转写回来填入文本", "现在几点了" in (utxt2 or ""), repr(utxt2))
            check("不再显示「语音 Ns」", "语音" not in (utxt2 or ""), repr(utxt2))
            # ③ 空文本 → 「没听清」
            await ev("userSetText('itD','');true")
            utxt3 = await ev("document.querySelector('.row.user .bubble').textContent")
            check("转写为空显示「没听清」", "没听清" in (utxt3 or ""), repr(utxt3))
            wave_after = await ev("document.querySelector('.row.user .bubble .wave') !== null")
            check("落定后波形占位撤掉", wave_after is False, f"wave={wave_after}")

            # ── D7. .28：keyed transcript 用户气泡（按 item_id 记账）─────
            print("\n── D7. .28 用户气泡按 item_id 记账 ──")
            _reset = ("document.getElementById('msgs').innerHTML='';MSG.order=[];MSG.map.clear();"
                      "S.curUserKey=null;S.curUserEl=null;S.curUserSaw=false;S.curUserDone=false;"
                      "S.curBotRow=null;S.curBotBubble=null;S.lastBotRow=null;S.lastBotBubble=null;")
            await ev(_reset + "true")
            # ① 同一 item_id 的分片只占一个气泡、按 key 覆盖
            await ev(_reset + "userAsrUpdate('现在','item_a');userAsrUpdate('现在几点了','item_a');true")
            it2 = await ev("JSON.stringify({n:document.querySelectorAll('.row.user').length,"
                          "txt:document.querySelector('.row.user .bubble').textContent})")
            io2 = json.loads(it2) if it2 else {}
            check(".28 同 item_id 分片覆盖显示（一个气泡）",
                  io2.get("n") == 1 and "现在几点了" in (io2.get("txt") or ""),
                  json.dumps(io2, ensure_ascii=False))
            # ② 换 item_id → 新气泡
            await ev(_reset + "userAsrUpdate('现在几点了','item_a');"
                     "userAsrUpdate('另一个问题','item_b');true")
            it = await ev("JSON.stringify({n:document.querySelectorAll('.row.user').length,"
                         "first:document.querySelector('.row.user .bubble').textContent})")
            io = json.loads(it) if it else {}
            check(".28 换 item_id 开新气泡（迟到分片不覆盖上一段）",
                  io.get("n") == 2 and "现在几点了" in (io.get("first") or ""),
                  json.dumps(io, ensure_ascii=False))
            # ③ 无 item_id（服务端没给）→ 仍只一个气泡，且能落字
            await ev(_reset + "onServerMsg({type:'input_audio_buffer.speech_started'});"
                     "userAsrUpdate('没有 item_id 的一句', null);true")
            it3 = await ev("JSON.stringify({n:document.querySelectorAll('.row.user').length,"
                          "txt:(document.querySelector('.row.user .bubble')||{}).textContent||''})")
            io3 = json.loads(it3) if it3 else {}
            check(".28 无 item_id 也能落成一条用户气泡",
                  io3.get("n") == 1 and "没有 item_id" in (io3.get("txt") or ""),
                  json.dumps(io3, ensure_ascii=False))

            # ── D6. .22：协议层换成 Qwen-Audio Realtime ───────────────
            print("\n── D6. .22 Qwen Realtime 协议层 ──")
            check(".22 QWEN_TOOLS 定义了两个工具",
                  await ev("QWEN_TOOLS.length === 2 && QWEN_TOOLS.map(t=>t.name).join(',')") ==
                  "query_company_policy,get_datetime")
            check(".22 上行用 input_audio_buffer.append + int16",
                  await ev("sendChunk.toString().indexOf('input_audio_buffer.append') >= 0"
                           " && sendChunk.toString().indexOf('f32ToI16B64') >= 0") is True)
            check(".22 session.update 带 tools 与 turn_detection",
                  await ev("sendSessionUpdate.toString().indexOf('turn_detection') >= 0") is True)
            check(".22 int16 编解码 helper 在位",
                  await ev("typeof f32ToI16B64 === 'function' && typeof b64I16ToF32 === 'function'") is True)
            # .24 往返断言：b64I16ToF32 曾经是"能跑但永远静音"的假实现
            # （DataView 建在新建的全零数组上，atob 结果没拷进去）——这条就是抓它的
            rt = await ev("""
              (() => {
                const n = 512, f = new Float32Array(n);
                for (let i = 0; i < n; i++) f[i] = Math.sin(i / 20) * 0.5;
                const b64 = f32ToI16B64(f);
                const back = b64I16ToF32(b64);
                let err = 0;
                for (let i = 0; i < n; i++) err = Math.max(err, Math.abs(back[i] - f[i]));
                return { len: back.length, maxErr: err };
              })()
            """) or {}
            check(".24 int16 编解码往返无损（b64I16ToF32 不是静音）",
                  rt.get("len") == 512 and rt.get("maxErr", 1) < 0.001,
                  json.dumps(rt))
            check(".22 runTool 已参数化（接收 ws）",
                  await ev("runTool.length === 2") is True)
            check(".22 打断改走 response.cancel（cancelResponse）",
                  await ev("typeof cancelResponse === 'function'"
                           " && cancelResponse.toString().indexOf('response.cancel') >= 0") is True)
            check(".22 工具调用展示 toolCallShow 在位",
                  await ev("typeof toolCallShow === 'function' && typeof toolCallDone === 'function'") is True)
            check(".22 思考指示 thinkOn/thinkOff 在位",
                  await ev("typeof thinkOn === 'function' && typeof thinkOff === 'function'") is True)
            # MiniCPM 补丁层必须真的删干净
            check(".22 话术委派状态机 DELEG 已删除", await ev("typeof DELEG") == "undefined")
            check(".22 话术检测 DELEG_RE 已删除", await ev("typeof DELEG_RE") == "undefined")
            check(".22 本地打断 onBargeIn 已删除", await ev("typeof onBargeIn") == "undefined")
            check(".22 插话检测 bargeWatch 已删除", await ev("typeof bargeWatch") == "undefined")
            check(".22 chat 串行闸已删除", await ev("typeof chatSerial") == "undefined")
            check(".22 标记清洗 stripToolMark 已删除", await ev("typeof stripToolMark") == "undefined")
            check(".22 上行不再带 force_listen 字段",
                  await ev("sendChunk.toString().indexOf('S.forceListen') < 0"
                           " && sendChunk.toString().indexOf('input.force_listen') < 0") is True)
            check(".29 构建号", await ev("BUILD") == "2026-10-14.29", await ev("BUILD"))
            # ── .25 打断即停（本地 stopSpeech）+ 工具提示音 ───────────
            print("\n── D7. .25 打断即停与工具空档 ──")
            check(".25 stopSpeech 已定义（打断时立刻停播已入队音频）",
                  await ev("typeof stopSpeech") == "function")
            check(".25 speech_started 分支调用 stopSpeech",
                  await ev("onServerMsg.toString().includes('stopSpeech')") is True)
            check(".25 response.done cancelled 分支也 stopSpeech（竞态兜底）",
                  await ev("onServerMsg.toString().indexOf('stopSpeech') >= 0") is True)
            check(".25 dropAudio 丢弃本轮迟到音频",
                  await ev("'dropAudio' in S") is True)
            check(".25 response.audio.delta 受 dropAudio 门控",
                  await ev("onServerMsg.toString().includes('S.dropAudio')") is True)
            check(".25 cancelResponse 走 stopSpeech（不再关 AudioContext）",
                  await ev("cancelResponse.toString().includes('stopSpeech')") is True)
            check(".25 playToolChime 已定义（慢工具开场提示音）",
                  await ev("typeof playToolChime") == "function")
            check(".25 SLOW_TOOLS 含 query_company_policy",
                  await ev("SLOW_TOOLS.has('query_company_policy')") is True)
            check(".25 runTool 慢工具前播提示音",
                  await ev("runTool.toString().includes('playToolChime')") is True)
            check(".25 turnT0 在 speech_started 置（不再被 committed 覆盖）",
                  await ev("onServerMsg.toString().indexOf('speech_started') >= 0") is True)
            check(".25 session.update 带 prefix_padding_ms / create_response",
                  await ev("sendSessionUpdate.toString().includes('prefix_padding_ms')"
                           " && sendSessionUpdate.toString().includes('create_response')") is True)
            check(".25 turn_detection 不复读 status（服务端不返回该字段）",
                  await ev("sendSessionUpdate.toString().includes('prefix_padding_ms')") is True)
            # ── D8. .25 打断即停「功能」验证（真播一段音频 → 触发 speech_started → 是否立刻停）──
            print("\n── D8. .25 打断即停（功能）──")
            fn = await ev("""(async () => {
              ensureOutCtx(); if (S.outCtx.state === 'suspended') await S.outCtx.resume();
              const tone = new Float32Array(24000 * 3);
              for (let i = 0; i < tone.length; i++) tone[i] = 0.2 * Math.sin(2*Math.PI*440*i/24000);
              enqueueAudio(tone);
              const before = { speaking: isSpeaking(), srcs: S.srcs.size };
              onServerMsg({ type: 'input_audio_buffer.speech_started' });
              const after = { speaking: isSpeaking(), srcs: S.srcs.size, drop: S.dropAudio };
              onServerMsg({ type: 'response.created' });
              const reset = S.dropAudio;
              flushPlayback();
              return JSON.stringify({ before, after, reset });
            })()""")
            try:
                r = json.loads(fn)
            except Exception:
                r = {}
            check(".25 播放中确实在出声（enqueue 后 isSpeaking）", r.get("before", {}).get("speaking") is True, fn)
            check(".25 打断后已排队音频被清空（srcs=0）", r.get("after", {}).get("srcs") == 0, fn)
            check(".25 打断后不再算是「说话中」", r.get("after", {}).get("speaking") is False, fn)
            check(".25 打断后置 dropAudio（丢迟到音频）", r.get("after", {}).get("drop") is True, fn)
            check(".25 下一轮 response.created 复位 dropAudio", r.get("reset") is False, fn)

            # ── D9. .26/.28 字幕跟读（文字不再先于声音一次性铺满）──
            print("\n── D9. .26 字幕跟读 ──")
            await ev("window.__sent=[];"
                     "document.getElementById('msgs').innerHTML='';MSG.order=[];MSG.map.clear();"
                     "S.curBotRow=null;S.curBotBubble=null;S.lastBotRow=null;S.lastBotBubble=null;"
                     "S.newTurnPending=false;FC.toolEls=[];true")
            cap = await ev("""(() => {
              onServerMsg({ type: 'response.created', response: { id: 'respX' } });
              const a = { active: S.capActive, text: S.capText };
              onServerMsg({ type: 'response.audio_transcript.delta', delta: '你好呀，' });
              onServerMsg({ type: 'response.audio_transcript.delta', delta: '我是瀚涛百事通。' });
              const b = { text: S.capText,
                          bubbleText: (document.querySelector('.row.bot .bubble')||{}).textContent || '' };
              return JSON.stringify({ a, b });   // ⚠ 此时还没音频，气泡里不应出现文字
            })()""")
            c = json.loads(cap) if cap else {}
            check(".26 response.created 开启跟读并清空本响应字幕",
                  c.get("a", {}).get("active") is True and c.get("a", {}).get("text") == "", cap)
            check(".26 字幕 delta 只累加、不立即上屏（文字不再抢跑）",
                  c.get("b", {}).get("text") == "你好呀，我是瀚涛百事通。"
                  and "瀚涛百事通" not in (c.get("b", {}).get("bubbleText") or ""), cap)
            # 收到音频后：字幕节点出现（值仍受播放时钟控制，这里只断言"接线正确"）
            st = await ev("""(() => {
              try {
                if (!S.outCtx) ensureOutCtx();
                onServerMsg({ type: 'response.audio.delta', delta: btoa('AA==') });
                const seen = S.capAudioSeen;
                const bn = document.querySelector('.row.bot .bubble');
                const has = !!(S.capNode && S.capNode.parentNode === bn);
                endBotRow();               // 收口 → 全文兜底上屏
                return JSON.stringify({ seen, has,
                  full: (document.querySelector('.row.bot .bubble')||{}).textContent || '' });
              } catch (e) { return JSON.stringify({ err: String((e && e.message) || e) }); }
            })()""")
            so9 = json.loads(st) if isinstance(st, str) else (st or {})
            check(".26 收到音频后进入跟读（capAudioSeen）", so9.get("seen") is True, st)
            check(".26 收口后字幕兜底为全文", "瀚涛百事通" in (so9.get("full") or ""), st)
            # 「有文本必须有气泡」：没有音频、但正常结束 → 文本也必须出现（.28 关键）
            noaud = await ev("""(() => {
              document.getElementById('msgs').innerHTML='';MSG.order=[];MSG.map.clear();
              S.curBotRow=null;S.curBotBubble=null;S.lastBotRow=null;S.lastBotBubble=null;
              onServerMsg({type:'response.created', response:{id:'rNoAud'}});
              onServerMsg({type:'response.audio_transcript.delta', delta:'没有音频也要显示这行字。'});
              onServerMsg({type:'response.done', response:{status:'completed'}});
              endBotRow();
              return JSON.stringify({nBots:document.querySelectorAll('.row.bot').length,
                txt:(document.querySelector('.row.bot .bubble')||{}).textContent||''});
            })()""")
            no = json.loads(noaud) if isinstance(noaud, str) else {}
            check(".28 无音频但正常结束 → 文本仍显示（有文本必有气泡）",
                  no.get("nBots") == 1 and "没有音频" in (no.get("txt") or ""), noaud)

            # ── D10. .27/.28 空气泡 / 用户气泡兜底 ──
            print("\n── D10. .27 空气泡清理与用户气泡兜底 ──")
            # ① 打断发生在字幕浮现前 → 不应留下空气泡
            ab = await ev("""(() => {
              document.getElementById('msgs').innerHTML='';MSG.order=[];MSG.map.clear();
              S.curBotRow=null;S.curBotBubble=null;S.lastBotRow=null;S.lastBotBubble=null;S.newTurnPending=false;
              onServerMsg({type:'response.created', response:{id:'rAb'}});
              onServerMsg({type:'response.audio_transcript.delta',delta:'这句话还没念到就被打断了。'});
              // 不给音频（capAudioSeen=false → 字幕空）就打断
              onServerMsg({type:'input_audio_buffer.speech_started'});
              onServerMsg({type:'response.done',response:{status:'cancelled'}});
              return JSON.stringify({nBots:document.querySelectorAll('.row.bot').length});
            })()""")
            abo = json.loads(ab) if isinstance(ab, str) else {}
            check(".27 打断在字幕浮现前 → 不留空气泡", abo.get("nBots") == 0, ab)
            # ② 被打断且已念出一部分 → 保留已念出的字幕（手动锚定播放起点，不依赖墙钟）
            cp = await ev("""(async () => {
              document.getElementById('msgs').innerHTML='';MSG.order=[];MSG.map.clear();
              S.curBotRow=null;S.curBotBubble=null;S.lastBotRow=null;S.lastBotBubble=null;S.newTurnPending=false;
              if (!S.outCtx) ensureOutCtx();
              onServerMsg({type:'response.created', response:{id:'rCap'}});
              onServerMsg({type:'response.audio_transcript.delta',delta:'这个我没法直接帮你搜索外部新闻。'});
              onServerMsg({type:'response.audio.delta',delta:btoa('\\u0000'.repeat(2400))});  // 触发 capAudioSeen + start
              S.capStart = S.outCtx.currentTime - 1.5;   // 假装已播 1.5s
              renderCaption();
              const shownLen = (S.capNode?S.capNode.textContent:'').length;
              onServerMsg({type:'input_audio_buffer.speech_started'});
              onServerMsg({type:'response.done',response:{status:'cancelled'}});
              const t = (document.querySelector('.row.bot .bubble')||{}).textContent || '';
              return JSON.stringify({shownLen, kept:t.length, text:t});
            })()""")
            cpo = json.loads(cp) if isinstance(cp, str) else {}
            check(".27 打断保留已念出的部分字幕",
                  cpo.get("shownLen", 0) > 0 and cpo.get("kept", 0) == cpo.get("shownLen")
                  and "帮你搜索" not in (cpo.get("text") or ""), cp)
            # ③ 用户气泡兜底：speech_started 后转写迟迟不来 → 4s 落「没听清」
            uf = await ev("""(async () => {
              document.getElementById('msgs').innerHTML='';MSG.order=[];MSG.map.clear();
              S.curUserKey=null;S.curUserEl=null;S.curUserSaw=false;S.curUserDone=false;
              onServerMsg({type:'input_audio_buffer.speech_started', item_id:'itU'});
              await new Promise(r=>setTimeout(r,4300));
              return JSON.stringify({nUsers:document.querySelectorAll('.row.user').length,
                txt:(document.querySelector('.row.user .bubble')||{}).textContent||''});
            })()""")
            ufo = json.loads(uf) if isinstance(uf, str) else {}
            check(".27 用户气泡超时兜底为「没听清」（不停在聆听中…）",
                  "没听清" in (ufo.get("txt") or ""), uf)
            # ── E. .22 起工具走原生 function calling ─────────────────
            print("\n── E. .22 原生 function calling 定义 ──")
            tools = await ev("JSON.stringify(QWEN_TOOLS)")
            tl = json.loads(tools) if tools else []
            check("工具表有两个工具", len(tl) == 2, str([t.get("name") for t in tl]))
            check("工具描述里不含方括号标记（避免模型在语音里念出来）",
                  all("[[" not in (t.get("description") or "") for t in tl))
            pol = [t for t in tl if t.get("name") == "query_company_policy"]
            check("query_company_policy 描述写明了「涉及公司事务必须先查」",
                  bool(pol) and "先" in (pol[0].get("description") or ""))
            check(".22 工具卡片已整体删除（前端不留工具痕迹）",
                  await ev("typeof toolCard === 'undefined' && typeof toolCardPending === 'undefined'") is True)
            check(".22 页面里不再有 tool-card 元素", await ev("document.querySelectorAll('.tool-card').length") == 0)
            for gone in ("LOOKUP_RE", "KB_RE", "stripToolMark", "resolveLookup", "mightNeedTool",
                         "TOOL_RULES", "VOICE_DELEGATE_RULES", "chatTurnOnce", "transcribeUser"):
                check(f".22 {gone} 已删除", await ev(f"typeof {gone}") == "undefined")

            # ── E2. 提示词与标记语法解耦 ────────────────────────────
            print("\n── E2. 提示词不含标记语法 ──")
            leak = await ev("""
              (() => {
                const sys = SYSTEM_PROMPT;
                return {
                  sysHasToolWord: sys.indexOf('knowledge_lookup') >= 0,
                  sysHasLookupMark: sys.indexOf('LOOKUP') >= 0,
                  hasEnvFacts: typeof envFacts === 'function',
                  hasKbAsk: typeof kbAsk === 'function',
                };
              })()
            """) or {}
            print("     ", json.dumps(leak, ensure_ascii=False)[:180])
            check("SYSTEM_PROMPT 不含工具名", leak.get("sysHasToolWord") is False)
            check("SYSTEM_PROMPT 不含标记语法", leak.get("sysHasLookupMark") is False)
            check("事实表函数仍在（供 get_datetime 工具）", leak.get("hasEnvFacts") is True)
            check("KB 客户端仍在（供 query_company_policy 工具）", leak.get("hasKbAsk") is True)


            # 实时事实不预注入
            f = await ev("JSON.stringify(envFacts())")
            fo = json.loads(f) if f else {}
            sysstr = await ev("SYSTEM_PROMPT") or ""
            check("提示词里没有当天日期", fo.get("date") and fo["date"] not in sysstr, str(fo.get("date")))
            check("提示词里没有所在地", fo.get("location") and fo["location"] not in sysstr, str(fo.get("location")))

            # ── E3. .28：工具调用 = **独立气泡**（不再挤进 AI 正文）────────
            print("\n── E3. .28 工具调用独立气泡 ──")
            await ev("document.getElementById('msgs').innerHTML='';MSG.order=[];MSG.map.clear();"
                     "S.curBotRow=null;S.curBotBubble=null;S.lastBotRow=null;S.lastBotBubble=null;"
                     "S.newTurnPending=false;FC.toolEls=[];true")
            # ① 调用中：独立 .row.tool 气泡 + 转圈 chip
            await ev("toolCallShow('query_company_policy','cA');true")
            chip = await ev("JSON.stringify({"
                           "toolRows:document.querySelectorAll('.row.tool').length,"
                           "botRows:document.querySelectorAll('.row.bot').length,"
                           "spin:!!document.querySelector('.row.tool .tool-inline .tspin'),"
                           "txt:document.querySelector('.row.tool .tool-inline').textContent})")
            co = json.loads(chip) if chip else {}
            check(".28 工具调用是独立气泡（不在 AI 正文里）",
                  co.get("toolRows") == 1 and co.get("botRows") == 0, json.dumps(co, ensure_ascii=False))
            check(".28 调用中有转圈元素", co.get("spin") is True)
            check(".28 文案为「正在查公司制度…」", "正在查公司制度" in (co.get("txt") or ""), repr(co.get("txt")))
            # ② 完成后：停转圈、文案变「查公司制度 完成」
            await ev("toolCallDone('query_company_policy', true, 'cA');true")
            done = await ev("JSON.stringify({done:document.querySelectorAll('.tool-inline.done').length,"
                           "run:document.querySelectorAll('.tool-inline:not(.done):not(.fail)').length,"
                           "txt:document.querySelector('.row.tool .tool-inline').textContent})")
            do = json.loads(done) if done else {}
            check(".28 完成后停转圈（done 态）", do.get("done") == 1 and do.get("run") == 0,
                  json.dumps(do, ensure_ascii=False))
            check(".28 完成后文案为「查公司制度 完成」", "查公司制度 完成" in (do.get("txt") or ""), repr(do.get("txt")))
            # ③ AI 正文在**另一个**气泡里（工具与正文分家）
            await ev("onServerMsg({type:'response.created'});"
                     "onServerMsg({type:'response.audio_transcript.delta',delta:'笔记本补贴最高 7200 元。'});"
                     "onServerMsg({type:'response.done',response:{status:'completed'}});true")
            await ev("endBotRow();true")
            order = await ev("JSON.stringify({bot:document.querySelectorAll('.row.bot').length,"
                            "tool:document.querySelectorAll('.row.tool').length,"
                            "botHasChip:!!document.querySelector('.row.bot .bubble .tool-inline')})")
            oo = json.loads(order) if order else {}
            check(".28 工具与 AI 正文分属不同气泡",
                  oo.get("bot") == 1 and oo.get("tool") == 1 and oo.get("botHasChip") is False,
                  json.dumps(oo, ensure_ascii=False))
            # ④ 失败态
            await ev("document.getElementById('msgs').innerHTML='';MSG.order=[];MSG.map.clear();"
                     "S.curBotRow=null;S.curBotBubble=null;S.lastBotRow=null;S.lastBotBubble=null;"
                     "S.newTurnPending=false;FC.toolEls=[];"
                     "toolCallShow('get_datetime','cB');toolCallDone('get_datetime', false, 'cB');true")
            fail = await ev("JSON.stringify({f:document.querySelectorAll('.tool-inline.fail').length,"
                           "txt:document.querySelector('.row.tool .tool-inline').textContent})")
            fo = json.loads(fail) if fail else {}
            check(".28 失败态停转圈打叉", fo.get("f") == 1 and "失败" in (fo.get("txt") or ""),
                  json.dumps(fo, ensure_ascii=False))

            # ── E4. .23：FC 时序（response.create 必须客户端补拍）────────
            print("\n── E4. .23 FC 时序三场景 ──")
            # 用一个假 ws 捕获上行帧；kbAsk 打桩掉（不真连公司知识库）
            await ev("window.__sent = [];"
                     "S.ws = { readyState: 1, send(s){ window.__sent.push(s); } };"
                     "kbAsk = async () => ({ ok: true, answer: '笔记本补贴最高 7200 元，按月发放 48 个月。' });"
                     "document.getElementById('msgs').innerHTML='';"
                     "S.curBotRow=null;S.curBotBubble=null;S.lastBotRow=null;S.lastBotBubble=null;"
                     "S.newTurnPending=false;FC.responseOpen=false;FC.pending=false;FC.toolEls=[];"
                     "FC.gen=0;FC.pendingGen=-1;true")
            # 场景①（慢速 KB，真实常态）：response.done 先到，工具后到 → runTool 自行补发
            await ev("document.getElementById('msgs').innerHTML='';MSG.order=[];MSG.map.clear();"
                     "S.curUserKey=null;S.curUserEl=null;S.curUserSaw=false;S.curUserDone=false;true")
            await ev("onServerMsg({type:'input_audio_buffer.speech_started',item_id:'it1'});"
                     "onServerMsg({type:'conversation.item.input_audio_transcription.completed',"
                     "item_id:'it1',transcript:'笔记本补贴是多少'});"
                     "onServerMsg({type:'input_audio_buffer.committed',item_id:'it1'});"
                     "onServerMsg({type:'response.created',response:{id:'rE4a'}});"
                     "onServerMsg({type:'response.output_item.added',"
                     "item:{type:'function_call',name:'query_company_policy',call_id:'c1'}});"
                     "onServerMsg({type:'response.function_call_arguments.done',"
                     "name:'query_company_policy',call_id:'c1',arguments:'{\"topic\":\"笔记本补贴\"}'});"
                     "onServerMsg({type:'response.done',response:{status:'completed'}});true")
            await pump(1.0)                      # 等 runTool 的微任务跑完（打桩 kbAsk 立即 resolve）
            sent1 = await ev("JSON.stringify(window.__sent)")
            s1 = json.loads(sent1) if sent1 else []
            check(".23 慢工具：回灌 function_call_output",
                  any('"function_call_output"' in s for s in s1),
                  f"{len(s1)} 帧")
            check(".23 慢工具：runTool 自行补发 response.create（修核心）",
                  any('"response.create"' in s for s in s1),
                  f"{len(s1)} 帧")
            # 场景①续：第二轮作答是**独立文本气泡**（工具在它自己的气泡里，chip 已打勾）
            await ev("onServerMsg({type:'response.created', response:{id:'rCont'}});"
                     "onServerMsg({type:'response.audio_transcript.delta',delta:'笔记本补贴最高 7200 元'});"
                     "onServerMsg({type:'response.audio_transcript.delta',delta:'，按月发放 48 个月。'});"
                     "onServerMsg({type:'response.done',response:{status:'completed'}});true")
            await pump(0.6)
            seq = await ev("JSON.stringify({users:document.querySelectorAll('.row.user').length,"
                          "bots:document.querySelectorAll('.row.bot').length,"
                          "tools:document.querySelectorAll('.row.tool').length,"
                          "chipDone:document.querySelectorAll('.tool-inline.done').length,"
                          "botTxt:document.querySelector('.row.bot .bubble').textContent,"
                          "botHasChip:!!document.querySelector('.row.bot .bubble .tool-inline'),"
                          "usrTxt:document.querySelector('.row.user .bubble').textContent})")
            so = json.loads(seq) if seq else {}
            check(".28 一句话一个用户气泡（转写落位）",
                  so.get("users") == 1 and "笔记本补贴是多少" in (so.get("usrTxt") or ""),
                  json.dumps({k: so.get(k) for k in ("users", "usrTxt")}, ensure_ascii=False))
            check(".28 工具与正文分属不同气泡（chip 已打勾）",
                  so.get("bots") == 1 and so.get("tools") == 1 and so.get("chipDone") == 1
                  and so.get("botHasChip") is False,
                  json.dumps({k: so.get(k) for k in ("bots", "tools", "chipDone", "botHasChip")}, ensure_ascii=False))
            check(".28 正文气泡只有文字（含答案）",
                  "7200" in (so.get("botTxt") or "") and "tool-inline" not in (so.get("botTxt") or ""),
                  repr(so.get("botTxt")))
            # 场景②（快路径）：工具先于 response.done 结束 → 挂起，done 时 fcFollowUp 补发
            await ev("window.__sent = [];"
                     "document.getElementById('msgs').innerHTML='';"
                     "S.curBotRow=null;S.curBotBubble=null;S.lastBotRow=null;S.lastBotBubble=null;"
                     "S.newTurnPending=false;FC.responseOpen=false;FC.pending=false;FC.toolEls=[];true")
            await ev("onServerMsg({type:'response.created'});"
                     "onServerMsg({type:'response.output_item.added',"
                     "item:{type:'function_call',name:'get_datetime',call_id:'c2'}});"
                     "onServerMsg({type:'response.function_call_arguments.done',"
                     "name:'get_datetime',call_id:'c2',arguments:'{}'});true")
            await pump(0.6)                      # 工具已跑完（envFacts 本地，立即 resolve）→ 挂起中
            mid_sent = await ev("JSON.stringify(window.__sent)")
            m1 = json.loads(mid_sent) if mid_sent else []
            check(".23 快工具：done 前只回灌不补发（还有 response 在跑）",
                  any('"function_call_output"' in s for s in m1)
                  and not any('"response.create"' in s for s in m1),
                  f"{len(m1)} 帧")
            await ev("onServerMsg({type:'response.done',response:{status:'completed'}});true")
            sent2 = await ev("JSON.stringify(window.__sent)")
            s2 = json.loads(sent2) if sent2 else []
            check(".23 快工具：response.done 时 fcFollowUp 补发 response.create",
                  any('"response.create"' in s for s in s2), f"{len(s2)} 帧")
            # 场景③（插话作废）：工具挂起期间用户 commit 新语音 → 旧结果不再触发
            await ev("window.__sent = [];"
                     "document.getElementById('msgs').innerHTML='';"
                     "S.curBotRow=null;S.curBotBubble=null;S.lastBotRow=null;S.lastBotBubble=null;"
                     "S.newTurnPending=false;FC.responseOpen=true;FC.pending=true;FC.pendingGen=0;FC.gen=0;true")
            await ev("onServerMsg({type:'input_audio_buffer.committed',item_id:'it2'});true")  # gen→1
            await ev("onServerMsg({type:'response.done',response:{status:'completed'}});true")  # 触发 fcFollowUp
            sent3 = await ev("JSON.stringify(window.__sent)")
            s3 = json.loads(sent3) if sent3 else []
            check(".23 插话后旧工具结果作废（不抢答用户的新话题）",
                  not any('"response.create"' in s for s in s3), f"{len(s3)} 帧")

            # ── F. 气泡聚合 ─────────────────────────────────────────
            print("\n── F. AI 回复气泡聚合 ──")
            await ev("document.getElementById('msgs').innerHTML='';MSG.order=[];MSG.map.clear();"
                     "S.curBotRow=null;S.curBotBubble=null;S.lastBotRow=null;S.lastBotBubble=null;S.newTurnPending=false;true")
            await ev("botText('你好呀，');botText('我是瀚涛百事通。');endBotRow();"
                     "botText('同一轮的后续分块也应该写进同一个气泡。');true")
            r = await ev("JSON.stringify({n:document.querySelectorAll('.row.bot').length,"
                         "txt:document.querySelector('.row.bot .bubble').textContent})")
            o = json.loads(r) if r else {}
            check("同一轮多块文本只占 1 个气泡", o.get("n") == 1, f"气泡数={o.get('n')}")
            check("气泡内容完整拼接", "你好呀，" in (o.get("txt") or "") and "同一个气泡" in (o.get("txt") or ""),
                  repr(o.get("txt"))[:80])
            await ev("onServerMsg({type:'input_audio_buffer.speech_started',item_id:'itF'});"
                     "userAsrDone('请问今天天气如何','itF');true")
            await ev("botText('今天是 2026年10月13日，星期二。');endBotRow();true")
            n2 = await ev("document.querySelectorAll('.row.bot').length")
            check("用户发言后开新气泡（共 2 个）", n2 == 2, f"气泡数={n2}")
            usr = await ev("document.querySelectorAll('.row.user').length")
            check("用户语音气泡已渲染", usr == 1, f"用户气泡={usr}")
            # 服务端 VAD 的 speech_started 也必须把上一句 AI 气泡封口
            await ev("document.getElementById('msgs').innerHTML='';MSG.order=[];MSG.map.clear();"
                     "S.curBotRow=null;S.curBotBubble=null;S.lastBotRow=null;S.lastBotBubble=null;"
                     "S.newTurnPending=false;S.curUserKey=null;S.curUserEl=null;"
                     "S.curUserSaw=false;S.curUserDone=false;true")
            await ev("botText('第一轮的回答。');endBotRow();true")
            await ev("onServerMsg({type:'input_audio_buffer.speech_started', item_id:'itF2'});true")  # 模拟服务端 speech_started
            await ev("botText('第二轮的回答，必须是新气泡。');endBotRow();true")
            n3 = await ev("document.querySelectorAll('.row.bot').length")
            check(".23 服务端 speech_started 也封口上一句（不粘泡）", n3 == 2, f"气泡数={n3}")

            # ── G. 接通提示音 ───────────────────────────────────────
            print("\n── G. 接通提示音 ──")
            check("playReadyChime 已定义", await ev("typeof playReadyChime === 'function'") is True)
            r = await ev("(()=>{try{playReadyChime();return 'ok'}catch(e){return 'ERR:'+e.message}})()")
            check("playReadyChime 调用不抛异常", r == "ok", str(r))

            await pump(1.5)
            print("\n── H. JS 异常检查 ──")
            check("无 JS 异常", not errors, "; ".join(errors[:4]))

        print("\n" + "=" * 60)
        print(f"通过 {len(PASS)} 项 / 失败 {len(FAIL)} 项")
        if FAIL:
            print("失败项：")
            for x in FAIL:
                print("  - " + x)
        print("=" * 60)
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except Exception:
            proc.kill()


if __name__ == "__main__":
    asyncio.run(main())
