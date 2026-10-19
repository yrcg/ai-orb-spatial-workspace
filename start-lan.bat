@echo off
chcp 65001 >nul
cd /d "%~dp0"

rem ============================================================
rem  LAN launcher: run the relay natively (NOT in Docker) with
rem  HTTPS/WSS on 0.0.0.0, so other PCs on the LAN can open it
rem  and use full-duplex VOICE (https is required for the mic).
rem
rem  1) This binds ports 8770 (http) + 8772 (https). If the
rem     Docker container is up, stop it first:  docker compose down
rem  2) Open https://<this-PC-IP>:8772 on the other PC and accept
rem     the self-signed cert once ("Advanced -> Proceed").
rem
rem  Why native and not Docker: on this machine Docker Desktop
rem  publishes ports to 127.0.0.1 only, so the LAN cannot reach
rem  them. A native process on 0.0.0.0 is reachable on the LAN.
rem ============================================================

set "PY=C:\Users\LENOVO\.workbuddy\binaries\python\envs\default\Scripts\python.exe"
if not exist "%PY%" set "PY=python"

echo Starting desktop-pet relay with HTTPS/WSS on the LAN ...
echo Open https://^<this-PC-IP^>:8772 from other computers.
echo (This PC: https://127.0.0.1:8772  -  accept the cert once.)
echo.
echo NOTE: if "docker compose" is running, stop it first.
echo.

"%PY%" src\server.py --host 0.0.0.0 --port 8770 --tls --tls-port 8772 %*
pause
