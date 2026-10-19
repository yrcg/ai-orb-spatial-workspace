#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""容器健康检查：先试 HTTPS 端口，再退回 HTTP 端口（自签证书不校验）。
server.py 开启 TLS 后，HTTP 仍监听 8770、HTTPS 监听 PET_TLS_PORT（默认 8772），
两个都在，任一 200 即视为健康。"""
import os
import ssl
import sys
import urllib.request

tls_port = os.environ.get("PET_TLS_PORT", "8772")
port = os.environ.get("PET_PORT", "8770")
ctx = ssl._create_unverified_context()  # noqa: SLF001 —— 自签证书，容器内自检无需校验
for url in (f"https://127.0.0.1:{tls_port}/health", f"http://127.0.0.1:{port}/health"):
    try:
        r = urllib.request.urlopen(url, timeout=4, context=ctx)  # noqa: S310
        if r.status == 200:
            sys.exit(0)
    except Exception:  # noqa: BLE001
        continue
sys.exit(1)
