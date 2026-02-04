@echo off
setlocal EnableDelayedExpansion
chcp 65001 >nul

title Golem v8.2 全自動安裝精靈
echo ==========================================================
echo 🦞 Project Golem v8.2 - 全自動安裝精靈
echo ==========================================================
echo.

:: ------------------------------------------------------------
:: 0. 檔案完整性檢查
:: ------------------------------------------------------------
echo [1/5] 正在檢查核心檔案完整性...
set "MISSING_FILES="
if not exist index.js set "MISSING_FILES=!MISSING_FILES! index.js"
if not exist skills.js set "MISSING_FILES=!MISSING_FILES! skills.js"
if not exist package.json set "MISSING_FILES=!MISSING_FILES! package.json"
if not exist memory.html set "MISSING_FILES=!MISSING_FILES! memory.html"

if defined MISSING_FILES (
    echo.
    echo ❌ 錯誤：核心檔案遺失！(!MISSING_FILES!)
    pause
    exit /b
)
echo ✅ 核心檔案檢查通過。
echo.

:: ------------------------------------------------------------
:: 1. 檢查並自動安裝 Node.js (✨ v8.2 重大升級)
:: ------------------------------------------------------------
echo [2/5] 正在檢查 Node.js 環境...
node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo ⚠️ 偵測到未安裝 Node.js！
    echo 📦 正在嘗試使用 Windows Winget 自動下載並安裝 (LTS 版本)...
    echo ⏳ 這可能需要幾分鐘，且可能會跳出「允許變更」視窗，請點選 [是]...
    echo.
    
    :: 嘗試使用 winget 安裝
    winget install -e --id OpenJS.NodeJS.LTS --silent --accept-source-agreements --accept-package-agreements
    
    if %errorlevel% neq 0 (
        echo.
        echo ❌ 自動安裝失敗 (可能是您的 Windows 版本太舊不支援 Winget)。
        echo 👉 請手動前往官網下載安裝：https://nodejs.org/
        pause
        exit /b
    ) else (
        echo.
        echo ✅ Node.js 安裝成功！
        echo ⚠️ 重要：由於 Windows 環境變數限制，您必須 **關閉此視窗** 並 **重新執行 setup.bat** 才能生效。
        echo.
        pause
        exit
    )
)
echo ✅ Node.js 已安裝。
echo.

:: ------------------------------------------------------------
:: 2. 設定環境變數 (.env)
:: ------------------------------------------------------------
echo [3/5] 正在設定環境變數 (.env)...
if not exist .env (
    if exist .env.example (
        copy .env.example .env >nul
        echo ✅ 已從範本建立 .env 檔案。
    ) else (
        echo ⚠️ 找不到 .env.example，跳過。
    )
) else (
    echo ✅ .env 已存在。
)
echo.

:: ------------------------------------------------------------
:: 3. 安裝 NPM 依賴
:: ------------------------------------------------------------
echo [4/5] 正在安裝核心依賴 (NPM Install)...
call npm install
if %errorlevel% neq 0 (
    echo ❌ NPM 安裝失敗。請檢查網路連線。
    pause
    exit /b
)
echo.

:: ------------------------------------------------------------
:: 4. 選擇記憶引擎
:: ------------------------------------------------------------
echo [5/5] 請選擇 Golem 的記憶引擎模式：
echo ==========================================================
echo [1] 🌐 瀏覽器模式 (預設) - 適合新手，無須設定。
echo [2] 🚀 系統模式 (qmd)   - 高效能，需安裝 Bun/qmd。
echo ==========================================================
echo.

set /p mode="👉 請輸入選項 [1 或 2] (預設 1): "

if "%mode%"=="2" (
    goto setup_qmd
) else (
    goto setup_browser
)

:setup_browser
echo.
echo ⚙️ 配置為：瀏覽器模式...
powershell -Command "(Get-Content .env) -replace 'GOLEM_MEMORY_MODE=.*', 'GOLEM_MEMORY_MODE=browser' | Set-Content .env"
goto finish

:setup_qmd
echo.
echo ⚙️ 配置為：系統模式 (qmd)...
where bun >nul 2>&1
if %errorlevel% neq 0 (
    echo 📦 正在自動安裝 Bun...
    powershell -Command "irm bun.sh/install.ps1 | iex"
    set "PATH=%USERPROFILE%\.bun\bin;%PATH%"
)
echo 📦 正在安裝 qmd...
call bun install -g https://github.com/tobi/qmd
powershell -Command "(Get-Content .env) -replace 'GOLEM_MEMORY_MODE=.*', 'GOLEM_MEMORY_MODE=qmd' | Set-Content .env"
goto finish

:finish
echo.
echo ==========================================================
echo 🎉 安裝完成！
echo 🚀 請輸入 npm start 啟動 Golem。
echo ==========================================================
pause
