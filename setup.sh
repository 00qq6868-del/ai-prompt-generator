#!/usr/bin/env bash
# setup.sh — AI 提示词生成器：Mac / Linux 一键启动
# 用法: chmod +x setup.sh && ./setup.sh

set -euo pipefail

# Colors
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

step() { echo -e "\n${CYAN}[$1/5]${RESET} ${BOLD}$2${RESET}"; }
ok()   { echo -e "  ${GREEN}✓${RESET}  $1"; }
warn() { echo -e "  ${YELLOW}⚠${RESET}  $1"; }
die()  { echo -e "  ${RED}✗${RESET}  $1"; exit 1; }

echo -e ""
echo -e "${BOLD}╔══════════════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}║       AI 提示词生成器 — Mac/Linux 一键启动       ║${RESET}"
echo -e "${BOLD}╚══════════════════════════════════════════════════╝${RESET}"

# ── Step 1: Check Node.js ─────────────────────────────────────
step 1 "检查 Node.js..."
command -v node &>/dev/null || die "未找到 Node.js，请安装 18+ 版本: https://nodejs.org/"

NODE_VER=$(node --version)
NODE_MAJOR=$(echo "$NODE_VER" | cut -d'.' -f1 | tr -d 'v')
[ "$NODE_MAJOR" -ge 18 ] || die "Node.js 必须 >= 18，当前: $NODE_VER  →  https://nodejs.org/"
ok "Node.js $NODE_VER"

# ── Step 2: npm install ───────────────────────────────────────
step 2 "安装依赖包（首次约需 1-3 分钟）..."
npm install || die "npm install 失败，请检查网络连接"
ok "依赖安装完成"

# ── Step 3: .env.local ───────────────────────────────────────
step 3 "配置环境变量..."
if [ ! -f ".env.local" ]; then
  [ -f ".env.example" ] || die "找不到 .env.example，请重新下载项目"
  cp .env.example .env.local
  ok "已创建 .env.local"
  echo ""
  warn "重要: 请编辑 .env.local，填入至少一个 API Key！"
  warn "命令: nano .env.local  或  open -e .env.local（Mac）"
else
  ok ".env.local 已存在（跳过）"
fi

# ── Step 4: Generate icons ────────────────────────────────────
step 4 "生成 PWA 图标..."
if [ ! -f "public/icons/icon-192.png" ]; then
  node scripts/generate-icons.js || die "图标生成失败"
else
  ok "图标已存在（跳过）"
fi

# ── Step 5: Get LAN IP & start ───────────────────────────────
step 5 "启动开发服务器..."

# Detect LAN IP: macOS vs Linux
if command -v ipconfig &>/dev/null 2>&1; then
  # macOS
  LAN_IP=$(ipconfig getifaddr en0 2>/dev/null \
        || ipconfig getifaddr en1 2>/dev/null \
        || echo "localhost")
else
  # Linux
  LAN_IP=$(hostname -I 2>/dev/null \
    | tr ' ' '\n' \
    | grep -v '^127\.' \
    | grep -v '^::' \
    | head -1 \
    || echo "localhost")
fi
LAN_IP=$(echo "$LAN_IP" | tr -d '[:space:]')

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}║                    服务器启动成功！                        ║${RESET}"
echo -e "${BOLD}║                                                            ║${RESET}"
echo -e "${BOLD}║  本机访问:   ${GREEN}http://localhost:3000${RESET}${BOLD}                       ║${RESET}"
echo -e "${BOLD}║  局域网:     ${GREEN}http://${LAN_IP}:3000${RESET}${BOLD}                   ║${RESET}"
echo -e "${BOLD}║                                                            ║${RESET}"
echo -e "${BOLD}║  → 其他电脑: 在浏览器打开上面的局域网地址              ║${RESET}"
echo -e "${BOLD}║  → 手机:     扫描应用内顶栏的二维码图标                ║${RESET}"
echo -e "${BOLD}║  → 停止:     按 Ctrl+C                                  ║${RESET}"
echo -e "${BOLD}╚══════════════════════════════════════════════════════════╝${RESET}"
echo ""

# Bind to 0.0.0.0 — required for LAN access from other devices
# For iOS PWA install, switch to: next dev --experimental-https --hostname 0.0.0.0
exec npx next dev --hostname 0.0.0.0 --port 3000
