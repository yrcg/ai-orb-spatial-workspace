#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""真实端到端验证「文字链路 → 公司知识库」（BUILD .17）——**需要中继在跑 + 真实上游**。

覆盖：
  A 中继 KB 代理（GET /kb）：连通性、返回真实内容、耗时
  B 文字链路端到端：输入「我们公司的考勤制度是怎样的？」→ 模型自己决定调 KB
    → 客户端查 → 模型用自己的话作答；断言：答案非空、**无工具卡片**、
    **气泡里不出现 [[ 标记**、内容确实与考勤有关
  C 本地实时信息（现在几点）仍然走本地查值，同样无卡片
  D 短寒暄仍走单轮快路径（不该触发任何工具）

用法：python _verify_kb_integration.py [http://127.0.0.1:8770]
注意：会消耗真实上游额度 + 打真实知识库（每问 ~12s），所以只跑少数几问。
"""
import asyncio
import json
import subprocess
import sys
import tempfile
import time
import urllib.request

CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
PORT = 9338
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
    prof = tempfile.mkdtemp(prefix="cdp-kb-")
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

            def harvest(m):
                if m.get("method") == "Runtime.exceptionThrown":
                    d = m["params"]["exceptionDetails"]
                    errors.append("EXCEPTION: " + str(d.get("exception", {}).get("description") or d.get("text")))
                elif m.get("method") == "Runtime.consoleAPICalled" and m["params"]["type"] == "error":
                    txt = " ".join(str(a.get("value", a.get("description", ""))) for a in m["params"]["args"])
                    errors.append("CONSOLE.ERROR: " + txt)

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

            async def ev(expr, timeout=60):
                i = await send("Runtime.evaluate",
                               {"expression": expr, "awaitPromise": True, "returnByValue": True})
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

            build = await ev("BUILD")
            print(f"构建号：{build}")

            # ── A. 中继 KB 代理 ───────────────────────────────────────
            print("\n── A. 中继 /kb 代理 ──")
            h = await ev("fetch('http://' + RELAY_HOST + '/health').then(r=>r.text())", timeout=20)
            try:
                hj = json.loads(h or "{}")
            except Exception:
                hj = {}
            check("中继 /health 可用且暴露 kb 地址", bool(hj.get("kb")), str(h)[:120])

            kb = await ev("""
              (async () => {
                const t0 = performance.now();
                const r = await fetch('http://' + RELAY_HOST + '/kb?q=' + encodeURIComponent('我们公司的考勤制度是怎样的？') + '&t=40');
                const j = await r.json();
                return JSON.stringify({ ok: j.ok, ms: Math.round(performance.now()-t0),
                                        kbMs: j.ms, chars: (j.answer||'').length,
                                        refs: (j.refs||[]).length, head: (j.answer||'').slice(0, 60) });
              })()
            """, timeout=90)
            k = json.loads(kb) if isinstance(kb, str) else {}
            print("     ", kb)
            check("KB 代理返回 ok", k.get("ok") is True, str(k))
            check("KB 返回真实内容（>200 字）", (k.get("chars") or 0) > 200, str(k.get("chars")))
            check("KB 带回引用列表", (k.get("refs") or 0) > 0, str(k.get("refs")))
            print(f"      · 端到端 {k.get('ms')} ms（KB 自身 {k.get('kbMs')} ms）")

            # ── B. 文字链路端到端（公司知识库）────────────────────────
            print("\n── B. 文字链路 → 公司知识库（端到端，多问）──")
            # 直接 await 这一轮（askText 的 promise 在最终作答渲染完后 resolve），
            # 不做 DOM 轮询 —— 轮询会被 ev 超时吞掉结果，第一版就是这么误报的。
            # .20：扩成多问（含用户真机问过的「笔记本补贴」），确认"不同问题"都能走通。
            CASES = [
                ("我们公司的考勤制度是怎样的？", ("考勤", "打卡", "上班", "小时", "钉钉")),
                ("笔记本补贴政策是什么？", ("笔记本", "补贴", "电脑", "人才")),
                ("员工的年假有几天？", ("年假", "天", "年限")),
            ]
            for qi, (q, kws) in enumerate(CASES, 1):
                print(f"\n  [B{qi}] {q}")
                await ev("(() => { msgsEl.innerHTML=''; S.curBotRow=null; S.curBotBubble=null;"
                         "S.lastBotRow=null; S.lastBotBubble=null; S.newTurnPending=false; return true; })()")
                await ev("askText(" + json.dumps(q, ensure_ascii=False) + ")", timeout=200)
                got = await ev("""JSON.stringify({txt:(msgsEl.innerText||'').trim(),
                    cards:document.querySelectorAll('.tool-card').length})""", timeout=30)
                ans = json.loads(got) if isinstance(got, str) else {}
                body = ans.get("txt") or ""
                print("      答案：", body[:260].replace("\n", " | "))
                check(f"B{qi} 端到端出答案（非空）", len(body) > 30, f"{len(body)} 字")
                check(f"B{qi} 答案与问题相关", any(w in body for w in kws), body[:80])
                check(f"B{qi} 无工具标记（[[）", "[[" not in body)
                check(f"B{qi} 无工具卡片元素", ans.get("cards") == 0, str(ans.get("cards")))
                check(f"B{qi} 不提「工具/知识库」",
                      ("工具" not in body) and ("知识库" not in body), body[:80])

            # ── C. 本地实时信息仍走本地查值 ────────────────────────────
            print("\n── C. 本地实时信息（现在几点）──")
            await ev("(() => { msgsEl.innerHTML=''; S.curBotRow=null; S.curBotBubble=null;"
                     "S.lastBotRow=null; S.lastBotBubble=null; S.newTurnPending=false; return true; })()")
            await ev("askText('现在几点了？')", timeout=90)
            got2 = await ev("""JSON.stringify({txt:(msgsEl.innerText||'').trim(),
                cards:document.querySelectorAll('.tool-card').length})""", timeout=30)
            o2 = json.loads(got2) if isinstance(got2, str) else {}
            t2 = o2.get("txt") or ""
            print("      答案：", t2[:160].replace("\n", " | "))
            check("本地实时信息仍能作答（含「点」）", "点" in t2, t2[:60])
            check("本地查值同样不出卡片", o2.get("cards") == 0, str(o2.get("cards")))
            check("本地答案里没有标记", "[[" not in t2, t2[:60])

            # ── D. 短寒暄走快路径 ─────────────────────────────────────
            print("\n── D. 短寒暄（快路径）──")
            need = await ev("JSON.stringify({hi: mightNeedTool('你好'), thx: mightNeedTool('谢谢'),"
                            " kb: mightNeedTool('公司考勤制度是怎样的'), lk: mightNeedTool('现在几点')})")
            n = json.loads(need) if isinstance(need, str) else {}
            check("「你好」不触发判断轮", n.get("hi") is False, str(n))
            check("「谢谢」不触发判断轮", n.get("thx") is False, str(n))
            check("「公司考勤制度是怎样的」触发判断轮", n.get("kb") is True, str(n))
            check("「现在几点」触发判断轮", n.get("lk") is True, str(n))

            print("\n── E. JS 异常 ──")
            ignore = ("favicon", "net::ERR", "Failed to load resource", "ERR_CONNECTION")
            real = [e for e in errors if not any(kk in e for kk in ignore)]
            check("无未捕获 JS 异常", not real, "; ".join(real[:3]))

        print("\n" + "=" * 60)
        print(f"  通过 {len(PASS)} / {len(PASS) + len(FAIL)}")
        if FAIL:
            print("  失败：" + "、".join(FAIL))
        print("=" * 60)
        return 1 if FAIL else 0
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except Exception:
            proc.kill()


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
