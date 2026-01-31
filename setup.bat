@echo off
chcp 65001 >nul
setlocal
title 🦞 Project Golem v6.3 - Deployment Protocol
color 0A

:: ============================================================
:: 歡迎畫面
:: ============================================================
echo.
echo  =============================================================
echo   🦞 Project Golem v6.3 (Ouroboros Edition)
echo   -----------------------------------------------------------
echo   自動化部署與環境初始化腳本
echo  =============================================================
echo.
echo  [1/4] 正在檢查系統環境...

:: 1. 檢查 Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    color 0C
    echo  [X] 錯誤: 未偵測到 Node.js！
    echo      請前往 https://nodejs.org/ 下載並安裝 (v16+)。
    pause
    exit
) else (
    echo  [v] Node.js 已安裝。
)

:: 2. 檢查 Ollama
where ollama >nul 2>nul
if %errorlevel% neq 0 (
    color 0E
    echo  [!] 警告: 未偵測到 Ollama 指令。
    echo      請確保您已安裝 Ollama (https://ollama.com) 並已啟動服務。
    echo      (您可以繼續安裝，但後續需手動設定模型)
    pause
) else (
    echo  [v] Ollama 已安裝。
)

echo.
echo  [2/4] 正在安裝核心依賴 (這可能需要幾分鐘)...
echo  -----------------------------------------------------------
call npm install
if %errorlevel% neq 0 (
    color 0C
    echo  [X] npm install 失敗，請檢查網路連線。
    pause
    exit
)

echo.
echo  正在下載 Chrome 瀏覽器核心 (Puppeteer)...
node node_modules/puppeteer/install.js

echo.
echo  [3/4] 正在初始化 AI 模型 (Llama3)...
where ollama >nul 2>nul
if %errorlevel% equ 0 (
    echo  正在拉取 llama3 模型...
    ollama pull llama3
)

:: ============================================================
:: 互動式設定 (.env 生成)
:: ============================================================
cls
echo.
echo  =============================================================
echo   🔑 身份驗證設定 (Security Clearance)
echo  =============================================================
echo.
echo  請輸入您的 Telegram Bot 資訊以建立安全連線。
echo.

:ASK_TOKEN
set /p TG_TOKEN="👉 請輸入 Bot Token (來自 @BotFather): "
if "%TG_TOKEN%"=="" goto ASK_TOKEN

echo.
:ASK_ID
set /p ADMIN_ID="👉 請輸入您的 Admin ID (來自 @userinfobot): "
if "%ADMIN_ID%"=="" goto ASK_ID

echo.
echo  [4/4] 正在生成 .env 設定檔...

(
echo TELEGRAM_TOKEN=%TG_TOKEN%
echo ADMIN_ID=%ADMIN_ID%
echo USER_DATA_DIR=./golem_memory
echo OLLAMA_MODEL=llama3
) > .env

echo.
echo  =============================================================
echo   ✅ 部署完成！(Mission Accomplished)
echo  =============================================================
echo.
echo   輸入 "npm start" 或 "node index.js" 即可啟動 Golem。
echo.
pause
