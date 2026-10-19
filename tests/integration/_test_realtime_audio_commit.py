"""验证 Qwen realtime 的「服务端轮次检测」是否真的会自动 commit 音频缓冲。

背景：LiveKit 的 openai 适配器在不传 turn_detection 时会把轮次交给自己（客户端）管，
      Qwen 侧于是没人 commit，缓冲涨到 30s 就狂报
      `Input audio buffer exceeded maximum duration (30s)`（实测 3984 条），agent 全程不出声。
      修法是显式传 turn_detection=server_vad。本脚本用**原生协议**验证这个机制成立：
      连上 → session.update 带 turn_detection:server_vad → 持续 append 音频 35 秒
      → 看有没有 buffer 超限报错（有 = 机制不成立，没有 = 服务端在自动 commit）。

用法：python _test_realtime_audio_commit.py
"""
import asyncio
import base64
import json
import os
import struct
import time

from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), ".env"))

KEY = os.environ["DASHSCOPE_API_KEY"]
MODEL = os.getenv("QWEN_REALTIME_MODEL", "qwen-audio-3.0-realtime-flash")
URL = f"wss://dashscope.aliyuncs.com/api-ws/v1/realtime?model={MODEL}"

STREAM_SECONDS = 35.0          # 超过 30s 的缓冲上限，才能暴露问题
CHUNK_MS = 100                 # 每片 100ms
RATE = 16000


def quiet_pcm(ms: int) -> bytes:
    """一段低电平噪声（模拟"房间里有人但没在说话"）：不触发 VAD，但会进音频缓冲。"""
    n = int(RATE * ms / 1000)
    out = bytearray()
    amp = 120                   # int16 幅度约 0.4% —— 远低于任何人声阈值
    seed = 12345
    for _ in range(n):
        seed = (1103515245 * seed + 12345) & 0x7FFFFFFF
        v = ((seed >> 16) % (2 * amp)) - amp
        out += struct.pack("<h", v)
    return bytes(out)


async def main() -> None:
    from websockets.asyncio.client import connect

    print(f"模型: {MODEL}")
    print(f"将连续推送 {STREAM_SECONDS:.0f}s 音频（每片 {CHUNK_MS}ms）\n")

    buffer_errors = 0
    other_errors: list[str] = []
    transcripts: list[str] = []
    commits = 0
    speech_started = 0

    async with connect(URL, additional_headers={"Authorization": "Bearer " + KEY},
                       open_timeout=20, max_size=None) as ws:
        await ws.send(json.dumps({
            "type": "session.update",
            "session": {
                "modalities": ["audio", "text"],
                "voice": "longanqian",
                "instructions": "你是语音助手，回答要短。",
                "turn_detection": {"type": "server_vad",
                                   "create_response": True,
                                   "interrupt_response": True},
            },
        }))
        await asyncio.sleep(1.0)

        chunk = quiet_pcm(CHUNK_MS)
        b64 = base64.b64encode(chunk).decode()
        t0 = time.time()
        sent = 0
        while time.time() - t0 < STREAM_SECONDS:
            await ws.send(json.dumps({"type": "input_audio_buffer.append", "audio": b64}))
            sent += 1
            # 边发边收，别把服务端事件憋在缓冲里
            try:
                raw = await asyncio.wait_for(ws.recv(), timeout=0.001)
                if isinstance(raw, str):
                    ev = json.loads(raw)
                    t = ev.get("type", "")
                    if t == "error":
                        msg = json.dumps(ev.get("error"), ensure_ascii=False)
                        if "exceeded" in msg or "commit" in msg:
                            buffer_errors += 1
                        else:
                            other_errors.append(msg[:160])
                    elif t == "input_audio_buffer.committed":
                        commits += 1
                    elif t == "input_audio_buffer.speech_started":
                        speech_started += 1
                    elif t in ("response.audio_transcript.delta", "response.text.delta"):
                        transcripts.append(ev.get("delta", ""))
            except asyncio.TimeoutError:
                pass
            await asyncio.sleep(CHUNK_MS / 1000)

        print(f"已推送 {sent} 片（≈{sent * CHUNK_MS / 1000:.0f}s 音频）\n")

        # 收尾：把剩下的事件捞干净
        deadline = time.time() + 6
        while time.time() < deadline:
            try:
                raw = await asyncio.wait_for(ws.recv(), timeout=1.0)
            except asyncio.TimeoutError:
                continue
            if not isinstance(raw, str):
                continue
            ev = json.loads(raw)
            t = ev.get("type", "")
            if t == "error":
                msg = json.dumps(ev.get("error"), ensure_ascii=False)
                if "exceeded" in msg or "commit" in msg:
                    buffer_errors += 1
                else:
                    other_errors.append(msg[:160])
            elif t == "input_audio_buffer.committed":
                commits += 1
            elif t in ("response.audio_transcript.delta", "response.text.delta"):
                transcripts.append(ev.get("delta", ""))

    print("── 结果 ─────────────────────────────")
    print(f"  缓冲超限报错 (buffer exceeded) : {buffer_errors}   ← 期望 0")
    print(f"  input_audio_buffer.committed   : {commits}")
    print(f"  speech_started                 : {speech_started}")
    print(f"  模型转写片段                   : {''.join(transcripts)[:120]!r}")
    if other_errors:
        print(f"  其它错误 ({len(other_errors)}): {other_errors[0]}")
    print()
    if buffer_errors == 0:
        print("✅ 服务端在自动 commit（或未触发超限）—— turn_detection=server_vad 机制成立")
    else:
        print("❌ 仍在报缓冲超限 —— server_vad 没起作用，需要换方案")


asyncio.run(main())
