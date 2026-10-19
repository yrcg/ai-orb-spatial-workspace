"""验证 qwen3.7-flash 是否支持标准 function calling（pipeline 路线的前提）。"""
import json, os
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), ".env"))
cli = OpenAI(api_key=os.environ["DASHSCOPE_API_KEY"],
             base_url="https://dashscope.aliyuncs.com/compatible-mode/v1")

TOOLS = [{
    "type": "function",
    "function": {
        "name": "get_company_policy",
        "description": "查询公司制度/政策。用户问到考勤、请假、报销、发票、年假、补贴等公司规定时调用。",
        "parameters": {
            "type": "object",
            "properties": {"topic": {"type": "string", "description": "查询主题，如「笔记本补贴」"}},
            "required": ["topic"],
        },
    },
}]

for q in ["公司的笔记本补贴是多少？", "今天天气不错"]:
    print(f"\n=== Q: {q} ===")
    r = cli.chat.completions.create(
        model="qwen3.7-flash",
        messages=[{"role": "user", "content": q}],
        tools=TOOLS, tool_choice="auto", max_tokens=200,
    )
    m = r.choices[0].message
    if getattr(m, "tool_calls", None):
        for tc in m.tool_calls:
            print("  ✅ 触发工具调用:", tc.function.name, tc.function.arguments)
    else:
        print("  （未调工具）内容:", (m.content or "")[:80])

# 二阶段：把工具结果回灌，看模型是否基于结果作答
print("\n=== 回灌工具结果后 ===")
msgs = [
    {"role": "user", "content": "公司的笔记本补贴是多少？"},
    {"role": "assistant", "content": None, "tool_calls": [
        {"id": "call_1", "type": "function",
         "function": {"name": "get_company_policy", "arguments": '{"topic":"笔记本补贴"}'}}]},
    {"role": "tool", "tool_call_id": "call_1",
     "content": "上限7200元；每月约150元，共补贴48个月；需钉钉提交发票，四级审批。"},
]
r2 = cli.chat.completions.create(model="qwen3.7-flash", messages=msgs, max_tokens=200)
print("  模型作答:", (r2.choices[0].message.content or "")[:200])
