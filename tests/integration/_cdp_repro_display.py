#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""复现「AI 气泡显示异常」：驱动一条真实时序的 response（含真播放时钟 + 打断），
逐步打印气泡 DOM 与跟读状态，定位空气泡/不显示的根因。"""
import asyncio, base64, json, subprocess, sys, tempfile, time, urllib.request

CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
PORT = 9336
BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8770").rstrip("/")
SIL = base64.b64encode(bytes(2400 * 2)).decode()   # 0.1s @24k int16 静音

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
    prof = tempfile.mkdtemp(prefix="cdp-repro-")
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
        async with connect(page["webSocketDebuggerUrl"], max_size=64*1024*1024) as ws:
            mid = 0
            async def send(method, params=None):
                nonlocal mid; mid += 1
                await ws.send(json.dumps({"id": mid, "method": method, "params": params or {}}))
                return mid
            async def pump(seconds):
                end = time.time() + seconds
                while True:
                    left = end - time.time()
                    if left <= 0: return
                    try: await asyncio.wait_for(ws.recv(), timeout=left)
                    except asyncio.TimeoutError: return
            async def ev(expr, timeout=30):
                i = await send("Runtime.evaluate", {"expression": expr, "awaitPromise": True, "returnByValue": True})
                end = time.time() + timeout
                while time.time() < end:
                    try: raw = await asyncio.wait_for(ws.recv(), timeout=max(0.1, end - time.time()))
                    except asyncio.TimeoutError: return None
                    m = json.loads(raw)
                    if m.get("method"): continue
                    if m.get("id") == i:
                        r = m.get("result", {})
                        if "exceptionDetails" in r: return {"__err__": str(r["exceptionDetails"].get("text"))}
                        return r.get("result", {}).get("value")
                return None
            await send("Runtime.enable"); await send("Page.enable")
            await pump(4)

            # 建立真 AudioContext（模拟点过打电话）
            await ev("ensureOutCtx();(async()=>{if(S.outCtx.state==='suspended')await S.outCtx.resume();return S.outCtx.state})()")
            await pump(0.3)

            print("=== 场景A：正常一轮（字幕+音频真时序）===")
            await ev("document.getElementById('msgs').innerHTML='';S.curBotRow=null;S.curBotBubble=null;"
                     "S.lastBotRow=null;S.lastBotBubble=null;S.newTurnPending=false;true")
            # 逐帧驱动：response.created → 字幕（快） → 音频（慢）
            await ev("onServerMsg({type:'response.created'});true")
            txt = "你好呀，我是瀚涛百事通，专门帮你解答公司里各种问题的助手。"
            for ch in txt:
                await ev(f"onServerMsg({{type:'response.audio_transcript.delta',delta:{json.dumps(ch)}}});true")
                await pump(0.01)
            # 音频 1.2s，每帧 0.1s
            for _ in range(12):
                await ev(f"onServerMsg({{type:'response.audio.delta',delta:{json.dumps(SIL)}}});true")
                await pump(0.06)
            st = await ev("JSON.stringify({cap:S.capNode?S.capNode.textContent:null,seen:S.curAudioSeen,"
                          "start:S.curResponseStart,now:S.outCtx?S.outCtx.currentTime:null,"
                          "bubble:(document.querySelector('.row.bot .bubble')||{}).textContent||''})")
            print("  播放中:", st)
            await ev("onServerMsg({type:'response.done',response:{status:'completed'}});true")
            await pump(2.5)
            dom = await ev("JSON.stringify({nBots:document.querySelectorAll('.row.bot').length,"
                           "txt:(document.querySelector('.row.bot .bubble')||{}).textContent||''})")
            print("  收口后:", dom)

            print("=== 场景B：字幕先到、音频还没到就 response.done（无音频）===")
            await ev("document.getElementById('msgs').innerHTML='';S.curBotRow=null;S.curBotBubble=null;"
                     "S.lastBotRow=null;S.lastBotBubble=null;S.newTurnPending=false;"
                     "onServerMsg({type:'response.created'});"
                     "onServerMsg({type:'response.audio_transcript.delta',delta:'这是一段没有音频的字幕。'});"
                     "onServerMsg({type:'response.done',response:{status:'completed'}});true")
            await pump(2.0)
            dom2 = await ev("JSON.stringify({nBots:document.querySelectorAll('.row.bot').length,"
                            "txt:(document.querySelector('.row.bot .bubble')||{}).textContent||''})")
            print("  结果:", dom2)

            print("=== 场景C：打断（播到一半用户开口）===")
            await ev("document.getElementById('msgs').innerHTML='';S.curBotRow=null;S.curBotBubble=null;"
                     "S.lastBotRow=null;S.lastBotBubble=null;S.newTurnPending=false;"
                     "onServerMsg({type:'response.created'});"
                     "onServerMsg({type:'response.audio_transcript.delta',delta:'这个我没法直接帮你搜索外部新闻。'});true")
            for _ in range(14):
                await ev(f"onServerMsg({{type:'response.audio.delta',delta:{json.dumps(SIL)}}});true"); await pump(0.10)
            await ev("onServerMsg({type:'input_audio_buffer.speech_started'});"
                     "onServerMsg({type:'response.done',response:{status:'cancelled'}});true")
            await pump(1.0)
            dom3 = await ev("JSON.stringify({nBots:document.querySelectorAll('.row.bot').length,"
                            "bubbles:[...document.querySelectorAll('.row.bot .bubble')].map(b=>b.textContent)})")
            print("  结果:", dom3)

            print("=== 场景D：服务端 speech_started 建用户气泡，但转写没来 ===")
            await ev("document.getElementById('msgs').innerHTML='';FC.curUserRow=null;FC.asrItem=null;"
                     "FC.asrDone=false;FC.asrSaw=false;"
                     "onServerMsg({type:'input_audio_buffer.speech_started'});true")
            await pump(4.8)   # 等 4s 兜底触发
            dom4 = await ev("JSON.stringify({nUsers:document.querySelectorAll('.row.user').length,"
                            "bubbles:[...document.querySelectorAll('.row.user .bubble')].map(b=>b.textContent)})")
            print("  结果:", dom4)
    finally:
        proc.terminate()

asyncio.run(main())
