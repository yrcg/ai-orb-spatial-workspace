#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""DashScope 三通道连通性实测：Realtime / STT(ASR) / TTS。

用法：python _test_dashscope_channels.py
"""
import asyncio
import json
import os

try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), ".env"))
except Exception:
    pass
KEY = os.environ.get("DASHSCOPE_API_KEY", "")
if not KEY:
    raise SystemExit("缺少 DASHSCOPE_API_KEY，请检查项目根目录的 .env")

KEY_OLD = "sk-ws-H.PPRRLLM.tPsP.MEUCIHUf9dDTJctDrNjRoI4JYsxN9dL6Ody2mJ75Oh1VeJyjAiEA3emsTI334qLG7jH-O7ecXQVR6MXCuZilV1Ne5_a35yo"
WS_BASE = "wss://dashscope.aliyuncs.com/api-ws/v1/inference"
RT_BASE = "wss://dashscope.aliyuncs.com/api-ws/v1/realtime"


async def _connect(url, timeout=15):
    from websockets.asyncio.client import connect
    kw = {"open_timeout": timeout}
    try:
        return await connect(url, additional_headers={"Authorization": "Bearer " + KEY}, **kw).__aenter__()
    except TypeError:
        return await connect(url, extra_headers={"Authorization": "Bearer " + KEY}, **kw).__aenter__()


async def _drain(ws, n=4, timeout=12):
    out = []
    for _ in range(n):
        try:
            msg = await asyncio.wait_for(ws.recv(), timeout=timeout)
        except asyncio.TimeoutError:
            out.append("(timeout)")
            break
        except Exception as e:
            out.append("(closed: %s)" % type(e).__name__)
            break
        s = msg if isinstance(msg, str) else "<binary %d bytes>" % len(msg)
        out.append(s[:300])
        if "task-failed" in s or "error" in s.lower():
            break
    return out


async def test_realtime(model):
    print("\n===== REALTIME: %s =====" % model)
    url = RT_BASE + "?model=" + model
    try:
        ws = await _connect(url)
    except Exception as e:
        print("  连接失败:", type(e).__name__, str(e)[:200])
        return
    print("  连接成功")
    upd = {
        "type": "session.update",
        "session": {
            "modalities": ["text", "audio"],
            "voice": "Cherry",
            "instructions": "你是瀚涛百事通，回答简洁。",
            "turn_detection": {"type": "server_vad"},
        },
    }
    await ws.send(json.dumps(upd))
    for line in await _drain(ws, 5):
        print("   <-", line)
    # 试 text 触发一次（验证是否真能出内容）
    try:
        await ws.send(json.dumps({"type": "conversation.item.create", "item": {
            "type": "message", "role": "user",
            "content": [{"type": "input_text", "text": "用一句话介绍你自己"}]}}))
        await ws.send(json.dumps({"type": "response.create"}))
        for line in await _drain(ws, 8, timeout=20):
            print("   <-", line)
    except Exception as e:
        print("  发送失败:", type(e).__name__, str(e)[:150])
    try:
        await ws.close()
    except Exception:
        pass


async def test_stt(model):
    print("\n===== STT: %s =====" % model)
    try:
        ws = await _connect(WS_BASE)
    except Exception as e:
        print("  连接失败:", type(e).__name__, str(e)[:200])
        return
    print("  连接成功")
    task_id = "t-stt-001"
    run = {"header": {"action": "run-task", "task_id": task_id, "streaming": "duplex"},
           "payload": {"task_group": "audio", "task": "asr", "function": "recognition",
                       "model": model,
                       "parameters": {"format": "pcm", "sample_rate": 16000,
                                      "heartbeat": True, "language_hints": ["zh"]},
                       "input": {}}}
    await ws.send(json.dumps(run))
    for line in await _drain(ws, 3):
        print("   <-", line)
    try:
        await ws.close()
    except Exception:
        pass


async def test_tts(model, voice):
    print("\n===== TTS: %s (voice=%s) =====" % (model, voice))
    try:
        ws = await _connect(WS_BASE)
    except Exception as e:
        print("  连接失败:", type(e).__name__, str(e)[:200])
        return
    print("  连接成功")
    task_id = "t-tts-001"
    run = {"header": {"action": "run-task", "task_id": task_id, "streaming": "duplex"},
           "payload": {"task_group": "audio", "task": "tts", "function": "SpeechSynthesizer",
                       "model": model,
                       "parameters": {"text_type": "PlainText", "voice": voice,
                                      "format": "pcm", "sample_rate": 24000},
                       "input": {}}}
    await ws.send(json.dumps(run))
    for line in await _drain(ws, 3):
        print("   <-", line)
    cont = {"header": {"action": "continue-task", "task_id": task_id, "streaming": "duplex"},
            "payload": {"input": {"text": "你好，我是瀚涛百事通。"}}}
    await ws.send(json.dumps(cont))
    await ws.send(json.dumps({"header": {"action": "finish-task", "task_id": task_id,
                                         "streaming": "duplex"}, "payload": {"input": {}}}))
    for line in await _drain(ws, 5, timeout=15):
        print("   <-", line)
    try:
        await ws.close()
    except Exception:
        pass


async def main():
    await test_realtime("qwen-audio-3.0-realtime-flash")
    await test_stt("paraformer-realtime-v2")
    await test_stt("paraformer-v2")
    await test_tts("cosyvoice-v3-flash", "longanyang")
    await test_tts("cosyvoice-v2", "longxiaochun_v2")


if __name__ == "__main__":
    print("DashScope 三通道实测（key: %s...%s）" % (KEY[:12], KEY[-6:]))
    asyncio.run(main())
