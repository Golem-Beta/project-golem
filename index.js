/**
 * 🦞 Project Golem (魔像計畫) - Core Logic
 * * 這是一個 Vibe Coding 實驗專案。
 * 它結合了 Puppeteer (手腳)、Ollama (小腦) 與 Telegram (介面)，
 * 讓你透過通訊軟體指揮網頁版 Gemini 幫你寫程式。
 */

require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { default: ollama } = require('ollama');

// 1. 穿上隱形斗篷 (避開 Google 機器人偵測)
puppeteer.use(StealthPlugin());

// --- 設定檢查 ---
const token = process.env.TELEGRAM_TOKEN;
if (!token || token === '你的_TELEGRAM_BOT_TOKEN_貼在這裡') {
  console.error('❌ 啟動失敗: 請在 .env 檔案中填入正確的 Telegram Token！');
  process.exit(1);
}

// --- 初始化 ---
const bot = new TelegramBot(token, { polling: true });
let browser;
let page;
let isAwake = false; // 狀態標記：魔像醒了嗎？

// --- 🧱 功能一：喚醒魔像 (啟動瀏覽器) ---
async function wakeUp() {
  if (isAwake) return;
  console.log('🧱 Golem 正在甦醒 (開啟瀏覽器)...');
  
  try {
    browser = await puppeteer.launch({
      headless: false, // 設為 false 讓你看得到視窗 (方便除錯與首次登入)
      userDataDir: process.env.USER_DATA_DIR || './golem_memory', // 記憶路徑
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,800']
    });

    page = await browser.newPage();
    
    // 偽裝成真人使用者 Agent
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    console.log('🌊 正在連線至 Gemini...');
    await page.goto('https://gemini.google.com/app', { waitUntil: 'networkidle2' });
    
    isAwake = true;
    console.log('✅ Golem 準備就緒！等待指令...');
    
  } catch (error) {
    console.error('❌ 喚醒失敗:', error);
    isAwake = false;
  }
}

// --- 🖐️ 功能二：操作 Gemini 網頁 (手腳) ---
async function talkToGemini(userMessage) {
  // 如果瀏覽器沒開，先叫醒它
  if (!page || !isAwake) await wakeUp();

  try {
    // A. 尋找輸入框 (Gemini 的輸入框通常是 contenteditable 的 div)
    // 我們列出幾種可能的選擇器以防改版
    const inputSelectors = [
      'div[contenteditable="true"]', 
      'rich-textarea', 
      'div[role="textbox"]'
    ];
    
    let inputSelector = null;
    // 嘗試找到正確的輸入框
    for (const sel of inputSelectors) {
      const el = await page.$(sel);
      if (el) {
        inputSelector = sel;
        break;
      }
    }

    if (!inputSelector) {
      throw new Error("找不到 Gemini 的輸入框，可能需要手動登入或 Google 改版了。");
    }

    // B. 輸入訊息
    await page.click(inputSelector);
    // 清空框框並輸入 (模擬打字比較像真人)
    await page.evaluate(sel => document.querySelector(sel).innerText = '', inputSelector);
    await page.type(inputSelector, userMessage, { delay: 10 }); 
    await page.keyboard.press('Enter');

    console.log('⏳ 訊息已發送，等待 Gemini 回應...');

    // C. 等待回應
    // 策略：先等 2 秒，然後檢查有沒有 "正在生成" 的圖示消失
    await page.waitForTimeout(2000); 

    // 等待 loading 圖示消失 (最多等 60 秒)
    await page.waitForFunction(() => {
        const loaders = document.querySelectorAll('.streaming-icon, mat-progress-bar, [aria-label="Stop generating"]'); 
        return loaders.length === 0;
    }, { timeout: 60000 }).catch(() => console.log('⚠️ 等待逾時，嘗試直接抓取內容...'));

    // D. 抓取回應 (抓最後一個對話泡泡)
    const responseText = await page.evaluate(() => {
        const bubbles = document.querySelectorAll('message-content'); // Gemini 的訊息區塊
        if (bubbles.length === 0) return null;
        return bubbles[bubbles.length - 1].innerText; // 抓最新的
    });

    if (!responseText) return "❌ 錯誤：網頁上抓不到回應。請確認瀏覽器是否已登入。";
    return responseText;

  } catch (error) {
    console.error('❌ 操作失敗:', error);
    return `Golem 跌倒了：${error.message}\n(提示：如果是第一次執行，請看電腦螢幕確認是否需要登入)`;
  }
}

// --- 🧠 功能三：Ollama 翻譯官 (小腦) ---
async function summarizeWithOllama(text) {
  // 檢查本地是否有 Ollama，沒有就直接回傳原、文
  try {
    // 簡單的健康檢查
    await ollama.list(); 
  } catch (e) {
    console.log('⚠️ 未偵測到 Ollama，跳過摘要功能。');
    return text;
  }

  console.log('🤔 內容太長，請 Ollama 小腦幫忙整理...');
  
  try {
    const response = await ollama.chat({
      model: 'llama3.2:3b', // 確保你有下載這個模型: ollama pull llama3.2:3b
      messages: [{
        role: 'user',
        content: `
          Please summarize the following AI response for a Telegram message.
          - If it contains code, just say "Code generated for [functionality]" and list the file names.
          - Keep it conversational and short (under 200 words).
          - Use Traditional Chinese (繁體中文).
          
          AI Response:
          """
          ${text.substring(0, 2000)} 
          """
        `
      }]
    });
    return response.message.content;
  } catch (e) {
    console.error('Ollama 思考失敗:', e);
    return text.substring(0, 300) + '...\n(Ollama 摘要失敗，顯示部分原文)';
  }
}

// --- 🤖 Telegram 監聽 (耳朵) ---
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (!text) return;

  console.log(`📩 收到指令 (${msg.from.first_name}): ${text}`);
  
  // 1. 回報收到
  const statusMsg = await bot.sendMessage(chatId, '🧱 Golem 收到，正在傳送給大腦...');

  // 2. 喚醒機制
  if (!isAwake) {
    await wakeUp();
  }

  // 3. 執行任務
  const geminiResponse = await talkToGemini(text);

  // 4. 判斷是否需要摘要
  let finalResponse = geminiResponse;
  
  // 如果字數超過 800 字，且 Ollama 有在跑，就進行摘要
  if (geminiResponse.length > 800) {
      bot.editMessageText('🤔 內容豐富，正在為您畫重點...', { chat_id: chatId, message_id: statusMsg.message_id });
      const summary = await summarizeWithOllama(geminiResponse);
      finalResponse = `🧠 **Gemini 重點摘要:**\n${summary}\n\n(完整內容請至電腦瀏覽器查看)`;
  }

  // 5. 回傳結果 (使用 Markdown 格式)
  try {
    await bot.sendMessage(chatId, finalResponse, { parse_mode: 'Markdown' });
  } catch (e) {
    // 如果 Markdown 解析失敗 (常見問題)，就改用純文字傳送
    await bot.sendMessage(chatId, finalResponse);
  }
});

console.log('📡 Golem 伺服器已啟動！請在 Telegram 對機器人說話...');


