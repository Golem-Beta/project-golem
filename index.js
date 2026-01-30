/**
 * 🦞 Project Golem v2.0 (魔像計畫 - 強化版)
 * * Update Logs:
 * - 加入 Message Queue (訊息排隊機制) 防止多工衝突
 * - 新增 /new 指令：開啟新話題
 * - 優化輸入邏輯：模擬鍵盤全選刪除
 * - 增加 Telegram 打字狀態提示
 * - 強化錯誤恢復能力
 */

require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { default: ollama } = require('ollama');
const os = require('os'); // 用來判斷作業系統 (Mac/Win)

// 1. 穿上隱形斗篷
puppeteer.use(StealthPlugin());

// --- 設定檢查 ---
const token = process.env.TELEGRAM_TOKEN;
if (!token) {
  console.error('❌ 錯誤: 請在 .env 設定 TELEGRAM_TOKEN');
  process.exit(1);
}

// --- 初始化 ---
const bot = new TelegramBot(token, { polling: true });
let browser;
let page;
let isAwake = false;

// 🔒 訊息隊列鎖 (關鍵：讓訊息乖乖排隊，不會同時插嘴)
let messageQueue = Promise.resolve();

// --- 🧱 核心：喚醒魔像 ---
async function wakeUp() {
  if (isAwake && page && !page.isClosed()) return;
  
  console.log('🧱 Golem 正在甦醒...');
  try {
    browser = await puppeteer.launch({
      headless: false, 
      userDataDir: process.env.USER_DATA_DIR || './golem_memory',
      // 視窗設大一點，避免RWD切換導致元素找不到
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1920,1080']
    });

    page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 }); // 固定視窗大小
    
    // 偽裝 User Agent
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    console.log('🌊 連線至 Gemini...');
    await page.goto('https://gemini.google.com/app', { waitUntil: 'networkidle2' });
    
    isAwake = true;
    console.log('✅ Golem 就緒！');
  } catch (error) {
    console.error('❌ 喚醒失敗:', error);
    isAwake = false;
  }
}

// --- 🔄 功能：開啟新對話 ---
async function resetChat() {
  if (!page) return;
  console.log('🔄 正在重置對話...');
  try {
    // 直接重新載入頁面最快最穩，Gemini 會自動開新對話
    await page.goto('https://gemini.google.com/app', { waitUntil: 'networkidle2' });
    return "已開啟新話題 ✨";
  } catch (e) {
    return "重置失敗，請稍後再試。";
  }
}

// --- 🖐️ 功能：操作 Gemini ---
async function talkToGemini(userMessage) {
  await wakeUp();

  try {
    // 1. 尋找輸入框 (加入重試機制)
    const inputSelector = 'div[contenteditable="true"], rich-textarea, div[role="textbox"]';
    try {
        await page.waitForSelector(inputSelector, { timeout: 5000 });
    } catch (e) {
        throw new Error("找不到輸入框，請檢查瀏覽器是否需要登入，或 Google 改版了。");
    }

    // 2. 聚焦並清空 (模擬真人按鍵)
    await page.click(inputSelector);
    
    // 判斷系統決定按 Command 還是 Control
    const modifierKey = os.platform() === 'darwin' ? 'Meta' : 'Control';
    await page.keyboard.down(modifierKey);
    await page.keyboard.press('A'); // 全選
    await page.keyboard.up(modifierKey);
    await page.keyboard.press('Backspace'); // 刪除

    // 3. 輸入文字
    await page.type(inputSelector, userMessage, { delay: 5 }); // 打字速度稍微快一點
    await page.keyboard.press('Enter');

    console.log('⏳ 等待回應中...');

    // 4. 等待回應完成
    // 策略：等待 "Stop generating" 按鈕出現然後消失
    try {
        // 先稍微等一下讓請求送出
        await new Promise(r => setTimeout(r, 2000));
        
        // 等待 loading 結束 (檢查 HTML 變化)
        await page.waitForFunction(() => {
            const streaming = document.querySelectorAll('.streaming-icon, [aria-label="Stop generating"]');
            return streaming.length === 0;
        }, { timeout: 90000 }); // 最多等 90 秒
    } catch (e) {
        console.log('⚠️ 等待逾時，嘗試直接抓取...');
    }

    // 5. 抓取最新回應
    const responseText = await page.evaluate(() => {
        const bubbles = document.querySelectorAll('message-content, .model-response-text');
        if (bubbles.length === 0) return null;
        // 取最後一個
        return bubbles[bubbles.length - 1].innerText;
    });

    if (!responseText) throw new Error("抓不到回應內容");
    return responseText;

  } catch (error) {
    console.error('❌ 操作錯誤:', error);
    return `[系統錯誤] ${error.message}`;
  }
}

// --- 🧠 功能：Ollama 摘要 ---
async function summarizeWithOllama(text) {
  try {
    // 快速檢查 Ollama 是否活著
    await ollama.list(); 
    
    console.log('🤔 呼叫 Ollama 進行摘要...');
    const response = await ollama.chat({
      model: 'llama3.2:3b', // 請確認你有這個模型
      messages: [{
        role: 'user',
        content: `
          你是我的私人助理。請用繁體中文摘要以下這段 AI 的回應。
          直接講重點，語氣輕鬆自然。如果是程式碼，請說明它寫了什麼功能。
          
          內容：
          """
          ${text.substring(0, 3000)}
          """
        `
      }]
    });
    return response.message.content;
  } catch (e) {
    console.log('⚠️ Ollama 未啟動或錯誤，跳過摘要。');
    return null;
  }
}

// --- 🤖 Telegram 邏輯核心 ---
bot.on('message', (msg) => {
    // 將所有進來的訊息放入 Queue，確保一次只處理一個
    messageQueue = messageQueue.then(() => handleMessage(msg)).catch(err => {
        console.error('Queue Error:', err);
    });
});

async function handleMessage(msg) {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (!text) return;
  
  console.log(`📩 收到 (${msg.from.first_name}): ${text}`);

  // 指令處理
  if (text === '/start') {
    return bot.sendMessage(chatId, '👋 嗨！我是 Project Golem。\n直接輸入文字即可對話。\n輸入 /new 開啟新話題。');
  }
  
  if (text === '/new') {
    const status = await resetChat();
    return bot.sendMessage(chatId, status);
  }

  // 顯示 "typing..." 狀態
  bot.sendChatAction(chatId, 'typing');

  // 開始處理
  const startMsg = await bot.sendMessage(chatId, '🧱 Golem 正在思考...');
  
  // 呼叫 Gemini
  const geminiResponse = await talkToGemini(text);
  
  let finalResponse = geminiResponse;
  
  // 判斷是否需要摘要 (超過 1000 字)
  if (geminiResponse.length > 1000) {
      bot.editMessageText('🤔 內容太長，正在請 Ollama 幫忙畫重點...', { chat_id: chatId, message_id: startMsg.message_id });
      const summary = await summarizeWithOllama(geminiResponse);
      if (summary) {
          finalResponse = `🧠 **Gemini 重點摘要:**\n${summary}\n\n📝 (完整內容請至電腦查看)`;
      }
  }

  // 嘗試發送 Markdown，失敗則降級為純文字
  try {
      await bot.sendMessage(chatId, finalResponse, { parse_mode: 'Markdown' });
  } catch (e) {
      console.log('⚠️ Markdown 解析失敗，改用純文字傳送。');
      await bot.sendMessage(chatId, finalResponse); // 純文字 fallback
  }
  
  // 刪除原本的 "思考中" 訊息，保持版面乾淨
  bot.deleteMessage(chatId, startMsg.message_id).catch(() => {});
}

console.log('📡 Golem v2.0 伺服器已啟動！(支援 Queue 與 /new 指令)');
