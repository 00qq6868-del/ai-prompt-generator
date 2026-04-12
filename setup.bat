@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion
title AI Prompt Generator - Setup
color 0A

echo.
echo  ============================================
echo   AI Prompt Generator -- Windows Setup
echo  ============================================
echo.

:: Step 1: Check Node.js
echo [1/6] Checking Node.js...
where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo  [ERROR] Node.js not found. Install from https://nodejs.org/
    pause & exit /b 1
)
for /f "tokens=*" %%v in ('node --version') do set NODE_VER=%%v
echo  [OK] Node.js %NODE_VER%

:: Step 2: npm install
echo.
echo [2/6] Installing dependencies...
call npm install
if %ERRORLEVEL% NEQ 0 (
    echo  [ERROR] npm install failed. Check your internet connection.
    pause & exit /b 1
)
echo  [OK] Dependencies installed.

:: Step 3: .env.local
echo.
echo [3/6] Setting up .env.local...
if not exist ".env.local" (
    if exist ".env.example" (
        copy ".env.example" ".env.local" >nul
        echo  [OK] Created .env.local
        echo.
        echo  [!] IMPORTANT: Open .env.local and add at least one API Key!
        echo      Or install Ollama (https://ollama.com) for a free local model.
        echo      Edit: notepad .env.local
        echo.
        pause
    ) else (
        echo  [ERROR] .env.example not found.
        pause & exit /b 1
    )
) else (
    echo  [OK] .env.local already exists.
)

:: Step 4: Generate icons
echo.
echo [4/6] Generating PWA icons...
if not exist "public\icons\icon-192.png" (
    node scripts\generate-icons.js
    if %ERRORLEVEL% NEQ 0 (
        echo  [ERROR] Icon generation failed.
        pause & exit /b 1
    )
) else (
    echo  [OK] Icons already exist.
)

:: Step 5: Production build
echo.
echo [5/6] Building production bundle (first time may take 1-2 minutes)...
call npm run build
if %ERRORLEVEL% NEQ 0 (
    echo  [ERROR] Build failed. Check output above for details.
    pause & exit /b 1
)
echo  [OK] Build complete.

:: Copy static assets into standalone folder (required by Next.js standalone mode)
echo  Copying static assets...
if exist ".next\standalone" (
    xcopy /E /Y /I ".next\static" ".next\standalone\.next\static" >nul 2>&1
    xcopy /E /Y /I "public" ".next\standalone\public" >nul 2>&1
    echo  [OK] Static assets ready.
) else (
    echo  [ERROR] Standalone folder not found. Build may have failed.
    pause & exit /b 1
)

:: Step 6: Get LAN IP and start
echo.
echo [6/6] Starting server...

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
echo  ============================================
echo   Server is starting!
echo.
echo   Local:   http://localhost:3000
echo   Network: http://!LAN_IP!:3000
echo.
echo   Other devices: open the Network URL above
echo   Mobile:  scan the QR code in the app header
echo   Stop:    press Ctrl+C
echo.
echo   Next time: run start.bat (no rebuild needed)
echo  ============================================
echo.

:: Optional: uncomment to expose via public tunnel (any network)
:: start /B npx localtunnel --port 3000 > tunnel.log 2>&1
:: echo   Public tunnel: check tunnel.log for URL

set PORT=3000
set HOSTNAME=0.0.0.0
node .next\standalone\server.js

pause
