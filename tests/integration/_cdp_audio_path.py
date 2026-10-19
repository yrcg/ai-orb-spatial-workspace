#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""页面级语音链路实测：音频帧到底有没有到页面、有没有进播放队列。

背景：.22 换上游后用户反馈"回复没有语音"。日志里 first_audio=0 不可信
（turnT0 在 .22 后再没被赋值，latency_first_audio 永远不记——埋点假象）。
探针证实上游+中继都能出音频（v5：48 帧），所以问题若在页面侧，只可能是
「收到不解码」或「解码了不播」。本测试直接驱动真实页面给出答案。

用法：python tests/_cdp_audio_path.py [http://127.0.0.1:8770]
"""
import asyncio
import base64
import json
import os
import subprocess
import sys
import tempfile
import time
import urllib.request
import wave

CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
PORT = 9337
BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8770").rstrip("/")
HERE = os.path.dirname(os.path.abspath(__file__))

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
    prof = tempfile.mkdtemp(prefix="cdp-audio-")
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
        mid = 0
        async with connect(page["webSocketDebuggerUrl"], max_size=64 * 1024 * 1024) as ws:
            async def send(method, params=None):
                nonlocal mid
                mid += 1
                await ws.send(json.dumps({"id": mid, "method": method, "params": params or {}}))
                return mid

            async def ev(expr):
                await send("Runtime.evaluate",
                           {"expression": expr, "awaitPromise": True, "returnByValue": True})
                while True:
                    m = json.loads(await ws.recv())
                    if m.get("id") == mid:
                        return m.get("result", {}).get("result", {}).get("value")
                    # 内联收割：异常 / console.error 都记下来（不另起 recv 协程）
                    if m.get("method") == "Runtime.exceptionThrown":
                        d = m["params"]["exceptionDetails"]
                        errors.append("EXCEPTION: " + str(d.get("exception", {}).get("description") or d.get("text")))
                    elif m.get("method") == "Runtime.consoleAPICalled" and m["params"].get("type") == "error":
                        errors.append("CONSOLE.ERROR: " + " ".join(
                            str(a.get("value", a.get("description", ""))) for a in m["params"]["args"]))

            async def pump(sec):
                await asyncio.sleep(sec)

            await pump(2.0)
            print("── 1. 起语音会话（真连中继）──")
            r = await ev("startVoice(); 'ok'")
            check("startVoice 已调用", r == "ok", str(r))
            ok = False
            for _ in range(40):
                await pump(0.5)
                v = await ev("S.ws && S.ws.readyState===1")
                if v:
                    ok = True
                    break
            check("语音 WS 已连上", ok)
            await pump(2.0)

            print("── 2. 给页面的 enqueueAudio 挂计数器 ──")
            await ev("window.__nAudio = 0; window.__rms = 0; window.__f32len = 0;"
                     "const _orig = enqueueAudio;"
                     "enqueueAudio = function(f){ window.__nAudio++;"
                     "  let s=0; for (let i=0;i<f.length;i++) s += f[i]*f[i];"
                     "  window.__rms = Math.sqrt(s/Math.max(1,f.length));"
                     "  window.__f32len = f.length;"
                     "  try { _orig(f); } catch(e){ window.__playErr = String(e); } };"
                     "'ok'")

            print("── 3. 用页面自己的 WS 灌真实音频（绕过麦克风）──")
            wav = os.path.join(os.path.dirname(HERE), "fixtures", "_probe_speech.wav")
            with wave.open(wav, "rb") as w:
                pcm = w.readframes(w.getnframes())
            b64 = base64.b64encode(pcm).decode()
            # 分 40ms 块推（和 mic 上行一个节奏）
            chunk = 16000 * 2 * 40 // 1000
            for i in range(0, len(pcm), chunk):
                await ev(f"S.ws.send(JSON.stringify({{type:'input_audio_buffer.append',"
                         f"audio:'{base64.b64encode(pcm[i:i+chunk]).decode()}'}})); 'ok'")
                await pump(0.04)
            print(f"    已推 {len(pcm)/32000:.1f}s 音频")

            print("── 4. 等模型响应（最多 40s）──")
            for _ in range(80):
                await pump(0.5)
                v = await ev("window.__nAudio")
                if v:
                    break
            # 再多等一轮，让整段回答播完，统计总帧数
            for _ in range(30):
                await pump(0.5)
                v = await ev("window.__nAudio")
                done = await ev("!isSpeaking() && window.__nAudio > 0")
                if done:
                    break
            n_audio = await ev("window.__nAudio")
            check("页面收到了音频帧（enqueueAudio 被调用）", bool(n_audio), f"总帧数={n_audio}")
            rms = await ev("window.__rms")
            check("解码出的 float32 不是静音", bool(rms) and rms > 0.001, f"RMS={rms}")
            play_err = await ev("window.__playErr || ''")
            check("播放入队无异常", not play_err, str(play_err))
            st = await ev("JSON.stringify({state:S.state, outState:S.outCtx?S.outCtx.state:'none',"
                          "nextPlay:S.nextPlay, cur:S.outCtx?S.outCtx.currentTime:-1,"
                          "playing:S.playing, f32len:window.__f32len})")
            print("    播放状态:", st)
            so = json.loads(st) if st else {}
            check("AudioContext 在 running", so.get("outState") == "running", str(so.get("outState")))
            n_bot = await ev("document.querySelectorAll('.row.bot').length")
            bot_txt = await ev("document.querySelector('.row.bot .bubble')?"
                               "document.querySelector('.row.bot .bubble').textContent:''")
            check("有 AI 气泡产出", bool(n_bot), f"气泡数={n_bot} 文本={str(bot_txt)[:60]!r}")

            print("── 5. JS 异常 ──")
            check("无 JS 异常", not errors, "; ".join(errors[:4]))
    finally:
        proc.kill()

    print(f"\n结果：{len(PASS)} 通过 / {len(FAIL)} 失败")
    sys.exit(0 if not FAIL else 1)


asyncio.run(main())
