@echo off
chcp 65001 >nul
cd /d "%~dp0..\web"

echo Building front-end (web/ -> public/dist) ...
where npm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] 未找到 npm。请先安装 Node.js 18+ ，或直接使用已提交的 public\dist\app.js。
  pause
  exit /b 1
)

if not exist node_modules (
  echo Installing dependencies ...
  call npm ci || call npm install
)

call npm run build
if errorlevel 1 (
  echo [ERROR] 构建失败。
  pause
  exit /b 1
)

echo.
echo 构建完成：public\dist\app.js
echo 重新打开 http://127.0.0.1:8770 即可看到新界面。
pause
