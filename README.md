# project-golem
Headless browser agent powered by Gemini &amp; Ollama.

# 🦞 Project Golem v6.0 (Fortress Edition) 魔像計畫

![GitHub license](https://img.shields.io/github/license/Arvincreator/project-golem)
![GitHub repo size](https://img.shields.io/github/repo-size/Arvincreator/project-golem)
![Node.js](https://img.shields.io/badge/node-%3E%3D16.0-green.svg)
![Status](https://img.shields.io/badge/status-active-brightgreen.svg)

> **"Two Brains, One Body, Absolute Control."**

**Project Golem** 是一個基於 **雙腦架構 (Dual-Brain Architecture)** 的本機自動化 Agent。它利用 **Google Gemini** 的強大認知能力作為「大腦」，配合 **Ollama (Local LLM)** 作為「小腦」進行精準的指令拆解，並透過 **Telegram** 介面安全地控制您的電腦。

v6.0 版本引入了 **Fortress Security Protocol**，具備指令風險分級與審核機制，確保 AI 在強大的同時絕對安全。

---

## 🌟 核心特性 (Key Features)

### 🧠 雙腦協作 (Dual-Brain System)
- **大腦 (Gemini Web)**：負責自然語言理解、複雜邏輯推演與情緒化對話。
- **小腦 (Ollama/Llama3)**：負責將大腦的意圖「翻譯」為標準化的 Shell 指令 JSON，去除雜訊。

### 🛡️ 堡壘級安全 (Fortress Security)
- **風險分級控制 (RBAC)**：
    - 🟢 **Safe**：讀取類指令 (`ls`, `cat`) -> 自動執行。
    - 🟡 **Warning**：變更類指令 (`npm install`) -> 需按鈕批准。
    - 🔴 **Danger**：高風險指令 (`rm`, `mv`) -> 紅色警告 + 強制確認。
    - ☠️ **Blocked**：毀滅性指令 (`rm -rf /`) -> 直接攔截。
- **斷點續傳**：遇到審核時自動暫停任務，批准後無縫接續執行。

### 🎭 協議分割 (Split-Protocol)
- **雙重人格回應**：同時輸出「給使用者的暖心回覆」與「給系統的冷酷指令」。
- **即時反饋**：Node.js 優先處理對話，讓使用者感覺零延遲，隨後背景執行任務。

### 👻 隱身模式 (Stealth Mode)
- 內建 `puppeteer-extra-plugin-stealth`，完美偽裝成真人瀏覽器，防止 Google 偵測與封鎖。

---

## 🏗️ 系統架構 (Architecture)

```ascii
[👑 使用者 (Telegram)]
       ↕️
[🤖 Node.js 控制器] ─────────────┐
       │ (1. 對話文本)            │
       ▼                        │
[🧠 Gemini Web (大腦)]            │
       │ "好，我幫你檢查 log..."   │
       │ ---分隔線---             │
       │ "1. cat /var/log/syslog" │
       │                        │
       ▼ (2. 技術計畫)            │
[🦎 Ollama (小腦/翻譯)]            │ (4. 情緒回覆)
       │                        │
       ▼ (3. JSON 步驟)           │
[🛡️ Security Manager] ◀─────────┘
       │ (審核 Pass/Approve)
       ▼
[⚡ Executor (手腳)] ──> [💻 本機 Shell]

```

---

## 🚀 快速開始 (Getting Started)

### 1. 環境準備

* **Node.js** (v16+)
* **Ollama** (需安裝並啟動)
* **Google 帳號** (用於 Gemini)
* **Telegram Bot Token**

### 2. 安裝依賴

```bash
git clone [https://github.com/Arvincreator/project-golem.git](https://github.com/Arvincreator/project-golem.git)
cd project-golem
npm install

```

### 3. 設定 Ollama

確保本機 Ollama 服務已啟動，並已下載 `llama3` 模型（或 mistral）：

```bash
ollama serve
ollama pull llama3

```

### 4. 設定環境變數

複製 `.env.example` 並重新命名為 `.env`：

```env
TELEGRAM_TOKEN=你的_Telegram_Bot_Token
# 你的 Telegram ID (用於權限驗證，可向 @userinfobot 查詢)
ADMIN_ID=123456789 
# 指定瀏覽器資料存檔位置 (用於保持登入)
USER_DATA_DIR=./golem_memory

```

### 5. 啟動 Golem

```bash
node index.js

```

> **⚠️ 首次執行注意**：預設會開啟 Chrome 視窗 (`headless: false`)。請手動登入您的 Google 帳號。登入後，未來的 session 會自動儲存在 `USER_DATA_DIR` 中。

---

## 📂 專案結構

```
project-golem/
├── index.js          # 核心主程式 (Monolith)
├── golem_memory/     # Chrome User Data (已在 .gitignore 中排除)
├── .env              # 設定檔 (已在 .gitignore 中排除)
└── README.md         # 說明文件

```

---

## ⚠️ 免責聲明 (Disclaimer)

本專案賦予 AI **直接執行 Shell 指令** 的權限。雖然 v6.0 包含了嚴格的安全審計機制，但開發者不對因使用本軟體而導致的任何資料遺失、系統損壞或安全漏洞負責。

**請勿將 USER_DATA_DIR 或 .env 上傳至公開倉庫。**


Created with ❤️ by **Arvin_Chen** 

```

```
