/**
 * 🦞 Project Golem v3.0 (The Architect)
 * ---------------------------------------------------
 * 核心功能：
 * 1. [Browser Core] 基於 Puppeteer 的 Gemini 網頁版自動化 (v2.5 穩定版)
 * 2. [Safety Valve] 危險指令需透過 Telegram 按鈕進行人機驗證 (HITL)
 * 3. [Agent Protocol] 透過 JSON 協議讓 Gemini 請求執行系統指令
 * 4. [Auto-Healing] 瀏覽器崩潰自動重啟與錯誤截圖
 */

require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { default: ollama } = require('ollama');
const fs = require('fs');
const { exec } = require('child_process');
const path = require('path');

// 1. 穿上隱形斗篷 (避開 Google 機器人檢測)
puppeteer.use(StealthPlugin());

// --- ⚙️ 全域設定 ---
const CONFIG = {
    TOKEN: process.env.TELEGRAM_TOKEN,
    USER_DATA_DIR: process.env.USER_DATA_DIR || './golem_memory',
    TIMEOUT: 120000, // 2分鐘等待超時
    DEBUG_DIR: './debug_screenshots',
    // 安全白名單指令 (不需要審核即可執行)
    SAFE_COMMANDS: ['ls', 'date', 'echo', 'whoami', 'pwd', 'cat', 'dir', 'time']
};

// --- 🛡️ Agent 系統提示詞 (核心靈魂) ---
const SYSTEM_PROMPT = `
【指令模式啟動】
你現在是 Golem 系統管理員。你的權限受到嚴格控管。
當使用者要求你執行電腦操作、寫程式或安裝工具時，你**絕對不能**直接給代碼，必須輸出以下 JSON 區塊來請求權限：

1. 查詢/讀取類 (低風險)：
\`\`\`json
{"type": "command", "cmd": "ls -la", "risk": "low", "reason": "列出檔案以確認路徑"}
\`\`\`

2. 修改/刪除/安裝/執行 (高風險)：
\`\`\`json
{"type": "command", "cmd": "npm install express", "risk": "high", "reason": "安裝必要的依賴套件"}
\`\`\`

3. 發現缺少工具 (請求安裝)：
\`\`\`json
{"type": "request_tool", "tool": "ffmpeg", "reason": "我需要它來轉檔影片"}
\`\`\`

4. 純粹對話 (無需操作)：
直接回答文字即可，不需要 JSON。

請注意：只輸出 JSON 區塊，不要有多餘的解釋。確保 JSON 格式正確。
`;

// --- 檢查環境 ---
if (!CONFIG.TOKEN) {
    console.error('❌ 錯誤: 請在 .env 設定 TELEGRAM_TOKEN');
    process.exit(1);
}
if (!fs.existsSync(CONFIG.DEBUG_DIR)) fs.mkdirSync(CONFIG.DEBUG_DIR);

// ============================================================
// 🧱 核心類別：GolemBrowser (瀏覽器管家)
// ============================================================
class GolemBrowser {
    constructor() {
        this.browser = null;
        this.page = null;
        this.isInitializing = false;
    }

    // 初始化瀏覽器
    async init() {
        if (this.browser && this.page && !this.page.isClosed()) return;
        if (this.isInitializing) return;

        this.isInitializing = true;
        console.log('🧱 Golem 正在甦醒 (啟動瀏覽器)...');

        try {
            this.browser = await puppeteer.launch({
                headless: false, // 建議 false 以降低被封鎖機率，且方便觀察
                userDataDir: CONFIG.USER_DATA_DIR,
                defaultViewport: null,
                args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,900']
            });

            const pages = await this.browser.pages();
            this.page = pages.length > 0 ? pages[0] : await this.browser.newPage();
            
            // 偽裝 User Agent
            await this.page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

            console.log('🌊 連線至 Gemini...');
            await this.page.goto('https://gemini.google.com/app', { waitUntil: 'networkidle2' });
            
            console.log('✅ Golem 就緒！');
        } catch (error) {
            console.error('❌ 喚醒失敗:', error);
            await this.cleanup();
        } finally {
            this.isInitializing = false;
        }
    }

    async cleanup() {
        if (this.browser) await this.browser.close().catch(() => {});
        this.browser = null;
        this.page = null;
    }

    // 重置對話並注入 Agent 提示詞
    async resetChat() {
        await this.init();
        try {
            console.log('🔄 重置對話...');
            await this.page.goto('https://gemini.google.com/app', { waitUntil: 'networkidle2' });
            
            // 等待頁面載入後，先發送系統提示詞 (Silent Injection)
            console.log('💉 注入 Agent 系統提示詞...');
            await this.sendMessage(SYSTEM_PROMPT, true); // true 代表這是系統指令，不需回傳給 User
            
            return "已開啟新話題，Agent 模式已就緒 ✨";
        } catch (e) {
            console.error(e);
            return "重置失敗，請稍後再試。";
        }
    }

    // 發送訊息給 Gemini
    async sendMessage(text, isSystem = false) {
        await this.init();
        const page = this.page;

        try {
            // 1. 尋找輸入框 (多重選擇器容錯)
            const selectors = [
                'div[contenteditable="true"]',
                'rich-textarea > div',
                'div[role="textbox"]'
            ];
            await page.waitForSelector(selectors.join(','), { timeout: 10000 });

            // 2. 高速清空與輸入 (DOM 操作)
            await page.evaluate((sel, msg) => {
                const el = document.querySelector(sel);
                if (el) {
                    el.focus();
                    el.innerHTML = ''; // 清空
                    // 模擬輸入事件
                    document.execCommand('insertText', false, msg);
                }
            }, selectors[0], text);

            await new Promise(r => setTimeout(r, 500)); // 稍等一下
            await page.keyboard.press('Enter');

            // 3. 等待回應
            if (isSystem) {
                // 如果是系統提示詞，我們不需要等待很精確的回應，只要不報錯即可
                await new Promise(r => setTimeout(r, 3000));
                return "System Prompt Injected";
            }

            console.log('⏳ 等待 Gemini 回應...');
            // 監聽停止按鈕或載入動畫消失
            await page.waitForFunction(() => {
                const stopBtn = document.querySelector('[aria-label="Stop generating"], [aria-label="停止產生"]');
                const thinking = document.querySelector('.streaming-icon');
                return !stopBtn && !thinking;
            }, { timeout: CONFIG.TIMEOUT, polling: 500 });

            // 4. 抓取最後一條回應
            const responseText = await page.evaluate(() => {
                const bubbles = document.querySelectorAll('message-content, .model-response-text');
                if (bubbles.length === 0) return null;
                const lastBubble = bubbles[bubbles.length - 1];
                return lastBubble.innerText || lastBubble.textContent;
            });

            if (!responseText) throw new Error("抓不到回應內容");
            return responseText;

        } catch (error) {
            console.error('❌ 操作錯誤:', error);
            const filename = `${CONFIG.DEBUG_DIR}/error_${Date.now()}.png`;
            await page.screenshot({ path: filename });
            console.log(`📸 已儲存錯誤截圖: ${filename}`);
            throw error;
        }
    }
}

// ============================================================
// 🤖 Telegram Bot & 邏輯控制
// ============================================================
const bot = new TelegramBot(CONFIG.TOKEN, { polling: true });
const golem = new GolemBrowser();
let messageQueue = Promise.resolve(); // 訊息排隊鎖

// --- 輔助：切分長訊息 ---
function splitMessage(text, maxLength = 4000) {
    const chunks = [];
    for (let i = 0; i < text.length; i += maxLength) {
        chunks.push(text.substring(i, i + maxLength));
    }
    return chunks;
}

// --- 輔助：Ollama 摘要 ---
async function summarizeWithOllama(text) {
    try {
        await ollama.list(); 
        const response = await ollama.chat({
            model: 'llama3.2:3b',
            messages: [{
                role: 'user',
                content: `請用繁體中文摘要以下內容，直接講重點：\n\n${text.substring(0, 2000)}`
            }]
        });
        return response.message.content;
    } catch (e) {
        return null;
    }
}

// --- 🛡️ 安全核心：解析並處理 Gemini 的意圖 ---
async function handleGeminiIntent(chatId, responseText) {
    // 嘗試解析 JSON (尋找 ```json ... ```)
    const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/);
    
    // 情境 A: 普通對話 (沒有 JSON)
    if (!jsonMatch) {
        return handleNormalResponse(chatId, responseText);
    }

    // 情境 B: 解析意圖
    let action;
    try {
        action = JSON.parse(jsonMatch[1]);
    } catch (e) {
        return bot.sendMessage(chatId, `⚠️ Gemini 輸出了無效的 JSON，請重試。\n\`${e.message}\``, { parse_mode: 'Markdown' });
    }

    console.log('🤖 偵測到 Agent 意圖:', action);

    // B1. 請求安裝工具
    if (action.type === 'request_tool') {
        const opts = {
            reply_markup: {
                inline_keyboard: [[
                    { text: `✅ 允許安裝 (${action.tool})`, callback_data: `INSTALL:${action.tool}` },
                    { text: '❌ 駁回', callback_data: 'DENY' }
                ]]
            }
        };
        return bot.sendMessage(chatId, `🛠️ **工具請求**\nGemini 想要安裝：\`${action.tool}\`\n理由：${action.reason}\n\n請問是否批准？`, { parse_mode: 'Markdown', ...opts });
    }

    // B2. 執行系統指令
    if (action.type === 'command') {
        const commandBase = action.cmd.trim().split(' ')[0];
        
        // 低風險白名單 -> 自動放行
        if (action.risk === 'low' && CONFIG.SAFE_COMMANDS.includes(commandBase)) {
            await bot.sendMessage(chatId, `🟢 自動執行低風險指令：\`${action.cmd}\``, { parse_mode: 'Markdown' });
            await executeSystemCommand(chatId, action.cmd);
        } 
        // 高風險/未知 -> 人工審核
        else {
            // 對指令做 Base64 編碼，避免按鈕 callback_data 出錯
            const encodedCmd = Buffer.from(action.cmd).toString('base64');
            const opts = {
                reply_markup: {
                    inline_keyboard: [[
                        { text: '🔥 執行 (後果自負)', callback_data: `EXEC:${encodedCmd}` },
                        { text: '🛡️ 攔截', callback_data: 'DENY' }
                    ]]
                }
            };
            return bot.sendMessage(chatId, `⚠️ **高風險指令警告**\nGemini 想要執行：\`${action.cmd}\`\n風險等級：${action.risk}\n理由：${action.reason}\n\n這可能會修改系統，確定嗎？`, { parse_mode: 'Markdown', ...opts });
        }
    }
}

// --- 處理普通文字回應 ---
async function handleNormalResponse(chatId, text) {
    if (text.length > 4000) {
        bot.sendMessage(chatId, '📜 內容較長，生成摘要中...', { disable_notification: true });
        const summary = await summarizeWithOllama(text);
        if (summary) await bot.sendMessage(chatId, `🧠 **重點摘要:**\n${summary}`, { parse_mode: 'Markdown' });

        const chunks = splitMessage(text);
        for (const chunk of chunks) await bot.sendMessage(chatId, chunk);
    } else {
        try {
            await bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
        } catch (e) {
            await bot.sendMessage(chatId, text); // Markdown 失敗降級
        }
    }
}

// --- 💻 執行系統指令 (Child Process) ---
async function executeSystemCommand(chatId, cmd) {
    // 最後一道安全防線
    if (cmd.includes('rm -rf /') || cmd.includes(':(){ :|:& };:')) {
        return bot.sendMessage(chatId, '⛔ 系統偵測到毀滅性指令，已強制攔截。');
    }

    bot.sendChatAction(chatId, 'typing');
    exec(cmd, { cwd: './' }, (error, stdout, stderr) => {
        let response = `💻 **執行結果:**\n\`${cmd}\`\n\n`;
        if (error) {
            response += `❌ 失敗:\n\`${stderr || error.message}\``;
        } else {
            // 截斷輸出以免洗版
            const output = stdout.length > 3000 ? stdout.substring(0, 3000) + '... (下略)' : stdout;
            response += `✅ 成功:\n\`\`\`\n${output || '(無輸出)'}\n\`\`\``;
        }
        
        // 嘗試將執行結果回傳給 Gemini，讓它知道發生了什麼 (閉環)
        // 這裡選擇性實作：如果希望 Gemini 知道結果，可以呼叫 golem.sendMessage(response)
        // 但為了避免無限迴圈，目前先只顯示給使用者
        bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
    });
}

// ============================================================
// 🎮 事件監聽
// ============================================================

// 1. 訊息處理 (Queue 機制)
bot.on('message', (msg) => {
    messageQueue = messageQueue.then(async () => {
        const chatId = msg.chat.id;
        const text = msg.text;
        if (!text) return;

        console.log(`📩 [${msg.from.first_name}]: ${text.substring(0, 20)}...`);

        if (text === '/start') return bot.sendMessage(chatId, '👋 Golem v3.0 (Agent Mode) Online.\n直接對話即可。輸入 /new 重置並進入 Agent 模式。');
        
        if (text === '/new') {
            const status = await golem.resetChat();
            return bot.sendMessage(chatId, status);
        }

        const startMsg = await bot.sendMessage(chatId, '🧱 Golem 思考中...');
        bot.sendChatAction(chatId, 'typing');

        try {
            // 取得 Gemini 回應
            const response = await golem.sendMessage(text);
            await bot.deleteMessage(chatId, startMsg.message_id).catch(()=>{});
            
            // 進入意圖判斷
            await handleGeminiIntent(chatId, response);

        } catch (error) {
            await bot.editMessageText(`⚠️ 錯誤: ${error.message}`, { chat_id: chatId, message_id: startMsg.message_id });
            await golem.cleanup(); // 嘗試重啟
        }
    }).catch(console.error);
});

// 2. 按鈕回呼處理 (Callback Query)
bot.on('callback_query', async (query) => {
    const { id, data, message } = query;
    const chatId = message.chat.id;

    if (data === 'DENY') {
        await bot.answerCallbackQuery(id, { text: '已取消操作' });
        await bot.editMessageText(`🚫 操作已由使用者駁回。`, { chat_id: chatId, message_id: message.message_id });
        return;
    }

    if (data.startsWith('INSTALL:')) {
        const tool = data.split(':')[1];
        await bot.answerCallbackQuery(id, { text: '開始安裝...' });
        await bot.editMessageText(`🚀 正在安裝工具：${tool}...`, { chat_id: chatId, message_id: message.message_id });
        
        // 範例：根據 OS 決定安裝指令 (需確保主機有 brew/choco/npm)
        const installCmd = process.platform === 'darwin' ? `brew install ${tool}` : `npm install ${tool}`;
        await executeSystemCommand(chatId, installCmd);
    }

    if (data.startsWith('EXEC:')) {
        // 解碼指令
        const cmd = Buffer.from(data.split(':')[1], 'base64').toString('utf8');
        await bot.answerCallbackQuery(id, { text: '執行中...' });
        await bot.editMessageText(`🔥 正在執行高風險指令：\`${cmd}\`...`, { chat_id: chatId, message_id: message.message_id, parse_mode: 'Markdown' });
        await executeSystemCommand(chatId, cmd);
    }
});

console.log('📡 Golem v3.0 (The Architect) 伺服器啟動完成。');
