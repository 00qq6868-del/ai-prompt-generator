@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion
title AI Prompt Generator
color 0A

:: ============================================================
::  start.bat  —  快速启动（已 build 过才能用）
::  首次使用请运行 setup.bat
:: ============================================================

:: 检查 build 是否存在
if not exist ".next\standalone\server.js" (
    echo.
    echo  [ERROR] 找不到构建文件。
    echo.
    echo  请先运行 setup.bat 完成初始构建。
    echo.
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
echo   AI Prompt Generator  —  启动模式选择
echo  ============================================================
echo.
echo   [1] 局域网模式  （默认）
echo       同一个 WiFi/热点 的设备可以访问
echo       速度快，无需联网，隐私安全
echo.
echo   [2] 公网模式  （任意网络）
echo       生成一个临时公网 URL
echo       外地的手机/电脑也能访问
echo       需要联网（用于建立隧道），隧道关闭后 URL 失效
echo.
set /p MODE="  请输入 1 或 2（直接回车 = 选 1）: "

if "!MODE!"=="2" (
    echo.
    echo  正在切换到公网模式...
    call start-tunnel.bat
    exit /b
)

:: ── 局域网模式 ──────────────────────────────────────────────
echo.
echo  ============================================================
echo   AI Prompt Generator  ^|  局域网模式
echo  ============================================================
echo.
echo   本地访问  ^(这台电脑^):
echo     http://localhost:3000
echo.
echo   局域网访问  ^(同一 WiFi 的手机/电脑^):
echo     http://!LAN_IP!:3000
echo.
echo   使用方法：
echo     * 手机连到和这台电脑相同的 WiFi
echo     * 浏览器打开上面的局域网地址
echo     * 或扫描 app 页面顶部的二维码
echo.
echo   如需任意网络访问，停止后重新选择 [2] 公网模式
echo.
echo   停止：按 Ctrl+C
echo  ============================================================
echo.

set PORT=3000
set HOSTNAME=0.0.0.0
node .next\standalone\server.js

pause
