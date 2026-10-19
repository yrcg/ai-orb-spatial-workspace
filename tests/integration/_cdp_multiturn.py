#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""真实多轮显示复现：页面真连中继→3.1-plus，用 WAV 当麦克风喂两轮，
每轮结束 dump 气泡 DOM + 收到的所有帧类型，定位"空气泡/不显示/有声音没文字"。"""
import asyncio, base64, json, os, subprocess, sys, tempfile, time, urllib.request, wave

CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
PORT = 9338
BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8770").rstrip("/")
HERE = os.path.dirname(os.path.abspath(__file__))

def wait_json(path, timeout=30):
    t0 = time.time()
    while time.time() - t0 < timeout:
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{PORT}{path}", timeout=2) as r:
                return json.loads(r.read().decode())
        except Exception:
            time.sleep(0.4)
    raise SystemExit("chrome devtools 未就绪")

def wav_pcm(path):
    with wave.open(path, "rb") as w:
        return w.readframes(w.getnframes())

async def main():
    prof = tempfile.mkdtemp(prefix="cdp-mt-")
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
        errors = []
        async with connect(page["webSocketDebuggerUrl"], max_size=64*1024*1024) as ws:
            mid = 0
            async def send(method, params=None):
                nonlocal mid; mid += 1
                await ws.send(json.dumps({"id": mid, "method": method, "params": params or {}}))
                return mid
            async def ev(expr, timeout=30):
                i = await send("Runtime.evaluate", {"expression": expr, "awaitPromise": True, "returnByValue": True})
                end = time.time() + timeout
                while time.time() < end:
                    try: raw = await asyncio.wait_for(ws.recv(), timeout=max(0.1, end-time.time()))
                    except asyncio.TimeoutError: return None
                    m = json.loads(raw)
                    if m.get("method") == "Runtime.exceptionThrown":
                        d = m["params"]["exceptionDetails"]
                        errors.append("EXC: " + str(d.get("exception", {}).get("description") or d.get("text")))
                    elif m.get("method") == "Runtime.consoleAPICalled" and m["params"].get("type") == "error":
                        errors.append("CONSOLE.ERR: " + " ".join(str(a.get("value", a.get("description",""))) for a in m["params"]["args"]))
                    elif m.get("id") == i:
                        r = m.get("result", {})
                        if "exceptionDetails" in r: return {"__err__": str(r["exceptionDetails"].get("text"))}
                        return r.get("result", {}).get("value")
                return None
            await send("Runtime.enable"); await send("Log.enable"); await send("Page.enable")
            await asyncio.sleep(3)

            # 挂帧计数器
            await ev("startVoice();'ok'")
            for _ in range(40):
                await asyncio.sleep(0.5)
                if await ev("S.ws && S.ws.readyState===1 && S.sessionReady"): break
            await asyncio.sleep(1.5)
            # 停掉页面自己的麦克风上行（避免 fake 设备干扰），只用我们喂的音频；保留 WS
            await ev("S.micOn=false; window.__frames={};"
                     "const _prev=S.ws.onmessage;"
                     "S.ws.onmessage=(e)=>{try{const t=JSON.parse(e.data).type;window.__frames[t]=(window.__frames[t]||0)+1;}catch(_){};return _prev(e);};"
                     "window.__turns=0;true")
            print("已连接，开始喂 WAV（每轮前留静音）")

            pcm = wav_pcm(os.path.join(os.path.dirname(HERE), "fixtures", "_probe_speech.wav"))
            chunk = 16000*2*40//1000
            for turn in range(2):
                # 先给 0.6s 静音让 VAD 稳定
                sil = bytes(16000*2*6//10)
                for i in range(0, len(sil), chunk):
                    await ev(f"S.ws.send(JSON.stringify({{type:'input_audio_buffer.append',audio:'{base64.b64encode(sil[i:i+chunk]).decode()}'}}));0")
                    await asyncio.sleep(0.04)
                # 喂 WAV
                for i in range(0, len(pcm), chunk):
                    await ev(f"S.ws.send(JSON.stringify({{type:'input_audio_buffer.append',audio:'{base64.b64encode(pcm[i:i+chunk]).decode()}'}}));0")
                    await asyncio.sleep(0.04)
                # 尾部静音触发判停
                sil2 = bytes(16000*2*2)
                for i in range(0, len(sil2), chunk):
                    await ev(f"S.ws.send(JSON.stringify({{type:'input_audio_buffer.append',audio:'{base64.b64encode(sil2[i:i+chunk]).decode()}'}}));0")
                    await asyncio.sleep(0.04)
                # 等这一轮说完并播完
                await asyncio.sleep(10)
                dom = await ev("JSON.stringify({nBots:document.querySelectorAll('.row.bot').length,"
                               "nUsers:document.querySelectorAll('.row.user').length,"
                               "bots:[...document.querySelectorAll('.row.bot .bubble')].map(b=>b.textContent),"
                               "users:[...document.querySelectorAll('.row.user .bubble')].map(b=>b.textContent)})")
                print(f"\n=== 第 {turn+1} 轮后 DOM ===")
                print(dom)
            frames = await ev("JSON.stringify(window.__frames)")
            print("\n收到帧计数:", frames)
            print("JS 异常:", errors[:5] if errors else "无")
    finally:
        proc.kill()

asyncio.run(main())
