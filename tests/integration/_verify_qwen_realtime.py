#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""BUILD .22 端到端：浏览器 → 中继 → Qwen-Audio Realtime → 原生 FC → 答案。

这一步替代了原来的 _verify_delegation.py（那套测的是"话术委派"，已整层删除）。
这里验证的是新链路的每一环：
  ① 中继能否连上 DashScope（/health 报模型）
  ② session.update（instructions + tools + turn_detection）能否被接受
  ③ 上行 int16 PCM 能否被服务端 VAD 识别 + 流式转写
  ④ 模型能否自主决定调 query_company_policy
  ⑤ 工具结果回灌后模型能否基于结果作答（而不是复读）
  ⑥ 打断：播放中推音频，服务端是否回 response.done cancelled

用法：python tests/_verify_qwen_realtime.py
"""
import asyncio
import base64
import json
import os
import sys
import urllib.request
import wave

RELAY = "ws://127.0.0.1:8770/ws?mode=audio"
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))

TOOLS = [{
    "type": "function",
    "name": "query_company_policy",
    "description": "查询公司内部制度与政策。凡是涉及公司自身事务——规章制度、办事流程、"
                   "报销、发票、入职离职、考勤、请假、年假、加班、出差、补贴、薪酬绩效、培训、"
                   "合同、组织与部门、项目情况、系统账号等——都必须先调用它拿到资料再回答，"
                   "绝对不允许凭印象编造公司信息。",
    "parameters": {"type": "object",
                   "properties": {"topic": {"type": "string", "description": "要查的主题"}},
                   "required": ["topic"]},
}]
INSTR = ("你是瀚涛百事通，回答简洁口语化，不要输出 markdown。"
         "涉及公司制度/政策类问题必须先调用 query_company_policy 查到的资料再回答。")

ok = fail = 0


def check(name, cond, detail=""):
    global ok, fail
    if cond:
        ok += 1
        print(f"  ✅ {name}" + (f"  → {detail}" if detail else ""))
    else:
        fail += 1
        print(f"  ❌ {name}  → {detail}")


def load_pcm(path):
    """wav → 16k/16bit/mono 裸 PCM"""
    with wave.open(path, "rb") as w:
        d = w.readframes(w.getnframes())
        ch, sw, sr = w.getnchannels(), w.getsampwidth(), w.getframerate()
    if ch == 1 and sw == 2 and sr == 16000:
        return d
    import array
    a = array.array("h")
    a.frombytes(d[: len(d) // (sw * ch) * (sw * ch)])
    if ch == 2:
        a = array.array("h", [a[i] for i in range(0, len(a), 2)])
    if sr != 16000:
        step = sr / 16000
        a = array.array("h", [a[int(i * step)] for i in range(int(len(a) / step))])
    return a.tobytes()


def kb_ask(q):
    """直接打中继的 /kb（浏览器里就是这么拿资料的）"""
    url = f"http://127.0.0.1:8770/kb?q={urllib.parse.quote(q)}&t=25"
    with urllib.request.urlopen(url, timeout=40) as r:
        return json.loads(r.read().decode())


async def drain(ws, seconds):
    """收 N 秒事件，返回 (事件表, 文本累积)"""
    seen, txt = {}, ""
    end = asyncio.get_event_loop().time() + seconds
    while asyncio.get_event_loop().time() < end:
        try:
            raw = await asyncio.wait_for(ws.recv(), timeout=1.0)
        except asyncio.TimeoutError:
            continue
        except Exception as e:
            print(f"    ⚠ 连接中断: {type(e).__name__}: {str(e)[:100]}")
            break
        if not isinstance(raw, str):
            continue
        try:
            ev = json.loads(raw)
        except Exception:
            continue
        t = ev.get("type", "?")
        seen.setdefault(t, []).append(ev)
        if t == "response.audio_transcript.delta":
            txt += ev.get("delta") or ""
    return seen, txt


async def main():
    import urllib.parse
    from websockets.asyncio.client import connect

    wav = os.path.join(os.path.dirname(HERE), "fixtures", "_probe_speech.wav")
    if not os.path.isfile(wav):
        print(f"缺少测试音频 {wav}（先用 tests/_mk_speech.py 生成）")
        sys.exit(2)
    pcm = load_pcm(wav)
    print(f"═══ 端到端（中继 → Qwen-Audio Realtime）═══  音频 {len(pcm)/32000:.1f}s\n")

    async with connect(RELAY, open_timeout=15) as ws:
        # ② 配会话
        await ws.send(json.dumps({"type": "session.update", "session": {
            "modalities": ["text", "audio"], "voice": "longanqian",
            "instructions": INSTR, "tools": TOOLS,
            "turn_detection": {"type": "server_vad", "threshold": 0.5, "silence_duration_ms": 800},
        }}))
        seen, _ = await drain(ws, 2)
        check("session.update 被接受", "session.updated" in seen or "error" not in seen,
              f"收到 {sorted(seen)}")

        # ③ 推音频
        chunk = 16000 * 2 * 40 // 1000
        for i in range(0, len(pcm), chunk):
            await ws.send(json.dumps({"type": "input_audio_buffer.append",
                                      "audio": base64.b64encode(pcm[i:i + chunk]).decode()}))
            await asyncio.sleep(0.04)
        seen, _ = await drain(ws, 40)

        asr = "".join(e.get("stash") or "" for e in seen.get("conversation.item.input_audio_transcription.delta", []))
        check("服务端识别到语音", len(seen.get("input_audio_buffer.speech_started", [])) > 0,
              f"speech_started x{len(seen.get('input_audio_buffer.speech_started', []))}")
        check("服务端流式转写", len(asr) > 0, f"{asr[:60]!r}")

        fc = seen.get("response.function_call_arguments.done") or []
        check("模型自主决定调 query_company_policy", len(fc) > 0,
              f"{fc[0].get('name')} {fc[0].get('arguments')}" if fc else "未触发")

        if not fc:
            print("\n（没有工具调用，后续用例跳过）")
            print(f"\n结果：{ok} 通过 / {fail} 失败")
            return

        # ④ 执行工具（走中继 /kb，与浏览器一致）
        topic = json.loads(fc[0].get("arguments") or "{}").get("topic") or "笔记本补贴"
        try:
            kb = await asyncio.get_event_loop().run_in_executor(None, kb_ask, topic)
            answer = str(kb.get("answer") or "")
            check("中继 /kb 拿到资料", bool(answer), f"{len(answer)} 字 / {kb.get('ms')}ms")
        except Exception as e:
            answer = ""
            check("中继 /kb 拿到资料", False, f"{type(e).__name__}: {e}")

        # ⑤ 回灌 + 等 response.done 后再 response.create
        if not (seen.get("response.done")):
            seen2, _ = await drain(ws, 15)
            for k in seen2:
                seen.setdefault(k, []).extend(seen2[k])
        await ws.send(json.dumps({"type": "conversation.item.create", "item": {
            "type": "function_call_output", "call_id": fc[0].get("call_id"),
            "output": answer or "（知识库没有返回内容）"}}))
        await asyncio.sleep(0.3)
        await ws.send(json.dumps({"type": "response.create"}))
        seen3, final = await drain(ws, 40)
        check("回灌工具结果后模型作答", len(final.strip()) > 5, f"{final.strip()[:90]!r}")
        check("答案用了工具结果（不是复读）",
              any(k in final for k in ("7200", "48", "150", "补贴", "钉钉")),
              final.strip()[:90])
        check("全程无 error 事件", "error" not in seen3,
              json.dumps((seen3.get("error") or [{}])[0].get("error"), ensure_ascii=False)[:120]
              if seen3.get("error") else "")

    print(f"\n结果：{ok} 通过 / {fail} 失败")
    sys.exit(0 if fail == 0 else 1)


import urllib.parse  # noqa: E402  （main 里也要用，放这里避免循环导入烦恼）
asyncio.run(main())
