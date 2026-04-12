@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion
title AI提示词生成器 - 打包成 .exe 安装包
color 0B

echo.
echo  ╔══════════════════════════════════════════════╗
echo  ║   AI提示词生成器  —  打包 Windows 安装包     ║
echo  ║   完成后得到一个 .exe，双击即可安装          ║
echo  ╚══════════════════════════════════════════════╝
echo.
echo  预计耗时：3-8 分钟（取决于网速和电脑速度）
echo.

:: 检查 Node.js
where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo  [错误] 未找到 Node.js，请先安装: https://nodejs.org/
    pause & exit /b 1
)

:: 检查 npm 依赖
if not exist "node_modules\electron" (
    echo  [1/4] 安装依赖...
    call npm install
    if %ERRORLEVEL% NEQ 0 (
        echo  [错误] 依赖安装失败，检查网络后重试
        pause & exit /b 1
    )
) else (
    echo  [1/4] 依赖已就绪 ✓
)

:: 生成图标
echo.
echo  [2/4] 生成图标...
if not exist "public\icons\icon-192.png" (
    node scripts\generate-icons.js
)
echo  图标就绪 ✓

:: 构建 Next.js
echo.
echo  [3/4] 构建 Web 服务器（这步最慢，约 2-4 分钟）...
call npm run build
if %ERRORLEVEL% NEQ 0 (
    echo  [错误] Web 构建失败，查看上面的报错信息
    pause & exit /b 1
)

:: 复制静态资源到 standalone
xcopy /E /Y /I ".next\static" ".next\standalone\.next\static" >nul 2>&1
xcopy /E /Y /I "public" ".next\standalone\public" >nul 2>&1
echo  Web 服务器构建完成 ✓

:: 打包 Electron
echo.
echo  [4/4] 打包成 .exe 安装包（约 2-3 分钟）...
echo  提示：可能会下载 Electron 二进制文件，请保持网络畅通
echo.
call npx electron-builder --win --publish never
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo  [错误] 打包失败，常见原因：
    echo    * 网络问题（Electron 需要从 GitHub 下载二进制）
    echo    * 解决方法：设置镜像后重试
    echo      set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
    echo      再次运行本脚本
    pause & exit /b 1
)

echo.
echo  ╔══════════════════════════════════════════════╗
echo  ║   打包完成！                                 ║
echo  ║                                              ║
echo  ║   安装包位置：dist-electron\                 ║
echo  ║   文件名类似：AI提示词生成器 Setup 1.0.0.exe ║
echo  ║                                              ║
echo  ║   把这个 .exe 发给任何人，双击安装即可       ║
echo  ╚══════════════════════════════════════════════╝
echo.

:: 自动打开输出目录
if exist "dist-electron" (
    explorer dist-electron
)

pause
