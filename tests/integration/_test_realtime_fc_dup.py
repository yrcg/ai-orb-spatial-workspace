"""验证假设：LiveKit 把 chat_ctx 里的用户消息同步回服务端 → 与 Qwen 自己的音频转写重复 → 模型上下文混乱复读。

模拟：发两次相同的用户消息（第二次模拟 LiveKit 的转写同步），看模型是否复读。
"""
import asyncio, json, os, sys
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), ".env"))
KEY = os.environ["DASHSCOPE_API_KEY"]
URL = "wss://dashscope.aliyuncs.com/api-ws/v1/realtime?model=qwen-audio-3.0-realtime-flash"
TOOLS = [{"type":"function","name":"get_company_policy",
          "description":"查询公司制度/政策。用户问到考勤、报销、补贴等公司规定时调用。",
          "parameters":{"type":"object","properties":{"topic":{"type":"string"}},"required":["topic"]}}]

async def main(duplicate: bool):
    from websockets.asyncio.client import connect
    tag = "重复消息(模拟LiveKit同步)" if duplicate else "单条消息(对照)"
    print(f"\n########## {tag} ##########")
    async with connect(URL, additional_headers={"Authorization": "Bearer " + KEY}, open_timeout=15) as ws:
        await ws.send(json.dumps({"type":"session.update","session":{
            "modalities":["text","audio"],"voice":"longanqian",
            "instructions":"公司制度类问题必须调 get_company_policy。",
            "tools":TOOLS,"turn_detection":None}}))
        async def item(text):
            await ws.send(json.dumps({"type":"conversation.item.create","item":{
                "type":"message","role":"user","content":[{"type":"input_text","text":text}]}}))
        Q = "公司的笔记本补贴是多少？"
        await item(Q)
        await ws.send(json.dumps({"type":"response.create"}))
        call_id=None; text=""; step=1
        import time; deadline=time.time()+70
        while time.time()<deadline:
            try: raw=await asyncio.wait_for(ws.recv(), timeout=25)
            except asyncio.TimeoutError: print("  (超时)"); break
            if not isinstance(raw,str): continue
            ev=json.loads(raw); t=ev.get("type","")
            if t=="response.function_call_arguments.done":
                call_id=ev.get("call_id"); print(f"  ✅ 调工具: {ev.get('name')} {ev.get('arguments')}")
            elif t in ("response.audio_transcript.delta","response.text.delta"):
                text+=ev.get("delta","")
            elif t=="response.done":
                print(f"  [第{step}轮 done] 文本: {text.strip()[:70]!r}")
                if step==1:
                    if not call_id: print("  ❌ 没调工具"); break
                    await ws.send(json.dumps({"type":"conversation.item.create","item":{
                        "type":"function_call_output","call_id":call_id,
                        "output":"上限7200元；每月约150元，共48个月。"}}))
                    if duplicate:
                        await item(Q)   # ← 模拟 LiveKit 把用户消息又同步了一次
                        print("  ⚠ 已插入重复的用户消息（模拟 LiveKit chat_ctx 同步）")
                    await ws.send(json.dumps({"type":"response.create"}))
                    step=2; text=""; continue
                final=text.strip()
                ok = any(k in final for k in ("7200","48","150"))
                print(f"  📢 最终: {final[:150]}")
                print("  ✅ 正确使用工具结果" if ok else "  ❌ 复读/未使用工具结果")
                break
            elif t=="error":
                print("  ⚠ error:", json.dumps(ev.get("error"),ensure_ascii=False)[:150]); break

async def run():
    await main(duplicate=False)
    await asyncio.sleep(2)
    await main(duplicate=True)
asyncio.run(run())
