#!/usr/bin/env bash
# 语音桌宠 Demo 启动脚本（WSL / Linux / macOS）
cd "$(dirname "$0")" || exit 1
PY="${PYTHON:-python3}"
if [ -x "/mnt/c/Users/LENOVO/.workbuddy/binaries/python/envs/default/Scripts/python.exe" ]; then
  PY="/mnt/c/Users/LENOVO/.workbuddy/binaries/python/envs/default/Scripts/python.exe"
fi
exec "$PY" src/server.py --port "${PORT:-8770}" "$@"
