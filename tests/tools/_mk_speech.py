# -*- coding: utf-8 -*-
"""一次性：用 Windows SAPI 合成一段测试语音（给协议探针 C/D 用）。用完即删。"""
import os

try:
    import win32com.client
    import pythoncom
except ImportError:
    raise SystemExit("需要 pywin32（用 default venv 的解释器跑）")

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "fixtures", "_probe_speech.wav")

pythoncom.CoInitialize()
voice = win32com.client.Dispatch("SAPI.SpVoice")
stream = win32com.client.Dispatch("SAPI.SpFileStream")
fmt = stream.Format
fmt.Type = 22          # SAFT16kHz16BitMono
stream.Open(OUT, 3)    # SSFMCreateForWrite
voice.AudioOutputStream = stream
voice.Rate = 0
voice.Speak("我们公司的笔记本补贴政策是什么？请帮我查一下。")
stream.Close()
pythoncom.CoUninitialize()

if os.path.isfile(OUT):
    print(f"已生成 {OUT}  ({os.path.getsize(OUT)/1024:.1f} KB)")
else:
    print("生成失败")
