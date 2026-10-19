#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
语音桌宠 Demo · 本地中继 + 静态服务 + 日志落盘（零外部服务依赖，仅需 websockets）

为什么需要它：
  上游实时语音 API 只接受 `Authorization: Bearer <key>` 请求头鉴权，
  而浏览器原生 WebSocket 无法自定义请求头。本中继在本地承接浏览器的 WS，
  转发到上游时注入该请求头，从而让「一个网页」直连全双工语音模型。

上游（2026-10-14.22 起）= **阿里云百炼 Qwen-Audio Realtime**，OpenAI Realtime 风格协议：
  · 原生 function calling（协议里有 tools 字段，不用再玩"话术委派"）
  · 服务端自带 VAD 打断（用户一开口就回 response.done cancelled）
  · 服务端流式下发用户转写（input_audio_transcription）
  完整迁移诊断见「全双工深度审查与迭代方案.md」。

另外提供两条本地通道（不转发上游）：
  ?mode=log   —— 前端把对话/运行日志批量推上来，落盘到 ../logs/*.jsonl
  GET /kb     —— 公司知识库代理（?q=问题&t=超时秒）：中继持有 token、转发 /chat，
                 免得浏览器撞 CORS、也免得 token 出现在前端。
                 前端做 function calling 时直接 fetch 这个地址拿资料。

用法：
  python src/server.py                   # key 从项目根 .env 的 DASHSCOPE_API_KEY 读
  python src/server.py --key sk-xxxx
  # 或  set DASHSCOPE_API_KEY=sk-xxxx && python src/server.py
  # 或  把 key 写进项目根 key.txt 再 python src/server.py
  然后浏览器打开 http://127.0.0.1:8770

目录约定：静态资源在 public/（含 dist/app.js），源码在 src/，日志在 logs/。

换模型：set PET_MODEL=qwen-audio-3.0-realtime-plus && python server.py

知识库地址可用环境变量覆盖（默认公司局域网门）：
  PET_KB_BASE=http://192.168.5.196:13000   # 换成公司服务器
  PET_KB_USER=17427833417981666            # 取 token 用的 userId
  PET_KB_TIMEOUT=30                        # 单次问答超时（秒）
"""
from __future__ import annotations

import argparse
import asyncio
import datetime as dt
import json
import mimetypes
import os
import socket
import ssl
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from http import HTTPStatus

from websockets.asyncio.client import connect
from websockets.asyncio.server import serve
from websockets.datastructures import Headers
from websockets.http11 import Response

# 目录约定（见 docs/README.md）：
#   src/      本文件（中继/静态服务）
#   public/   运行时静态资源（index.html、dist/app.js、worklet）
#   logs/     JSONL 日志（生成物，不入库）
#   certs/    自签证书（生成物，不入库）
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUBLIC_DIR = os.path.join(BASE_DIR, "public")
LOG_DIR = os.path.join(BASE_DIR, "logs")

# ── 上游接入点（功能必需，勿改） ───────────────────────────────────────────────
# 2026-10-14.22 起换成**阿里云百炼 Qwen-Audio Realtime**（OpenAI Realtime 风格协议）。
# 换掉 MiniCPM-o 的原因：它的协议**没有 tools 字段**，工具调用只能靠"话术委派"绕路
# （让模型说「我查一下」→ 客户端正则抓 → 自己转写/查值/播报），整条链路 766 行补丁、
# 真机成功率 0/2。Qwen-Audio-Realtime 有**原生 function calling**，且服务端自带
# VAD 打断（用户一开口就回 response.done cancelled），客户端不用再写 bargeWatch。
# 协议实测结论见 tests/_probe_qwen_protocol3.py 与「全双工深度审查与迭代方案.md」。
UPSTREAM_BASE = "wss://dashscope.aliyuncs.com/api-ws/v1/realtime"
DEFAULT_MODEL = os.environ.get("PET_MODEL", "qwen-audio-3.1-realtime-plus")
MAX_MSG = 128 * 1024 * 1024

API_KEY = ""

# ── 公司知识库（KB）代理（BUILD .17）──────────────────────────────────────────
# 浏览器不直连公司知识库，原因两个：① 跨域（CORS）会被浏览器挡掉；
# ② token 不该出现在前端。所以由中继代理：GET /kb?q=问题&t=超时秒
#   中继先取（缓存 30 分钟）token → POST {KB_BASE}/chat → 归一成 JSON 给前端。
# KB 是 agent 形态（/health 自报 engine="pi-coding-agent SDK (controlled)"），
# 实测一次问答 ~12s、返回千字级长文 + refs 引用列表；失败时它内部会重试，
# 最坏能拖到 80s，所以这里必须有超时上限。
KB_BASE = os.environ.get("PET_KB_BASE", "http://192.168.5.196:13000").rstrip("/")
KB_USER = os.environ.get("PET_KB_USER", "17427833417981666")
KB_TIMEOUT = float(os.environ.get("PET_KB_TIMEOUT", "30"))
# KB_BRIEF_HINT（2026-10-14 用户要求）：知识库一次问答会返回千字级长文，
# 而语音链路只能念两三句，所以在**调用 KB API 时附一句"简洁"要求**，让它自己先收敛。
# 可用 PET_KB_BRIEF_HINT 覆盖，或置空字符串关闭。
KB_BRIEF_HINT = os.environ.get(
    "PET_KB_BRIEF_HINT",
    "（请尽量简洁、突出重点：直接给结论和关键数字，控制在 200 字以内，"
    "不要罗列无关条款和完整原文。）",
)
# 见 main_async 的说明：/kb 在 process_request 里等 KB，必须放宽握手超时
HANDSHAKE_TIMEOUT = 90.0
_KBT = {"token": "", "at": 0.0}

# ── HTTPS / WSS（局域网语音必需）─────────────────────────────────────────────
# 浏览器只在**安全上下文**里给麦克风：localhost / 127.0.0.1 或 https。
# 用 http + 局域网 IP 访问时 getUserMedia 直接不给 → 打不了电话。
# 所以要对局域网开放语音，中继必须走 TLS（页面 https，WS 相应变 wss）。
# 三种给法：--tls / 环境变量 PET_TLS=1（自动生成自签证书）；或 --tls-cert/--tls-key
# 指定已有证书。自签证书首次访问点一次「继续前往」即可（浏览器记住）。
CERT_DIR = os.path.join(BASE_DIR, "certs")
TLS_ENABLED = os.environ.get("PET_TLS", "").strip().lower() in ("1", "true", "yes", "on")
TLS_CERT = os.environ.get("PET_TLS_CERT", "")
TLS_KEY = os.environ.get("PET_TLS_KEY", "")
# HTTPS 监听端口（HTTP 仍在 --port 上，两者并存：本机走 http，局域网走 https）
TLS_PORT = int(os.environ.get("PET_TLS_PORT", "8772"))


def _lan_ips() -> list:
    """探测本机局域网 IPv4（写进自签证书的 SAN，浏览器才认）。"""
    ips = set()
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            ips.add(info[4][0])
    except Exception:  # noqa: BLE001
        pass
    try:  # 到公网的默认出口 IP —— 最接近用户实际访问的那个地址
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            s.connect(("8.8.8.8", 80))
            ips.add(s.getsockname()[0])
        finally:
            s.close()
    except Exception:  # noqa: BLE001
        pass
    return sorted(i for i in ips if i and not i.startswith("127."))


def _extra_sans() -> list:
    """PET_TLS_EXTRA_SAN：额外写进证书的 IP/域名（逗号或分号分隔）。
    容器里 socket.gethostname 解析到的是容器 IP，拿不到宿主机局域网 IP，
    所以 Docker 部署时用这个变量把宿主机的 192.168.x.x 塞进证书 SAN。"""
    raw = os.environ.get("PET_TLS_EXTRA_SAN", "")
    return [x.strip() for x in raw.replace(";", ",").split(",") if x.strip()]


def ensure_self_signed_cert(cert_path: str, key_path: str) -> bool:
    """没有证书就生成一张自签的（含 localhost / 127.0.0.1 / 本机局域网 IP / 额外 SAN）。
    需要 cryptography —— 已在 requirements.txt 里（容器与本机都装）。"""
    if os.path.isfile(cert_path) and os.path.isfile(key_path):
        return True
    try:
        import datetime as _dt
        import ipaddress

        from cryptography import x509
        from cryptography.hazmat.primitives import hashes, serialization
        from cryptography.hazmat.primitives.asymmetric import rsa
        from cryptography.x509.oid import NameOID
    except Exception as e:  # noqa: BLE001
        print(f"[tls] 自动生成证书需要 cryptography 库（pip install cryptography）：{e}", file=sys.stderr)
        return False
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    name = x509.Name([
        x509.NameAttribute(NameOID.COMMON_NAME, "pet-demo.local"),
        x509.NameAttribute(NameOID.ORGANIZATION_NAME, "pet-demo"),
    ])
    sans = [x509.DNSName("localhost"), x509.IPAddress(ipaddress.ip_address("127.0.0.1"))]

    def _add_san(v: str):
        try:
            sans.append(x509.IPAddress(ipaddress.ip_address(v)))
        except ValueError:
            sans.append(x509.DNSName(v))

    for ip in _lan_ips():
        _add_san(ip)
    for v in _extra_sans():
        _add_san(v)
    now = _dt.datetime.now(_dt.timezone.utc)
    cert = (
        x509.CertificateBuilder()
        .subject_name(name).issuer_name(name)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - _dt.timedelta(days=1))
        .not_valid_after(now + _dt.timedelta(days=825))
        .add_extension(x509.SubjectAlternativeName(sans), critical=False)
        .add_extension(x509.BasicConstraints(ca=True, path_length=None), critical=True)
        .sign(key, hashes.SHA256())
    )
    os.makedirs(os.path.dirname(cert_path) or ".", exist_ok=True)
    with open(key_path, "wb") as f:
        f.write(key.private_bytes(serialization.Encoding.PEM,
                                  serialization.PrivateFormat.TraditionalOpenSSL,
                                  serialization.NoEncryption()))
    with open(cert_path, "wb") as f:
        f.write(cert.public_bytes(serialization.Encoding.PEM))
    print(f"[tls] 已生成自签证书 {cert_path}（SAN: localhost, 127.0.0.1"
          f"{''.join(', ' + i for i in _lan_ips())}{''.join(', ' + i for i in _extra_sans())}）")
    return True


def build_ssl_context(cert: str, key: str) -> ssl.SSLContext:
    ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    ctx.load_cert_chain(certfile=cert, keyfile=key)
    return ctx


def _http_json(url: str, body=None, headers=None, timeout: float = 20.0):
    req = urllib.request.Request(
        url,
        data=(json.dumps(body).encode("utf-8") if body is not None else None),
        headers={"Content-Type": "application/json", **(headers or {})},
    )
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8", "replace"))


def _kb_token(refresh: bool = False) -> str:
    now = time.time()
    if refresh or not _KBT["token"] or now - _KBT["at"] > 1800:
        j = _http_json(f"{KB_BASE}/auth/token", {"userId": KB_USER}, timeout=15)
        _KBT["token"] = str(j.get("token") or "")
        _KBT["at"] = now
        relay_log("kb_auth", ok=bool(_KBT["token"]))
    return _KBT["token"]


def kb_ask_sync(question: str, timeout: float) -> dict:
    """同步实现 —— 必须放在线程里跑（asyncio.to_thread），否则 12s 会卡住事件循环，
    连带着把语音中继一起卡死。"""
    tok = _kb_token()
    if not tok:
        return {"ok": False, "error": "kb_auth_failed"}
    t0 = time.time()
    # 附上"简洁"要求（见 KB_BRIEF_HINT）；日志/前端仍用原始 question
    prompt = (question + "\n\n" + KB_BRIEF_HINT).strip() if KB_BRIEF_HINT else question
    try:
        j = _http_json(f"{KB_BASE}/chat", {"message": prompt},
                       {"Authorization": "Bearer " + tok}, timeout=timeout)
    except urllib.error.HTTPError as e:
        if e.code in (401, 403):                     # token 过期 → 刷新后重试一次
            tok = _kb_token(refresh=True)
            j = _http_json(f"{KB_BASE}/chat", {"message": prompt},
                           {"Authorization": "Bearer " + tok}, timeout=timeout)
        else:
            raise
    ans = str(j.get("response") or "").strip()
    return {"ok": True, "answer": ans, "refs": j.get("refs") or [],
            "trace": j.get("trace_id"), "ms": int((time.time() - t0) * 1000)}


# ── 日志 ─────────────────────────────────────────────────────────────────────
def _today() -> str:
    return dt.date.today().isoformat()


def relay_log(evt: str, **fields) -> None:
    """中继自身运行日志 → logs/relay-YYYY-MM-DD.jsonl（单条失败不影响服务）"""
    try:
        os.makedirs(LOG_DIR, exist_ok=True)
        rec = {"t": dt.datetime.now().isoformat(timespec="milliseconds"), "src": "relay", "evt": evt}
        rec.update(fields)
        with open(os.path.join(LOG_DIR, f"relay-{_today()}.jsonl"), "a", encoding="utf-8") as f:
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")
    except Exception as e:  # noqa: BLE001
        print(f"[log] 写中继日志失败: {e}", flush=True)


async def log_channel(connection) -> None:
    """?mode=log：接收前端批量日志并落盘，不连上游。"""
    os.makedirs(LOG_DIR, exist_ok=True)
    path = os.path.join(LOG_DIR, f"pet-{_today()}.jsonl")
    total = 0
    peer = getattr(connection, "remote_address", None)
    relay_log("log_channel_open", peer=str(peer))
    try:
        async for raw in connection:
            try:
                rec = json.loads(raw)
            except Exception:  # noqa: BLE001
                continue
            items = rec if isinstance(rec, list) else [rec]
            try:
                with open(path, "a", encoding="utf-8") as f:
                    for it in items:
                        if isinstance(it, dict):
                            it.setdefault("src", "client")
                        f.write(json.dumps(it, ensure_ascii=False) + "\n")
                        total += 1
            except Exception as e:  # noqa: BLE001
                print(f"[log] 落盘失败: {e}", flush=True)
                continue
            try:
                await connection.send(json.dumps({"type": "log_ok", "n": len(items), "total": total}))
            except Exception:  # noqa: BLE001
                pass
    except Exception as e:  # noqa: BLE001
        print(f"[log] 通道异常: {type(e).__name__}: {e}", flush=True)
    relay_log("log_channel_close", count=total)
    print(f"[log] 日志通道关闭，共写入 {total} 条 → {path}", flush=True)


# ── 静态文件服务 ──────────────────────────────────────────────────────────────
def load_static(path: str):
    """把 URL 路径映射到本地文件，返回 (bytes, content_type) 或 None。"""
    rel = path.lstrip("/") or "index.html"
    if ".." in rel or rel.startswith("."):
        return None
    full = os.path.join(PUBLIC_DIR, rel.replace("/", os.sep))
    # 目录 → 该目录下的 index.html
    if os.path.isdir(full):
        full = os.path.join(full, "index.html")
    if not os.path.isfile(full):
        return None
    ctype, _ = mimetypes.guess_type(full)
    if full.endswith(".js"):
        ctype = "application/javascript; charset=utf-8"
    elif full.endswith(".html"):
        ctype = "text/html; charset=utf-8"
    elif full.endswith(".css"):
        ctype = "text/css; charset=utf-8"
    with open(full, "rb") as f:
        data = f.read()
    return data, (ctype or "application/octet-stream")


def is_textual(ctype: str) -> bool:
    """只有文本类资源才走 decode —— 二进制（wav / png / 裸 PCM…）必须原样发。
    踩过的坑：曾对所有文件 decode("utf-8","replace")，把二进制里的非法字节
    替换成 U+FFFD，字节数被改坏（表现为 Float32Array 长度不是 4 的倍数）。"""
    c = (ctype or "").lower()
    return c.startswith("text/") or "javascript" in c or "json" in c or "xml" in c or "svg" in c


def static_response(data, ctype: str) -> Response:
    """静态资源响应：str 走 UTF-8，bytes 原样发。
    注意 websockets 的 connection.respond() 只接受 str（内部会 text.encode()），
    所以二进制必须自己组 Response —— 这是本文件的第二个踩坑点。"""
    body = data if isinstance(data, (bytes, bytearray)) else str(data).encode("utf-8")
    headers = Headers()
    headers["Content-Type"] = ctype or "application/octet-stream"
    headers["Content-Length"] = str(len(body))
    headers["Cache-Control"] = "no-store"
    # 页面可能从 file:// 或别的端口打开，放行 CORS，避免自检被浏览器挡掉
    headers["Access-Control-Allow-Origin"] = "*"
    headers["Access-Control-Allow-Headers"] = "*"
    headers["Access-Control-Allow-Methods"] = "GET, OPTIONS"
    return Response(HTTPStatus.OK, "OK", headers, bytes(body))


def json_response(text: str, status: HTTPStatus = HTTPStatus.OK) -> Response:
    """JSON 响应（明确 utf-8；页面可能从别的端口打开，一并放行 CORS）。"""
    body = str(text).encode("utf-8")
    headers = Headers()
    headers["Content-Type"] = "application/json; charset=utf-8"
    headers["Content-Length"] = str(len(body))
    headers["Cache-Control"] = "no-store"
    headers["Access-Control-Allow-Origin"] = "*"
    headers["Access-Control-Allow-Headers"] = "*"
    headers["Access-Control-Allow-Methods"] = "GET, OPTIONS"
    return Response(status, "OK", headers, body)


async def process_request(connection, request):
    """普通 HTTP GET → 返回静态文件 / KB 代理；/ws 或带 Upgrade 的请求 → 交给 WS 处理器。"""
    if request.headers.get("Upgrade", "").lower() == "websocket":
        return None  # 继续 WebSocket 握手

    path = request.path.split("?", 1)[0]

    def with_cors(resp):
        resp.headers["Access-Control-Allow-Origin"] = "*"
        resp.headers["Access-Control-Allow-Headers"] = "*"
        resp.headers["Access-Control-Allow-Methods"] = "GET, OPTIONS"
        return resp

    # ⚠ websockets 的 Request 只在**较新版本**（实测 17.x）才有 `.method`；
    #   15.x 只有 (path, headers)。直接写 request.method 会在旧版抛 AttributeError，
    #   让**所有普通 HTTP 请求 500**（连页面本身都加载不出来，只在浏览器控制台看到握手失败）。
    #   用 getattr 兜底：取不到就按 GET 处理（WS 握手与静态资源都是 GET；OPTIONS 预检
    #   属浏览器同源场景，本页由中继自身提供，不会有跨源预检）。
    method = getattr(request, "method", "GET") or "GET"
    if method == "OPTIONS":
        return with_cors(connection.respond(HTTPStatus.NO_CONTENT, ""))

    if path == "/health":
        return json_response(json.dumps({
            "ok": True, "model": DEFAULT_MODEL, "upstream": UPSTREAM_BASE,
            "kb": KB_BASE, "kbTimeout": KB_TIMEOUT,
        }, ensure_ascii=False))

    # ── 公司知识库代理：GET /kb?q=问题&t=超时秒 ──────────────────────────────
    # 为什么用 GET 而不是 POST：本中继的 HTTP 层是 websockets 的 process_request，
    # 它拿不到请求体；问题都很短，放 query 里完全够用（也省了 body 解析）。
    if path == "/kb":
        qs = request.path.split("?", 1)[1] if "?" in request.path else ""
        p = urllib.parse.parse_qs(qs)
        q = (p.get("q", [""])[0] or "").strip()
        try:
            t = float(p.get("t", [KB_TIMEOUT])[0])
        except Exception:  # noqa: BLE001
            t = KB_TIMEOUT
        t = max(3.0, min(60.0, t))
        if not q:
            return json_response(json.dumps({"ok": False, "error": "empty_query"}), HTTPStatus.BAD_REQUEST)
        t0 = time.time()
        try:
            res = await asyncio.to_thread(kb_ask_sync, q, t)
        except Exception as e:  # noqa: BLE001
            relay_log("kb_error", q=q[:60], err=f"{type(e).__name__}: {e}")
            res = {"ok": False, "error": f"{type(e).__name__}: {e}"}
        res["q"] = q[:200]
        res.setdefault("ms", int((time.time() - t0) * 1000))
        relay_log("kb_ask", q=q[:60], ok=res.get("ok"), ms=res["ms"],
                  chars=len(res.get("answer") or ""), refs=len(res.get("refs") or []))
        return json_response(json.dumps(res, ensure_ascii=False))

    # 日志目录概览（便于确认落盘是否正常）
    if path == "/logs":
        try:
            files = sorted(os.listdir(LOG_DIR)) if os.path.isdir(LOG_DIR) else []
        except Exception:  # noqa: BLE001
            files = []
        return with_cors(connection.respond(HTTPStatus.OK, json.dumps(files, ensure_ascii=False) + "\n"))

    got = load_static(path)
    if got is None:
        return with_cors(connection.respond(HTTPStatus.NOT_FOUND, "404 Not Found\n"))
    data, ctype = got
    if is_textual(ctype):
        return static_response(data.decode("utf-8", "replace") if isinstance(data, bytes) else data, ctype)
    return static_response(data, ctype or "application/octet-stream")


# ── WebSocket 中继 ───────────────────────────────────────────────────────────
async def relay(connection):
    """浏览器 <-> 上游实时语音服务的双向管道；mode=log 走本地落盘通道。"""
    qs = connection.request.path.split("?", 1)[1] if "?" in connection.request.path else ""
    params = dict(kv.split("=", 1) for kv in qs.split("&") if "=" in kv)
    mode = params.get("mode", "audio")

    if mode == "log":
        return await log_channel(connection)

    # DashScope 的 realtime 端点只认 ?model=，没有 mode 参数（MiniCPM 那套的遗留，
    # 前端仍会带 mode=audio，这里忽略即可）。
    model = params.get("model", DEFAULT_MODEL)
    upstream = f"{UPSTREAM_BASE}?model={model}"

    print(f"[relay] 浏览器已连接 → 上游 mode={mode}", flush=True)
    relay_log("browser_connect", mode=mode)
    try:
        async with connect(
            upstream,
            additional_headers={"Authorization": f"Bearer {API_KEY}"},
            max_size=MAX_MSG,
            open_timeout=20,
            ping_interval=20,
            ping_timeout=20,
            proxy=None,
        ) as up:
            print("[relay] 上游已握手", flush=True)
            relay_log("upstream_open", mode=mode)

            async def browser_to_up():
                try:
                    async for msg in connection:
                        await up.send(msg)
                except Exception as e:  # noqa: BLE001
                    relay_log("b2u_stop", mode=mode, err=f"{type(e).__name__}")

            async def up_to_browser():
                try:
                    async for msg in up:
                        await connection.send(msg)
                except Exception as e:  # noqa: BLE001
                    relay_log("u2b_stop", mode=mode, err=f"{type(e).__name__}")

            done, pending = await asyncio.wait(
                [asyncio.create_task(browser_to_up()), asyncio.create_task(up_to_browser())],
                return_when=asyncio.FIRST_COMPLETED,
            )
            for t in pending:
                t.cancel()
            await asyncio.gather(*pending, return_exceptions=True)
    except Exception as e:  # noqa: BLE001
        print(f"[relay] 错误: {type(e).__name__}: {e}", flush=True)
        relay_log("relay_error", mode=mode, err=f"{type(e).__name__}: {e}")
        try:
            await connection.send(json.dumps({
                "type": "error",
                "error": {"code": "relay_error", "message": f"{type(e).__name__}: {e}", "type": "server_error"},
            }))
        except Exception:  # noqa: BLE001
            pass
        await connection.close()
        return
    print("[relay] 会话结束", flush=True)
    relay_log("session_end", mode=mode)


async def _banner(host: str, port: int, tls_port, open_browser: bool):
    """打印启动横幅（HTTP 端口 + 可选的 HTTPS 端口），并按需打开浏览器。"""
    loop_url = f"http://127.0.0.1:{port}"
    print("=" * 58)
    print("  语音桌宠 Demo 已启动")
    print(f"  本机访问:        {loop_url}")
    lan = _lan_ips()
    if tls_port:
        print(f"  HTTPS 端口:      {tls_port}（自签证书，浏览器首次点「高级 → 继续前往」）")
        for ip in lan:
            print(f"  局域网访问:      https://{ip}:{tls_port}")
        if not lan:
            print(f"  局域网访问:      https://<本机IP>:{tls_port}")
    else:
        for ip in lan:
            print(f"  局域网访问:      http://{ip}:{port}（⚠ http+局域网IP 拿不到麦克风，仅能打字）")
    print(f"  上游模型:        {DEFAULT_MODEL}")
    print(f"  上游端点:        {UPSTREAM_BASE}")
    print(f"  日志目录:        {LOG_DIR}")
    print(f"  知识库代理:      GET /kb  →  {KB_BASE}（超时 {KB_TIMEOUT:.0f}s）")
    print(f"  API Key: {API_KEY[:12]}…{API_KEY[-4:]}" if len(API_KEY) > 20 else "  API Key: (未设置)")
    print("  按 Ctrl+C 停止")
    print("=" * 58)
    if open_browser:
        async def _open():
            await asyncio.sleep(0.6)
            try:
                import webbrowser
                webbrowser.open(loop_url)
                print(f"[open] 已用默认浏览器打开 {loop_url}", flush=True)
            except Exception as e:  # noqa: BLE001
                print(f"[open] 打开浏览器失败：{e}", flush=True)
        asyncio.create_task(_open())


async def main_async(host: str, port: int, open_browser: bool = False,
                     ssl_ctx=None, tls_port=None):
    os.makedirs(LOG_DIR, exist_ok=True)
    # open_timeout 必须放大：websockets 会把**整个握手（含 process_request）**包在这个
    # 超时里，默认 10s。/kb 代理要同步等公司知识库（实测单次 ~12s），10s 一到连接就被
    # 掐断（表现为 curl "HTTP 000"、耗时正好 10.0s）。这里给到 90s（KB 上限 60s + 余量）。
    # 两个监听并存：HTTP 在 port（本机日常用），HTTPS 在 tls_port（局域网语音必需——
    # 浏览器只在安全上下文给麦克风；http+局域网IP 拿不到）。
    async with serve(relay, host, port, process_request=process_request,
                     max_size=MAX_MSG, open_timeout=HANDSHAKE_TIMEOUT):
        if ssl_ctx and tls_port:
            async with serve(relay, host, tls_port, process_request=process_request,
                             max_size=MAX_MSG, open_timeout=HANDSHAKE_TIMEOUT, ssl=ssl_ctx):
                await _banner(host, port, tls_port, open_browser)
                relay_log("server_start", port=port, tls=True, tls_port=tls_port)
                await asyncio.Future()
        else:
            await _banner(host, port, None, open_browser)
            relay_log("server_start", port=port, tls=False)
            await asyncio.Future()


def _read_dotenv(path: str) -> dict:
    """极简 .env 解析（KEY=VALUE，支持引号与 # 注释）—— 不为此引入 python-dotenv 依赖。"""
    out = {}
    try:
        with open(path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                out[k.strip()] = v.strip().strip('"').strip("'")
    except OSError:
        pass
    return out


def resolve_key(cli_key: str | None) -> str:
    if cli_key:
        return cli_key.strip()
    for name in ("DASHSCOPE_API_KEY", "PET_API_KEY", "MINICPM_API_KEY"):
        env = os.environ.get(name, "").strip()
        if env:
            return env
    # .env —— 同目录 .env 的 DASHSCOPE_API_KEY（推荐）
    for k, v in _read_dotenv(os.path.join(BASE_DIR, ".env")).items():
        if k in ("DASHSCOPE_API_KEY", "PET_API_KEY") and v:
            return v
    kf = os.path.join(BASE_DIR, "key.txt")
    if os.path.isfile(kf):
        with open(kf, encoding="utf-8") as f:
            return f.read().strip()
    return ""


def main():
    global API_KEY
    ap = argparse.ArgumentParser(description="语音桌宠 Demo 本地中继")
    ap.add_argument("--key", help="上游 API Key（DashScope 百炼，sk- 开头；优先读 .env 的 DASHSCOPE_API_KEY）")
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=8770)
    ap.add_argument("--open", action="store_true", help="启动后用系统默认浏览器打开页面（推荐，别用应用内预览面板）")
    ap.add_argument("--tls", action="store_true",
                    help="启用 HTTPS/WSS（自签证书，浏览器首次需信任一次）。局域网语音必需。")
    ap.add_argument("--tls-cert", help="TLS 证书路径（PEM）。默认 certs/server.crt，没有则自动生成")
    ap.add_argument("--tls-key", help="TLS 私钥路径（PEM）。默认 certs/server.key")
    ap.add_argument("--tls-port", type=int, default=TLS_PORT,
                    help=f"HTTPS 监听端口（HTTP 仍在 --port）。默认 {TLS_PORT}，可用 PET_TLS_PORT 覆盖")
    args = ap.parse_args()

    API_KEY = resolve_key(args.key)
    if not API_KEY:
        print("ERROR: 未提供 API Key。用 --key / 环境变量 PET_API_KEY / 同目录 key.txt 三种方式之一。", file=sys.stderr)
        sys.exit(2)

    # ── TLS 解析（--tls / PET_TLS=1 / 显式证书路径任一即开启）──
    ssl_ctx = None
    cert = args.tls_cert or TLS_CERT
    key = args.tls_key or TLS_KEY
    if args.tls or TLS_ENABLED or cert:
        if not cert:
            cert = os.path.join(CERT_DIR, "server.crt")
            key = os.path.join(CERT_DIR, "server.key")
        if not (os.path.isfile(cert) and os.path.isfile(key)):
            if not ensure_self_signed_cert(cert, key):
                print("ERROR: TLS 已开启，但证书不可用（缺 cryptography 或缺证书文件）。", file=sys.stderr)
                sys.exit(3)
        ssl_ctx = build_ssl_context(cert, key)
        print(f"[tls] 已启用 HTTPS/WSS，证书：{cert}")

    try:
        asyncio.run(main_async(args.host, args.port, args.open, ssl_ctx, args.tls_port))
    except KeyboardInterrupt:
        print("\n已停止。")


if __name__ == "__main__":
    main()
