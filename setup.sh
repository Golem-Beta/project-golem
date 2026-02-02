#!/bin/bash

# 定義顏色，讓輸出更好看
GREEN='\033[0;32m'
CYAN='\033[0;36m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${CYAN}=======================================================${NC}"
echo -e "${CYAN}  🦞 Golem v7.6 Setup - Pure Installer${NC}"
echo -e "${CYAN}  Target: Linux / macOS${NC}"
echo -e "${CYAN}  注意：本腳本僅安裝環境，請確保您已放入原始碼！${NC}"
echo -e "${CYAN}=======================================================${NC}"
echo ""

# 1. 檢查 Node.js 環境
echo -e "${GREEN}🔍 [1/6] Checking Node.js...${NC}"
if ! command -v node &> /dev/null; then
    echo -e "${RED}[ERROR] Node.js is not installed!${NC}"
    echo "Please install Node.js from https://nodejs.org/"
    exit 1
fi
node -v
echo ""

# 2. 檢查使用者提供的原始碼 (關鍵步驟)
echo -e "${GREEN}📂 [2/6] Verifying core files...${NC}"
if [ ! -f "index.js" ]; then
    echo -e "${RED}[嚴重錯誤] 找不到 index.js！${NC}"
    echo -e "請將您完整版的 index.js 放入此資料夾後再執行。"
    exit 1
fi

if [ ! -f "skills.js" ]; then
    echo -e "${YELLOW}[提示] 找不到 skills.js，若您的 index.js 需要它，請記得放入。${NC}"
else
    echo -e "   ✅ Found skills.js"
fi
echo -e "   ✅ Found index.js (Using your provided version)"
echo ""

# 3. 清理舊環境
echo -e "${GREEN}🧹 [3/6] Cleaning old environment...${NC}"
if [ -d "node_modules" ]; then
    echo "   - Removing old node_modules..."
    rm -rf node_modules
fi
if [ -f "package-lock.json" ]; then
    rm package-lock.json
fi
echo -e "   ✅ Environment cleaned."
echo ""

# 4. 安裝依賴
echo -e "${GREEN}📦 [4/6] Installing dependencies...${NC}"
if [ ! -f "package.json" ]; then
    npm init -y > /dev/null
fi

# 安裝 v7.2 所需套件 (含 discord.js)
npm install dotenv node-telegram-bot-api discord.js puppeteer puppeteer-extra puppeteer-extra-plugin-stealth @google/generative-ai uuid

if [ $? -ne 0 ]; then
    echo -e "${RED}[ERROR] npm install failed! Check your internet connection.${NC}"
    exit 1
fi
echo -e "   ✅ Dependencies installed."
echo ""

# 5. 下載瀏覽器核心
echo -e "${GREEN}🌐 [5/6] Setting up Puppeteer Chrome...${NC}"
npx puppeteer browsers install chrome
echo -e "   ✅ Browser core ready."
echo ""

# 6. 初始化設定檔
echo -e "${GREEN}🧠 [6/6] Configuring environment...${NC}"

# 建立記憶體目錄
mkdir -p golem_memory

# 初始化 JSON
if [ ! -f "golem_learning.json" ]; then
    echo "{}" > golem_learning.json
fi

# 建立 .env (若不存在)
if [ ! -f ".env" ]; then
    echo "   - Creating v7.6 .env template..."
    cat <<EOT >> .env
# ======================================================
# 🧠 Golem Brain (Web Gemini API Keys)
# ======================================================
# 必填：用於自癒與視覺分析，支援多組 Key 用逗號分隔
GEMINI_API_KEYS=

# ======================================================
# ✈️ Telegram 設定 (左頭)
# ======================================================
TELEGRAM_TOKEN=
ADMIN_ID=

# ======================================================
# 👾 Discord 設定 (右頭)
# ======================================================
DISCORD_TOKEN=
DISCORD_ADMIN_ID=

# ======================================================
# ⚙️ 系統設定
# ======================================================
USER_DATA_DIR=./golem_memory
GOLEM_TEST_MODE=false
EOT
    echo -e "   ⚠️ .env created! Don't forget to fill in your Tokens."
else
    echo -e "   ✅ .env already exists (Skipping)."
fi

echo ""
echo -e "${CYAN}=======================================================${NC}"
echo -e "${GREEN}  🎉 Deployment Complete!${NC}"
echo -e "${CYAN}=======================================================${NC}"
echo ""
echo -e "Next Steps:"
echo -e "1. Edit config file:     ${YELLOW}nano .env${NC}"
echo -e "2. Start the bot:        ${YELLOW}node index.js${NC}"
echo ""
