@echo off
title Pipnex AI - Trading Platform Launcher
cd /d "%~dp0"

echo ============================================================
echo   PIPNEX AI TRADING PLATFORM
echo   Starting local servers...
echo ============================================================

set PATH=C:\Program Files\nodejs;%PATH%

echo 1. Starting MT5 Native Terminal Bridge (Port 8000)...
start "Pipnex MT5 Bridge" cmd /k "C:\Users\ssegu\.local\bin\uv.exe run --python 3.11 --with MetaTrader5 python -u mt5_bridge.py"

timeout /t 2 /nobreak >nul

echo 2. Starting Pipnex Web Application (Port 5173)...
start "Pipnex Web Platform" cmd /k "npm run dev"

timeout /t 3 /nobreak >nul

echo 3. Opening Platform in Browser...
start http://localhost:5173

echo ============================================================
echo   Platform is running!
echo   Local Address: http://localhost:5173
echo ============================================================
pause
