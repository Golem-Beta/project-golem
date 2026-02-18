#!/bin/bash

# ==========================================
# Project Golem v9.0 (Titan Chronos) - Linux/macOS
# ==========================================

# --- 顏色定義 ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# --- 核心：路徑與跨平台 .env 更新函數 ---
DOT_ENV_PATH="$(cd "$(dirname "$0")" && pwd)/.env"

update_env() {
    local key=$1
    local val=$2
    # 處理特殊字符，避免 sed 報錯
    val=$(echo "$val" | sed -e 's/[\/&]/\\&/g')

    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS 需要空的備份參數
        sed -i '' "s|^$key=.*|$key=$val|" "$DOT_ENV_PATH"
    else
        # Linux 直接替換
        sed -i "s|^$key=.*|$key=$val|" "$DOT_ENV_PATH"
    fi
}

# --- 狀態檢查 ---
check_status() {
    # Node Version
    NODE_VER=$(node -v 2>/dev/null || echo "N/A")
    if [[ "$NODE_VER" == v18* ]] || [[ "$NODE_VER" == v2* ]]; then
        STATUS_NODE="${GREEN}✅ $NODE_VER${NC}"
    else
        STATUS_NODE="${RED}❌ $NODE_VER (需 v18+)${NC}"
    fi

    # .env
    if [ -f "$DOT_ENV_PATH" ]; then
        STATUS_ENV="${GREEN}✅ 已設定${NC}"
    else
        STATUS_ENV="${RED}❌ 未找到${NC}"
    fi

    # Web Dashboard
    if grep -q "ENABLE_WEB_DASHBOARD=true" "$DOT_ENV_PATH" 2>/dev/null; then
        STATUS_DASH="${GREEN}✅ 啟用${NC}"
        IsDashEnabled=true
    else
        STATUS_DASH="${YELLOW}⏸️  停用${NC}"
        IsDashEnabled=false
    fi
}

# --- 介面顯示 ---
show_header() {
    check_status
    clear
    echo -e "${CYAN}=======================================================${NC}"
    echo -e "${CYAN} 🤖 Project Golem v9.0 (Titan Chronos) Master Control${NC}"
    echo -e "${CYAN}=======================================================${NC}"
    echo -e " 📊 系統狀態:"
    echo -e "    • Node.js: $STATUS_NODE   • Config: $STATUS_ENV   • Web Dashboard: $STATUS_DASH"
    echo -e "${CYAN}-------------------------------------------------------${NC}"
    echo ""
}

# ==========================================
# 主選單
# ==========================================
show_menu() {
    show_header
    echo -e "${YELLOW} --- ⚡ 啟動 (Start) ---${NC}"
    echo -e " [0] 啟動系統 (使用目前配置)"

    echo -e "\n${YELLOW} --- 🛠️  安裝與維護 (Setup & Maintenance) ---${NC}"
    echo -e " [1] 🚀 完整安裝 (Full Setup)      [2] ⚙️  配置設定 (.env Wizard)"
    echo -e " [3] 📦 安裝依賴 (Deps + Dash)     [4] 🌐 重建 Web Dashboard"
    echo -e " [D] 🔄 切換 Web Dashboard 狀態 (Toggle)"

    echo -e "\n [Q] 🚪 退出"
    echo ""
    read -p " 請輸入選項: " choice

    case $choice in
        0) launch_system ;;
        1) step_check_files; step_check_env; config_wizard; step_install_core; step_install_dashboard; step_final ;;
        2) step_check_env; config_wizard; show_menu ;;
        3) step_install_core; step_install_dashboard; echo -e "\n${GREEN}✅ 依賴與 Dashboard 安裝完成。${NC}"; read -p "按 Enter 返回主選單..." ; show_menu ;;
        4) step_install_dashboard; echo -e "\n${GREEN}✅ Dashboard 安裝/重建完成。${NC}"; read -p "按 Enter 返回主選單..." ; show_menu ;;
        [Dd]) toggle_dashboard ;;
        [Qq]) exit 0 ;;
        *) echo -e "${RED}無效選項${NC}"; sleep 1; show_menu ;;
    esac
}

# ==========================================
# 1. 檔案完整性檢查 (V9.0 Titan)
# ==========================================
step_check_files() {
    echo ""
    echo -e "${GREEN}[1/7] 🔍 檢查核心檔案...${NC}"
    # 根據您的 zip 檔內容，這些是 V9.0 的關鍵檔案
    local missing=0
    for file in index.js skills.js package.json dashboard.js memory.html; do
        if [ ! -f "$file" ]; then
            echo -e "${RED}   [ERROR] 缺失檔案: $file${NC}"
            missing=1
        fi
    done

    if [ $missing -eq 1 ]; then
        echo -e "${RED}嚴重錯誤：核心檔案不完整！請確認您已正確解壓縮 V9.0 zip 檔。${NC}"
        exit 1
    fi
    echo -e "   [OK] 檔案完整性檢查通過。"
}

# ==========================================
# 2. 環境變數準備
# ==========================================
step_check_env() {
    echo ""
    echo -e "${GREEN}[2/7] 📄 檢查環境設定檔...${NC}"
    if [ ! -f "$DOT_ENV_PATH" ]; then
        if [ -f ".env.example" ]; then
            cp .env.example "$DOT_ENV_PATH"
            echo -e "${YELLOW}   [INFO] 已從範本建立 .env 檔案。${NC}"
        else
            echo -e "${RED}   [ERROR] 找不到 .env.example，無法建立配置！${NC}"
            exit 1
        fi
    else
        echo -e "   [OK] .env 檔案已存在。"
    fi
}

# ==========================================
# 3. 配置精靈 (Titan Config)
# ==========================================
config_wizard() {
    clear
    echo -e "${CYAN}=======================================================${NC}"
    echo -e "${CYAN} 🧙 環境變數配置精靈 (Titan Config)${NC}"
    echo -e "${CYAN}=======================================================${NC}"
    echo ""

    # 讀取現有值
    [ -f "$DOT_ENV_PATH" ] && source "$DOT_ENV_PATH"

    # --- Gemini ---
    echo -e "${YELLOW}[1/3] Google Gemini API Keys${NC}"
    echo -e " 目前設定: ${GREEN}${GEMINI_API_KEYS:-無}${NC}"
    read -p " 👉 輸入新 Keys (留空保留目前值): " input_gemini
    if [ -n "$input_gemini" ]; then
        update_env "GEMINI_API_KEYS" "$input_gemini"
    fi

    # --- Telegram ---
    echo ""
    echo -e "${YELLOW}[2/3] Telegram Bot Token${NC}"
    echo -e " 目前設定: ${GREEN}${TELEGRAM_TOKEN:-無}${NC}"
    read -p " 👉 輸入新 Token (留空保留目前值): " input_tg
    if [ -n "$input_tg" ]; then
        update_env "TELEGRAM_TOKEN" "$input_tg"
    fi

    # --- Admin ID ---
    echo ""
    echo -e "${YELLOW}[3/4] Admin User ID${NC}"
    echo -e " 目前設定: ${GREEN}${ADMIN_ID:-無}${NC}"
    read -p " 👉 輸入新 ID (留空保留目前值): " input_tg_id
    if [ -n "$input_tg_id" ]; then
        update_env "ADMIN_ID" "$input_tg_id"
    fi

    # --- Web Dashboard ---
    echo ""
    echo -e "${YELLOW}[4/4] Web Dashboard${NC}"
    echo -e " 目前設定: ${GREEN}${ENABLE_WEB_DASHBOARD:-false}${NC}"
    read -p " 👉 是否啟用 Web Dashboard? [Y/n] (預設保持目前值): " input_dash
    input_dash=${input_dash:-""} # Default to empty to keep current
    if [[ "$input_dash" =~ ^[Yy]$ ]]; then
        update_env "ENABLE_WEB_DASHBOARD" "true"
    elif [[ "$input_dash" =~ ^[Nn]$ ]]; then
        update_env "ENABLE_WEB_DASHBOARD" "false"
    fi

    echo ""
    echo -e "${GREEN}[OK] 配置更新完成！${NC}"
    sleep 1
}

# ==========================================
# 4. 依賴安裝
# ==========================================
step_install_core() {
    echo ""
    echo -e "${GREEN}[3/7] 📦 安裝核心依賴...${NC}"
    echo -e "      (包含 puppeteer, blessed, gemini-ai...)"
    npm install
    if [ $? -ne 0 ]; then
        echo -e "${RED}[ERROR] npm install 失敗，請檢查網路或 Node 版本。${NC}"
        exit 1
    fi
正在檢查 Web Dashboard
    echo ""
    echo -e "${GREEN}[4/7] 確認 Dashboard UI 套件...${NC}"
    # 確保 TUI 套件存在
    if [ ! -d "node_modules/blessed" ]; then
        echo -e "${YELLOW}   [INFO] 補安裝 blessed 介面庫...${NC}"
        npm install blessed blessed-contrib express
    fi
}

# ==========================================
# 5. Web Dashboard 安裝
# ==========================================
step_install_dashboard() {
    echo ""
    echo -e "[5/7] 正在檢查 Web Dashboard 設定..."
    
    # 重新讀取 .env 以確保獲取最新狀態
    if [ -f "$DOT_ENV_PATH" ]; then source "$DOT_ENV_PATH"; fi

    if [ "$ENABLE_WEB_DASHBOARD" == "true" ]; then
        if [ -d "web-dashboard" ]; then
            echo -e "${CYAN}偵測到設定為啟用。正在自動安裝並建置 Dashboard...${NC}"
            
            echo -e "${YELLOW}📦 正在安裝 Dashboard 依賴...${NC}"
            cd web-dashboard
            npm install
            if [ $? -ne 0 ]; then
                echo -e "${RED}❌ Dashboard 依賴安裝失敗。${NC}"
                update_env "ENABLE_WEB_DASHBOARD" "false"
            else
                echo -e "${YELLOW}🔨 正在建置 Dashboard (Next.js Build)...${NC}"
                npm run build
                if [ $? -ne 0 ]; then
                    echo -e "${RED}❌ Dashboard 建置失敗。${NC}"
                    update_env "ENABLE_WEB_DASHBOARD" "false"
                else
                    echo -e "${GREEN}✅ Dashboard 建置完成 (./web-dashboard/out)。${NC}"
                    update_env "ENABLE_WEB_DASHBOARD" "true"
                fi
            fi
            cd ..
        else
            echo -e "${RED}⚠️  設定為啟用，但找不到 web-dashboard 目錄。自動停用。${NC}"
            update_env "ENABLE_WEB_DASHBOARD" "false"
        fi
    else
        echo -e "${YELLOW}⏩ Web Dashboard 設定為停用，跳過安裝/建置。${NC}"
    fi
}

# ==========================================
# 5. 完成與啟動
# ==========================================
step_final() {
    echo ""
    echo -e "${GREEN}=======================================================${NC}"
    echo -e "${GREEN} 🎉 部署成功！Golem v9.0 (Titan) 已就緒。${NC}"
    echo -e "${GREEN}=======================================================${NC}"
    echo ""
    echo -e " 系統將在 5 秒後自動啟動..."
    echo -e " (按 Ctrl+C 可取消)"
    
    # 倒數計時
    secs=5
    while [ $secs -gt 0 ]; do
       echo -ne " \r⏳ 倒數: $secs 秒... "
       sleep 1
       : $((secs--))
    done
    echo ""
    launch_system
}

# ==========================================
# 工具：切換 Dashboard
# ==========================================
toggle_dashboard() {
    check_status # 更新 IsDashEnabled 狀態
    if [ "$IsDashEnabled" = true ]; then
        update_env "ENABLE_WEB_DASHBOARD" "false"
        echo -e "${YELLOW}⏸️  已停用 Web Dashboard。${NC}"
    else
        update_env "ENABLE_WEB_DASHBOARD" "true"
        echo -e "${GREEN}✅ 已啟用 Web Dashboard。${NC}"
    fi
    sleep 1
    show_menu
}

# ==========================================
# 啟動系統 (V9.0 TUI Mode)
# ==========================================
launch_system() {
    clear
    show_header
    echo -e "${CYAN}🚀 正在啟動 Golem v9.0 控制台...${NC}"
    
    # 檢查 Web Dashboard 狀態
    if [ "$IsDashEnabled" = true ]; then
        if [ ! -d "web-dashboard/out" ]; then
            echo -e "${YELLOW}⚠️  警告: Web Dashboard 已啟用但尚未建置 (缺失 /out 目錄)。${NC}"
            echo -e "   請先執行 [4] 重建 Web Dashboard，否則 Web 介面將無法顯示。"
            sleep 2
        else
            echo -e "${GREEN}🌐 Web Dashboard 已就緒，將於啟動後在 localhost:3000 開放。${NC}"
        fi
    fi

    echo -e " [INFO] 正在載入 Neural Memory 與 戰術介面..."
    echo -e " [TIPS] 若要離開，請按 'q' 或 Ctrl+C"
    echo ""
    sleep 2

    # 使用 node index.js dashboard 啟動 (由 npm run dashboard 定義)
    npm run dashboard
    
    echo ""
    echo -e "${YELLOW}[INFO] 系統已停止。${NC}"
    read -p "按 Enter 返回主選單..."
    show_menu
}

# --- 程式入口 ---
# 檢查權限 (建議)
if [ ! -x "$0" ]; then
    echo -e "${YELLOW}[WARN] 請先執行: chmod +x setup.sh${NC}"
fi

# --- CLI Arguments ---
case "$1" in
    --start)
        launch_system
        ;;
    --install)
        step_check_files; step_check_env; config_wizard; step_install_core; step_install_dashboard; step_final
        ;;
    --dashboard)
        step_install_dashboard
        ;;
    --help)
        echo "Usage: ./setup.sh [--start | --install | --dashboard]"
        exit 0
        ;;
    *)
        show_menu
        ;;
esac
