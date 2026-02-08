@echo off
setlocal
:: 1. 鎖定工作目錄 (這是關鍵！不管怎麼執行都會抓對位置)
cd /d "%~dp0"
chcp 65001 >nul

title Golem v8.5 安裝精靈
echo ==========================================================
echo  Project Golem v8.5 - 安裝精靈 (修復版)
echo ==========================================================
echo.
echo [DEBUG] 目前工作路徑: %cd%
echo.

:: 2. 檔案檢查 (改用最簡單的直接跳轉邏輯)
echo [1/6] 檢查核心檔案...

if not exist index.js goto :FileError
if not exist package.json goto :FileError
if not exist skills.js goto :FileError

echo [OK] 核心檔案都在！準備繼續...
echo.

:: 3. 檢查 Node.js
echo [2/6] 檢查 Node.js...
node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] 找不到 Node.js，正在啟動自動安裝...
    winget install -e --id OpenJS.NodeJS.LTS --silent --accept-source-agreements --accept-package-agreements
    echo.
    echo [!] 安裝指令已送出，如果失敗請手動下載 Node.js。
    echo [!] 請重啟此視窗以生效。
    pause
    exit
)
echo [OK] Node.js 已安裝。
echo.

:: 4. 安裝依賴
echo [3/6] 安裝 NPM 套件...
call npm install
echo [OK] 依賴安裝完成。
echo.

:: 5. 設定環境
echo [4/6] 建立設定檔...
if not exist .env (
    if exist .env.example (
        copy .env.example .env >nul
        echo [OK] .env 建立成功。
    )
)

:: 6. 修改記憶模式
echo [5/6] 設定瀏覽器模式...
if exist .env (
    powershell -Command "(Get-Content .env) -replace 'GOLEM_MEMORY_MODE=.*', 'GOLEM_MEMORY_MODE=browser' | Set-Content .env"
)

echo.
echo ==========================================================
echo [OK] 全部完成！請輸入 npm start 啟動。
echo ==========================================================
pause
exit /b

:FileError
echo.
echo [ERROR] 嚴重錯誤：找不到核心檔案！
echo.
echo 請確認以下檔案是否在同一個資料夾內：
echo  - index.js
echo  - package.json
echo  - skills.js
echo.
echo 目前位置: %cd%
pause
