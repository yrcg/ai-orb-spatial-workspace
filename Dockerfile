# 语音桌宠 Demo · 容器镜像
# 单进程：server.py 同时充当静态文件服务 + WebSocket 中继（→ DashScope Qwen-Audio Realtime）
FROM python:3.13-slim

# 不生成 .pyc、日志不缓冲（容器日志实时可见）
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PET_HOST=0.0.0.0 \
    PET_PORT=8770 \
    PET_TLS=1

WORKDIR /app

# 先装依赖（利用层缓存，改代码不用重装）
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# 后端（中继 + 静态服务）与健康检查
COPY src/ ./src/
# 运行时静态资源：public/index.html、public/dist/app.js、worklet
# public/dist/app.js 由 scripts/build-web.bat 生成；构建镜像前需先跑一次
COPY public/ ./public/

# 日志与证书目录（证书可由卷挂进来持久化，否则容器内自生成）
RUN mkdir -p /app/logs /app/certs

# 以非 root 运行
RUN useradd -m -u 10001 pet && chown -R pet:pet /app
USER pet

EXPOSE 8770 8772

# 健康检查：TLS 开启时先走 https:8772，未开启自动退回 http:8770（见 healthcheck.py）
HEALTHCHECK --interval=30s --timeout=6s --start-period=8s --retries=3 \
  CMD ["python", "src/healthcheck.py"]

# PET_TLS=1 → HTTPS/WSS（自签证书，浏览器首次信任一次），局域网语音必需；HTTP 8770 仍在。
# 证书优先用挂进来的 /app/certs（SAN 里带宿主机局域网 IP），没有则容器内自动生成。
# API Key 通过 DASHSCOPE_API_KEY 注入（勿打包进镜像）。
CMD ["python", "src/server.py", "--host", "0.0.0.0", "--port", "8770", "--tls", "--tls-port", "8772"]
