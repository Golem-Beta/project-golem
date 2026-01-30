# project-golem
Headless browser agent powered by Gemini &amp; Ollama.
# 🦞 Project Golem (魔像計畫)

> **"Machine Body, God Mind."**
> 一個基於 Puppeteer (手腳) 與 Ollama (視覺) 的雙腦協作 AI 代理人。

這是一個 **Vibe Coding** 實驗專案。它不依賴昂貴的 API，而是透過自動化瀏覽器直接操作 Gemini 網頁版，並透過 Telegram 介面讓你隨時隨地指揮家裡的電腦。

## ✨ 特色

- **🧠 雙腦架構:** 本地 Ollama 負責看網頁，雲端 Gemini 負責寫程式。
- **💸 完全免費:** 直接使用網頁版 AI 的強大能力。
- **📱 遠端指揮:** 整合 Telegram Bot，躺在床上也能寫 Code。

## 🛠️ 如何喚醒魔像

### 1. 安裝
```bash
# 下載專案
git clone [https://github.com/你的GitHub帳號/project-golem.git](https://github.com/你的GitHub帳號/project-golem.git)
cd project-golem

# 安裝零件
npm install

2. 設定
複製 .env.example 為 .env，並填入你的 Telegram Bot Token。

3. 啟動
node index.js
首次啟動時會跳出 Chrome，請手動登入 Google 帳號一次。之後魔像就會自動記憶了！

Created with ❤️ by Arvin_Chen


