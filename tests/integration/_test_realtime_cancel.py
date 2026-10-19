#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""验证 Qwen-Audio-Realtime 是否支持**客户端主动打断**（response.cancel）。

这是我们"把 MiniCPM-o 换成 Qwen-Audio-Realtime"路线的唯一未验证风险点：
  · MiniCPM-o 靠 `input.append.force_listen` 让位
  · Qwen（OpenAI 风格）应该靠 `response.cancel`

测试流程：
  1. 让模型讲一个长故事（文本触发，避免音频复杂度）
  2. 收到若干 audio/text delta 后发 `{"type": "response.cancel"}`
  3. 观察：是否收到 response.done(status=cancelled)、cancel 之后是否还有新 delta

判定：
  ✅ cancel 后立刻 response.done 且不再有新 delta  → 支持主动打断
  ❌ 忽略 cancel、继续输出                        → 不支持（需要另想办法）

用法：python _test_realtime_cancel.py
"""
import asyncio
import json
import os
import time

from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), ".env"))
KEY = os.environ["DASHSCOPE_API_KEY"]
MODEL = os.getenv("QWEN_REALTIME_MODEL", "qwen-audio-3.0-realtime-flash")
URL = f"wss://dashscope.aliyuncs.com/api-ws/v1/realtime?model={MODEL}"


async def main():
    from websockets.asyncio.client import connect

    print(f"模型：{MODEL}")
    async with connect(URL, additional_headers={"Authorization": "Bearer " + KEY},
                       open_timeout=15) as ws:
        await ws.send(json.dumps({
            "type": "session.update",
            "session": {"modalities": ["text", "audio"], "voice": "longanqian",
                        "instructions": "你是语音助手，回答口语化。", "turn_detection": None},
        }))

        # 1) 让它讲长故事
        await ws.send(json.dumps({
            "type": "conversation.item.create",
            "item": {"type": "message", "role": "user",
                     "content": [{"type": "input_text", "text": "给我讲一个很长的童话故事，至少五百字。"}]},
        }))
        await ws.send(json.dumps({"type": "response.create"}))

        t_start = time.time()
        cancel_sent = False
        deltas_before = deltas_after = 0
        audio_bytes_before = audio_bytes_after = 0
        transcript = ""
        cancel_at = None
        done_after_cancel = None
        status = None

        deadline = time.time() + 60
        while time.time() < deadline:
            try:
                raw = await asyncio.wait_for(ws.recv(), timeout=20)
            except asyncio.TimeoutError:
                print("  (超时)")
                break

            # 收到第一段内容后 2 秒发 cancel
            if not cancel_sent and time.time() - t_start > 2.0 and (deltas_before > 0):
                print(f"  → 已收到 {deltas_before} 个 delta，发出 response.cancel")
                await ws.send(json.dumps({"type": "response.cancel"}))
                cancel_sent = True
                cancel_at = time.time()

            if isinstance(raw, bytes):
                if cancel_sent:
                    audio_bytes_after += len(raw)
                else:
                    audio_bytes_before += len(raw)
                continue

            ev = json.loads(raw)
            t = ev.get("type", "")

            if t in ("response.audio_transcript.delta", "response.text.delta"):
                d = ev.get("delta", "")
                if cancel_sent:
                    deltas_after += 1
                    transcript += d
                else:
                    deltas_before += 1
            elif t in ("response.audio.delta", "response.output_audio.delta"):
                if cancel_sent:
                    audio_bytes_after += 1
                else:
                    audio_bytes_before += 1
            elif t == "response.done":
                status = (ev.get("response") or {}).get("status")
                if cancel_sent:
                    done_after_cancel = time.time() - cancel_at
                print(f"  [response.done] status={status}")
                break
            elif t == "error":
                print("  ⚠ error:", json.dumps(ev.get("error"), ensure_ascii=False)[:160])
                break

        print()
        print("─" * 56)
        print(f"  cancel 前：{deltas_before} 个文本 delta")
        print(f"  cancel 后：{deltas_after} 个文本 delta，音频块 {audio_bytes_after}")
        print(f"  response.done status = {status}")
        if done_after_cancel is not None:
            print(f"  cancel → done 间隔 = {done_after_cancel*1000:.0f} ms")
        print("─" * 56)
        if cancel_sent and status == "cancelled":
            print("  ✅ 支持客户端主动打断（response.cancel 生效）")
        elif cancel_sent and deltas_after <= 2:
            print("  ⚠️  cancel 后基本停止（status=%s）—— 可能支持，需二次确认" % status)
        elif not cancel_sent:
            print("  ❌ 没能触发 cancel（模型没开始输出？）")
        else:
            print("  ❌ cancel 似乎被忽略（后续仍有大量输出）")


asyncio.run(main())
