"""从 liquid-orb 独立导出产物中提取 WGSL 着色器与状态种子。

用法（在项目根执行）：
    python web/tools/extract_liquid.py "web/tools/fixtures/对话球参数.txt"

产物：
    web/src/orb/liquid/effect.wgsl.ts   —— WGSL 源码（TS 字符串常量）
    web/src/orb/liquid/seeds.json       —— 各状态的 136 个 uniform 种子
    stdout                              —— 关键常量与状态速查

上游（stdexception/liquid-orb，MIT）更新后重新执行即可同步。
"""

import io
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT_DIR = os.path.join(ROOT, "src", "orb", "liquid")

UNIFORM_FLOATS = 136
COLOR_OFFSET = 40


def extract(src: str):
    # 1) WGSL：shaderSource 是一个 JS 字符串字面量（含 \n 转义）
    m = re.search(r'const shaderSource = ("(?:[^"\\]|\\.)*")', src, re.S)
    if not m:
        raise SystemExit("未找到 shaderSource")
    wgsl = json.loads(m.group(1))

    # 2) 状态种子
    m = re.search(r"const stateSeeds = (\{.*?\});", src, re.S)
    if not m:
        raise SystemExit("未找到 stateSeeds")
    seeds = {}
    for key, arr in re.findall(r'"(\w+)"\s*:\s*\[([^\]]*)\]', m.group(1)):
        vals = [float(x) for x in arr.split(",")]
        if len(vals) != UNIFORM_FLOATS:
            raise SystemExit(f"状态 {key} 的 uniform 数量为 {len(vals)}，期望 {UNIFORM_FLOATS}")
        seeds[key] = vals
    return wgsl, seeds


def main() -> None:
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    src_path = sys.argv[1]
    src = io.open(src_path, encoding="utf-8").read()
    wgsl, seeds = extract(src)

    os.makedirs(OUT_DIR, exist_ok=True)
    wgsl_ts = os.path.join(OUT_DIR, "effect.wgsl.ts")
    io.open(
        wgsl_ts,
        "w",
        encoding="utf-8",
    ).write(
        "// 从 liquid-orb 独立导出产物中提取的 WGSL 着色器。\n"
        "// 上游: https://github.com/stdexception/liquid-orb (MIT License)\n"
        "// 自动生成，请勿手改；上游更新后重跑 tools/extract_liquid.py\n"
        "export const EFFECT_WGSL = " + json.dumps(wgsl) + ";\n"
    )
    io.open(os.path.join(OUT_DIR, "seeds.json"), "w", encoding="utf-8").write(
        json.dumps(seeds, indent=1)
    )

    print(f"WGSL: {len(wgsl)} 字符 -> {wgsl_ts}")
    for name in ("ribbonStyleIndex", "ribbonInstanceCount", "activationDurationMs", "settleDurationMs"):
        mm = re.search(name + r"\s*=\s*([0-9]+)", src)
        print(f"  {name} = {mm.group(1) if mm else '未找到'}")
    print("状态种子:")
    for key, vals in seeds.items():
        flow = vals[15]
        print(
            f"  {key}: len={len(vals)} speed[3]={vals[3]:g} radius[4]={vals[4]:g} "
            f"flow[15]={flow:g} edgeSoft[16]={vals[16]:g} glass[19]={vals[19]:g} "
            f"exposure[14]={vals[14]:g} edgeGlow[17]={vals[17]:g}"
        )
        print(f"colorA[40:44] = {vals[COLOR_OFFSET:COLOR_OFFSET + 4]}")


if __name__ == "__main__":
    main()