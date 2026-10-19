#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""决定性实验：绕过 LiveKit，用**原生协议**直测 Qwen-Audio Realtime 的 Function Calling。

目的：区分「模型不支持/有 bug」还是「LiveKit 插件适配有问题」。
  原生协议下 FC 正常 → 是插件的问题
  原生协议下也复读     → 是模型的问题

流程（OpenAI Realtime 风格）：
  1. session.update（带 tools）
  2. conversation.item.create(text) + response.create
  3. 等 response.function_call_arguments.done
  4. conversation.item.create(function_call_output) + response.create
  5. 看模型是否**基于工具结果**作答（而不是复读）

用法：python _test_realtime_fc.py [flash|plus]
"""
import asyncio
import json
import os
import sys

from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), ".env"))
KEY = os.environ["DASHSCOPE_API_KEY"]
VARIANT = sys.argv[1] if len(sys.argv) > 1 else "flash"
MODEL = f"qwen-audio-3.0-realtime-{VARIANT}"
URL = f"wss://dashscope.aliyuncs.com/api-ws/v1/realtime?model={MODEL}"

TOOLS = [{
    "type": "function",
    "name": "get_company_policy",
    "description": "查询公司制度/政策。用户问到考勤、请假、报销、发票、年假、补贴等公司规定时调用。",
    "parameters": {
        "type": "object",
        "properties": {"topic": {"type": "string", "description": "查询主题"}},
        "required": ["topic"],
    },
}]
FAKE_RESULT = "上限7200元；每月约150元，共补贴48个月；需钉钉提交发票，四级审批。"


async def main():
    from websockets.asyncio.client import connect

    print(f"模型：{MODEL}")
    async with connect(URL, additional_headers={"Authorization": "Bearer " + KEY},
                       open_timeout=15) as ws:
        # 1) 配置会话 + 注册工具
        await ws.send(json.dumps({
            "type": "session.update",
            "session": {
                "modalities": ["text", "audio"],
                "voice": "longanqian",
                "instructions": "你是「瀚涛百事通」，简洁口语化回答。公司制度类问题必须调 get_company_policy。",
                "tools": TOOLS,
                "turn_detection": None,
            },
        }))

        # 2) 发用户问题（文本，避免音频复杂度）
        await ws.send(json.dumps({
            "type": "conversation.item.create",
            "item": {"type": "message", "role": "user",
                     "content": [{"type": "input_text", "text": "公司的笔记本补贴是多少？"}]},
        }))
        await ws.send(json.dumps({"type": "response.create"}))

        call_id = None
        tool_round_text = ""
        step = 1
        deadline = asyncio.get_event_loop().time() + 60

        while asyncio.get_event_loop().time() < deadline:
            try:
                raw = await asyncio.wait_for(ws.recv(), timeout=25)
            except asyncio.TimeoutError:
                print("  (超时)")
                break
            if not isinstance(raw, str):
                continue
            try:
                ev = json.loads(raw)
            except Exception:
                continue
            t = ev.get("type", "")

            if t == "session.created":
                s = ev.get("session", {})
                print(f"  [会话建立] tools 字段返回: {'有' if s.get('tools') else '无'} | "
                      f"tools 数量={len(s.get('tools') or [])} | turn_detection={s.get('turn_detection')}")
            elif t == "response.function_call_arguments.done":
                call_id = ev.get("call_id")
                print(f"  ✅ 模型请求调工具: name={ev.get('name')} args={ev.get('arguments')}")
            elif t == "response.output_item.done":
                it = ev.get("item") or {}
                if it.get("type") == "function_call":
                    call_id = call_id or it.get("call_id")
                    print(f"  ✅ [output_item.done] function_call: {it.get('name')} {it.get('arguments')}")
            elif t in ("response.audio_transcript.delta", "response.text.delta"):
                tool_round_text += ev.get("delta", "")
            elif t == "response.done":
                print(f"  [第{step}轮 response.done]")
                if step == 1:
                    if not call_id:
                        print("  ❌ 第一轮没有产生 function_call —— 模型没调工具")
                        break
                    # 3) 回传工具结果 + 再问一轮
                    print(f"  → 回传工具结果: {FAKE_RESULT[:30]}…")
                    await ws.send(json.dumps({
                        "type": "conversation.item.create",
                        "item": {"type": "function_call_output",
                                 "call_id": call_id, "output": FAKE_RESULT},
                    }))
                    await ws.send(json.dumps({"type": "response.create"}))
                    step = 2
                    continue
                # 第二轮：看模型说了什么
                final = tool_round_text.strip()
                print(f"  📢 模型最终回复: {final[:200]}")
                if "7200" in final or "48" in final or "150" in final:
                    print("  ✅✅ 模型**正确使用了工具结果** —— 原生协议 FC 正常！")
                else:
                    print("  ❌ 模型没有使用工具结果（疑似复读/答非所问）")
                break
            elif t == "error":
                print(f"  ⚠ error: {json.dumps(ev.get('error'), ensure_ascii=False)[:200]}")
                break


asyncio.run(main())
