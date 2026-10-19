@echo off
chcp 65001 >nul
cd /d "%~dp0"

set "PY=C:\Users\LENOVO\.workbuddy\binaries\python\envs\default\Scripts\python.exe"
if not exist "%PY%" set "PY=python"

echo Starting desktop-pet demo (full-duplex voice) ...
echo A browser window will open automatically.
echo IMPORTANT: do NOT open the page in the in-app preview panel,
echo            the microphone will fail with NotReadableError there.
echo Logs are written to the logs\ directory.
echo.

"%PY%" src\server.py --port 8770 --open %*
pause
