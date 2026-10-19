# -*- coding: utf-8 -*-
"""把 index.html 里的内联 JS 抽出来，交给 node --check 做语法校验。"""
import re
import subprocess
import sys
import os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))   # tests/tools → 项目根
HTML = os.path.join(ROOT, "public", "index.html")
OUT = os.path.join(HERE, "_inline_check.js")
NODE = r"C:\Users\LENOVO\.workbuddy\binaries\node\versions\22.22.2-6\node.exe"

html = open(HTML, encoding="utf-8").read()
blocks = re.findall(r"<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>", html, re.S)
print(f"内联 script 块数: {len(blocks)}")
js = "\n;\n".join(blocks)
open(OUT, "w", encoding="utf-8").write(js)
print(f"抽出 JS: {len(js)} 字符 -> {OUT}")

r = subprocess.run([NODE, "--check", OUT], capture_output=True, text=True)
if r.returncode == 0:
    print("✅ 语法校验通过")
else:
    print("❌ 语法错误：")
    print(r.stdout)
    print(r.stderr)

# 残留引用检查
print("\n--- 关键串残留检查 ---")
checks = {
    "小碗": "旧名字",
    "小婉": "旧名字",
    "calculator": "旧工具",
    "mic-diag": "已删页面",
    "已接通。直接说话即可": "已删提示",
    "点 📞「打电话」开始全双工": "已删提示",
    "btnMicDiag": "已删按钮",
}
for k, why in checks.items():
    # 允许出现在说明性注释里的 calculator（那行注释已改写）
    n = html.count(k)
    print(f"  {k!r:28} x{n}   ({why}){'  ← 需处理' if n else ''}")

print("\n--- 新元素自检 ---")
must = ["瀚涛百事通", "knowledge_lookup", "playReadyChime", "closeBotBubble", "contextBlock", "LOOKUP_RE"]
for k in must:
    print(f"  {k!r:20} x{html.count(k)}")
sys.exit(0 if r.returncode == 0 else 1)
