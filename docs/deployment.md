# 部署

三种方式按场景选，**不能同时运行**（都占 8770 / 8772）。切换前先停掉上一个：

- Docker：`docker compose down`
- 原生：直接关窗口 / `Ctrl+C`

## 前置条件

| 项 | 要求 |
|---|---|
| Python | 3.10+（`requirements.txt`：websockets 15.0.1、cryptography ≥42） |
| 密钥 | `DASHSCOPE_API_KEY`（写在 `.env`、环境变量或 `--key` 之一） |
| 浏览器 | 需要 WebGPU：Chrome / Edge 113+、Safari 26+、Firefox 141+（Windows） |
| 出网 | 能访问 `wss://dashscope.aliyuncs.com`；用知识库时还要能访问公司内网 |

**Key 三种给法**（优先级从高到低）：

```bash
python src/server.py --key sk-xxxx
set DASHSCOPE_API_KEY=sk-xxxx && python src/server.py
# 或写进项目根 .env（推荐，见 .env.example）
```

**换模型**：`set PET_MODEL=qwen-audio-3.0-realtime-flash && python src/server.py`（重启生效）。

## 方式 1：本机运行

```bash
python src/server.py --open
```

浏览器打开 `http://127.0.0.1:8770`，双击右下角的球，允许麦克风。

也可以用 `start.bat`（Windows；内部固定用 `C:\Users\LENOVO\.workbuddy\binaries\python\envs\default\Scripts\python.exe`，
找不到时回退到 `python`）。

> `start.bat` / `start-lan.bat` 必须保持「纯 ASCII + CRLF 行尾」——它们是给 cmd.exe 读的，
> 中文或 UTF-8+LF 会被代码页吃坏。

## 方式 2：局域网（其他电脑也能用语音）

目标地址：`https://<本机IP>:8772`。**必须是 https**：浏览器只在安全上下文
（localhost / 127.0.0.1 / https）里提供麦克风，`http://局域网IP` 拿不到。

### 2a. 原生运行（最简单，无需管理员）★

```bat
docker compose down                 :: 先腾出端口
start-lan.bat
:: 或： python src/server.py --host 0.0.0.0 --port 8770 --tls --tls-port 8772
```

绑定 `0.0.0.0` 的原生进程在局域网可直接访问。证书自动生成到 `certs/`，
SAN 包含 `localhost` / `127.0.0.1` / 本机所有局域网 IP。首次访问点「高级 → 继续前往」。

### 2b. Docker + Windows 端口转发（需要管理员，一次即可）

本机 Docker Desktop 的端口只发布到 `127.0.0.1`（实测 `192.168.5.91:8772` 不通），
所以要加一层端口代理。**必须在 Windows 管理员 CMD / PowerShell 里执行，不是在 WSL 里**：

```bat
netsh interface portproxy add v4tov4 listenaddress=0.0.0.0 listenport=8772 connectaddress=127.0.0.1 connectport=8772
netsh advfirewall firewall add rule name="pet-demo-8772" dir=in action=allow protocol=TCP localport=8772
```

撤销：`netsh interface portproxy delete v4tov4 listenaddress=0.0.0.0 listenport=8772`

### 换机器 / 换网段

IP 变了之后证书里的 SAN 会不匹配，删掉 `certs/` 重启即可重新签发。

## 方式 3：Docker

镜像只装两个运行时依赖，单容器同时提供静态页面、WebSocket 中继与 HTTPS。
密钥通过环境变量注入，**不打进镜像**（`.env` / `key.txt` 都在 `.dockerignore` 里）。

### 3a. docker compose（推荐）

```bash
docker compose up -d --build
# 本机打开 http://127.0.0.1:8770
```

### 3b. 命令行

```bash
docker build -t minicpm-demo:latest .
docker run -d --name minicpm-demo --restart unless-stopped \
  -p 8770:8770 -p 8772:8772 \
  --env-file .env \
  -v "$(pwd)/logs:/app/logs" \
  -v "$(pwd)/certs:/app/certs" \
  minicpm-demo:latest
```

### 关键约束

- **端口**：8770 = HTTP（本机日常），8772 = HTTPS（局域网语音必需）。
  容器内 HTTP 固定监听 `0.0.0.0:8770`、HTTPS 监听 `0.0.0.0:8772`。
- **构建前先产出前端**：镜像只 COPY `public/`，其中 `public/dist/app.js` 需要先跑
  `scripts/build-web.bat`（仓库里已提交一份，通常不用重跑）。
- **配置项**（`.env` 或 compose 的 `environment`）：

  | 变量 | 说明 |
  |---|---|
  | `DASHSCOPE_API_KEY` | 必填 |
  | `PET_MODEL` | 上游模型，默认 `qwen-audio-3.1-realtime-plus` |
  | `PET_KB_BASE` / `PET_KB_USER` / `PET_KB_TIMEOUT` | 公司知识库（可选） |
  | `PET_TLS_PORT` | HTTPS 端口，默认 8772 |
  | `PET_TLS_EXTRA_SAN` | 自签证书额外 SAN（Docker 下探测不到宿主机 IP，需手动给） |

- **健康检查**：镜像内置 `HEALTHCHECK`，先探 `https:8772` 再退回 `http:8770`；
  `docker compose ps` 会显示 `healthy`。脚本是 `src/healthcheck.py`。
- **日志**：容器内写 `/app/logs`，compose 已挂到宿主机 `./logs/`。
  `http://127.0.0.1:8770/logs` 可列出文件名。
- **需要出网**：容器要能访问 `wss://dashscope.aliyuncs.com`；知识库在內网时还要能访问该地址。

## 故障排查

| 现象 | 检查 |
|---|---|
| 麦克风拿不到 | 地址是否为 `http://127.0.0.1:8770` 或 `https://`；是否用了应用内预览面板 / `file://` |
| 页面能开但球不显示 | 浏览器是否支持 WebGPU（`chrome://gpu`） |
| 双击没反应 | 控制台是否有 `[liquid-orb] WebGPU 初始化失败`；降级提示会出现在右下角 |
| 知识库总是"查不到" | `PET_KB_BASE` 是否可达；本机实测 `WinError 10061` 表示端口拒绝连接 |
| 通话断开（code 1006） | 中继是否还在跑；上游是否可达 |
