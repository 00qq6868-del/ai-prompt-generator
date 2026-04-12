@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion
title AI Prompt Generator - 公网模式
color 0B

:: ============================================================
::  start-tunnel.bat
::  一键启动：本地服务器 + 公网隧道
::  任何网络、任何设备都能访问生成的公网 HTTPS 地址
:: ============================================================

:: 检查 build
if not exist ".next\standalone\server.js" (
    echo.
    echo  [ERROR] 找不到构建文件，请先运行 setup.bat
    pause & exit /b 1
)

:: 检测局域网 IP
set LAN_IP=localhost
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /i "IPv4"') do (
    set RAW=%%a
    set RAW=!RAW: =!
    echo !RAW! | findstr /v "127.0.0.1" >nul 2>&1
    if !ERRORLEVEL! EQU 0 (
        if not "!RAW!"=="" (
            if "!LAN_IP!"=="localhost" set LAN_IP=!RAW!
        )
    )
)

echo.
echo  ============================================================
echo   AI Prompt Generator  ^|  公网隧道模式
echo  ============================================================

:: ── Step 1: 启动本地服务器（后台） ──────────────────────────
echo.
echo  [1/2] 启动本地服务器...
if exist server.log del server.log
set PORT=3000
set HOSTNAME=0.0.0.0
start /B node .next\standalone\server.js > server.log 2>&1

:: 等待 "Ready in" 出现在 log（最多 15 秒）
set /a WAIT_COUNT=0
:WAIT_SERVER
timeout /t 1 /nobreak >nul
set /a WAIT_COUNT+=1
findstr /c:"Ready in" server.log >nul 2>&1
if !ERRORLEVEL! EQU 0 goto SERVER_OK
if !WAIT_COUNT! GEQ 15 goto SERVER_TIMEOUT
goto WAIT_SERVER

:SERVER_OK
echo  [OK] 服务器已就绪  (http://localhost:3000)
goto TUNNEL_START

:SERVER_TIMEOUT
echo  [WARN] 服务器启动超时，继续尝试...

:: ── Step 2: 启动公网隧道 ─────────────────────────────────────
:TUNNEL_START
echo.
echo  [2/2] 正在建立公网隧道...
echo        (通常需要 5-15 秒，请稍候)
echo.

:: 用 Node 脚本启动 localtunnel，把输出写到 tunnel.log
if exist tunnel.log del tunnel.log
start /B node scripts\tunnel.js 3000 > tunnel.log 2>&1

:: 等待 tunnel.log 中出现 TUNNEL_URL= （最多 30 秒）
set TUNNEL_URL=
set /a T_WAIT=0
:WAIT_TUNNEL
timeout /t 1 /nobreak >nul
set /a T_WAIT+=1
if exist tunnel.log (
    for /f "tokens=1,* delims==" %%K in ('findstr /b "TUNNEL_URL" tunnel.log 2^>nul') do (
        if "%%K"=="TUNNEL_URL" set TUNNEL_URL=%%L
    )
)
if not "!TUNNEL_URL!"=="" goto TUNNEL_OK
if !T_WAIT! GEQ 30 goto TUNNEL_FAIL
goto WAIT_TUNNEL

:TUNNEL_OK
:: ── 成功：显示所有访问地址 ────────────────────────────────
echo.
echo  ============================================================
echo.
echo   访问地址汇总：
echo.
echo   [本机]    http://localhost:3000
echo             只有这台电脑能用
echo.
echo   [局域网]  http://!LAN_IP!:3000
echo             连同一个 WiFi/热点的手机和电脑能用
echo.
echo   [公网] ^>^> !TUNNEL_URL! ^<^<
echo             任何地方、任何网络、任何设备都能用
echo             把这个地址发给对方就行
echo.
echo  ============================================================
echo.
echo   提示：
echo    * 公网地址每次启动都不一样，关掉再开会换新地址
echo    * 对方访问时可能看到 localtunnel 的提示页，点击继续即可
echo    * 隧道依赖网络，如果对方访问慢，是正常的
echo    * 停止服务：按 Ctrl+C
echo.
echo   想让手机直接扫码？打开 app 顶部的二维码按钮
echo   (二维码显示的是局域网地址，公网地址手动发送给对方)
echo.
echo  ============================================================
goto KEEP_ALIVE

:TUNNEL_FAIL
:: ── 失败：显示备用方案 ────────────────────────────────────
echo.
echo  ============================================================
echo   [WARN] 公网隧道建立失败
echo.
echo   可能原因：
echo    * 没有网络连接
echo    * localtunnel 服务器繁忙（稍后重试）
echo    * 防火墙阻止了出站连接
echo.
echo   备用方案：
echo    * 局域网：  http://!LAN_IP!:3000  (同一 WiFi 的设备)
echo    * 公网：    手动运行  npx localtunnel --port 3000
echo    * 或用 Cloudflare 隧道（更稳定）：
echo      winget install Cloudflare.cloudflared
echo      cloudflared tunnel --url http://localhost:3000
echo.
echo   服务器仍在运行，局域网模式可以正常使用
echo   停止：按 Ctrl+C
echo  ============================================================

:: ── 保持运行直到用户按 Ctrl+C ────────────────────────────
:KEEP_ALIVE
timeout /t 10 /nobreak >nul
goto KEEP_ALIVE
