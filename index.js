/**
 * 🦞 Project Golem v3.5 (Fortress Ultimate)
 * ---------------------------------------------------
 * 核心架構：
 * 1. [Browser Core] Puppeteer 控制 Gemini 網頁版
 * 2. [Security Manager] 路徑沙盒化 + 風險分級控制 (RBAC)
 * 3. [Agent Protocol] JSON 通訊協議，支援 File I/O 與 Shell Execution
 * 4. [Privilege Escalation] 針對系統安裝指令 (brew/apt) 的動態權限提升
 */

require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { default: ollama } = require('ollama');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { v4: uuidv4 } = require('uuid'); // 用來生成任務 ID

// 1. 隱形模式啟用
puppeteer.use(StealthPlugin());

// --- ⚙️ 全域配置 ---
const CONFIG = {
    TOKEN: process.env.TELEGRAM_TOKEN,
    USER_DATA_DIR: process.env.USER_DATA_DIR || './golem_memory',
    DEBUG_DIR: './debug_screenshots',
    TIMEOUT: 120000, // 2分鐘超時
    
    // 📦 安全沙盒：Gemini 預設只能在這裡面玩
    WORKSPACE: path.resolve('./golem_workspace'),

    // 🚦 風險策略表 (AUTO: 自動, ASK: 詢問, STRICT: 警告)
    POLICIES: {
        'search': 'AUTO',        // 聯網搜尋
        'read_file': 'ASK',      // 讀檔
        'write_file': 'ASK',     // 寫檔/改檔
        'delete_file': 'STRICT', // 刪檔
        'exec_shell': 'ASK',     // 執行指令 (白名單會變 AUTO)
        'install': 'STRICT'      // 安裝工具
    },

    // 🟢 白名單指令 (低風險，自動放行)
    SAFE_COMMANDS: ['ls', 'dir', 'date', 'echo', 'whoami', 'pwd', 'cat', 'type', 'grep']
};

// --- 初始化檢查 ---
if (!CONFIG.TOKEN) { console.error('❌ 請設定 .env 的 TELEGRAM_TOKEN'); process.exit(1); }
if (!fs.existsSync(CONFIG.DEBUG_DIR)) fs.mkdirSync(CONFIG.DEBUG_DIR);
if (!fs.existsSync(CONFIG.WORKSPACE)) fs.mkdirSync(CONFIG.WORKSPACE);

// --- 🧠 Agent 系統提示詞 (System Prompt) ---
const SYSTEM_PROMPT = `
【Agent 模式啟動】
你現在是 Golem 系統管理員。你的預設工作目錄是: ./golem_workspace
當使用者請求操作電腦時，請輸出以下 JSON 格式 (不要解釋，只給 JSON)：

1. 執行指令 (Shell):
\`\`\`json
{"type": "exec_shell", "cmd": "ls -la", "reason": "查看檔案列表"}
\`\`\`

2. 系統安裝 (需要 root 權限):
\`\`\`json
{"type": "install", "cmd": "brew install ffmpeg", "reason": "安裝轉檔工具"}
\`\`\`

3. 讀寫檔案:
\`\`\`json
{"type": "write_file", "path": "hello.py", "content": "print('Hi')", "reason": "建立腳本"}
\`\`\`

⚠️ 注意：
1. 嚴禁 rm -rf / 或格式化指令。
2. 盡量使用相對路徑操作檔案。
`;

// ============================================================
// 🛡️ Security Manager (安全管家)
// ============================================================
class SecurityManager {
    // 驗證路徑是否越獄
    verifyPath(userPath) {
        if (!userPath) return { safe: true };
        const absolutePath = path.resolve(CONFIG.WORKSPACE, userPath);
        
        // 檢查路徑開頭是否在 WORKSPACE 內
        if (!absolutePath.startsWith(CONFIG.WORKSPACE)) {
            return { safe: false, reason: `🚫 路徑越獄攔截: 禁止存取沙盒外路徑 (${userPath})` };
        }
        return { safe: true, path: absolutePath };
    }

    // 評估風險
    evaluateRisk(intent) {
        let policy = CONFIG.POLICIES[intent.type] || 'STRICT';
        
        // 特例：白名單指令降級為 AUTO
        if (intent.type === 'exec_shell') {
            const baseCmd = intent.cmd.trim().split(' ')[0];
            if (CONFIG.SAFE_COMMANDS.includes(baseCmd)) {
                policy = 'AUTO';
            }
        }

        // 路徑檢查
        if (intent.path) {
            const pathCheck = this.verifyPath(intent.path);
            if (!pathCheck.safe) return { action: 'DENY', reason: pathCheck.reason };
            intent.absolutePath = pathCheck.path; // 注入絕對路徑
        }

        if (policy === 'AUTO') return { action: 'ALLOW', risk: '🟢' };
        if (policy === 'ASK') return { action: 'CONFIRM', risk: '🟡' };
        if (policy === 'STRICT') return { action: 'CONFIRM_STRICT', risk: '🔴' };
        
        return { action: 'DENY', reason: "Unknown Policy" };
    }
}
const security = new SecurityManager();

// 用來暫存待審核任務的 Map (避免 Base64 過長)
const pendingTasks = new Map();

// ============================================================
// 🧱 GolemBrowser (瀏覽器核心)
// ============================================================
class GolemBrowser {
    constructor() {
        this.browser = null;
        this.page = null;
        this.isInitializing = false;
    }

    async init() {
        if (this.browser && this.page && !this.page.isClosed()) return;
        if (this.isInitializing) return;

        this.isInitializing = true;
        console.log('🧱 啟動瀏覽器...');
        try {
            this.browser = await puppeteer.launch({
                headless: false, // 建議 false 以避免被 Google 封鎖
                userDataDir: CONFIG.USER_DATA_DIR,
                defaultViewport: null,
                args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,900']
            });
            
            const pages = await this.browser.pages();
            this.page = pages.length > 0 ? pages[0] : await this.browser.newPage();
            
            // 偽裝 UA
            await this.page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
            
            console.log('🌊 連線 Gemini...');
            await this.page.goto('https://gemini.google.com/app', { waitUntil: 'networkidle2' });
        } catch (e) {
            console.error('❌ 啟動失敗:', e);
            await this.cleanup();
        } finally {
            this.isInitializing = false;
        }
    }

    async cleanup() {
        if (this.browser) await this.browser.close().catch(()=>{});
        this.browser = null;
        this.page = null;
    }

    async resetChat() {
        await this.init();
        try {
            await this.page.goto('https://gemini.google.com/app', { waitUntil: 'networkidle2' });
            // 靜默注入 Prompt
            await this.sendMessage(SYSTEM_PROMPT, true);
            return "已重置對話，安全防護網已啟動 🛡️";
        } catch (e) { return "重置失敗"; }
    }

    async sendMessage(text, isSystem = false) {
        await this.init();
        const page = this.page;

        try {
            const selectors = ['div[contenteditable="true"]', 'rich-textarea > div', 'div[role="textbox"]'];
            await page.waitForSelector(selectors.join(','), { timeout: 10000 });

            // DOM 操作極速輸入
            await page.evaluate((sel, msg) => {
                const el = document.querySelector(sel);
                if (el) {
                    el.focus();
                    el.innerHTML = '';
                    document.execCommand('insertText', false, msg);
                }
            }, selectors[0], text);

            await new Promise(r => setTimeout(r, 800));
            await page.keyboard.press('Enter');

            if (isSystem) {
                await new Promise(r => setTimeout(r, 2000));
                return "System Prompt Injected";
            }

            console.log('⏳ 等待回應...');
            // 智慧等待：Stop 按鈕消失且 Loading 動畫消失
            await page.waitForFunction(() => {
                const stopBtn = document.querySelector('[aria-label="Stop generating"], [aria-label="停止產生"]');
                const thinking = document.querySelector('.streaming-icon');
                return !stopBtn && !thinking;
            }, { timeout: CONFIG.TIMEOUT, polling: 500 });

            const response = await page.evaluate(() => {
                const bubbles = document.querySelectorAll('message-content, .model-response-text');
                return bubbles.length ? bubbles[bubbles.length - 1].innerText : null;
            });

            if (!response) throw new Error("無回應");
            return response;

        } catch (error) {
            const filename = `${CONFIG.DEBUG_DIR}/error_${Date.now()}.png`;
            await page.screenshot({ path: filename });
            console.log(`📸 錯誤截圖: ${filename}`);
            throw error;
        }
    }
}

// ============================================================
// 🤖 Telegram Bot Logic
// ============================================================
const bot = new TelegramBot(CONFIG.TOKEN, { polling: true });
const golem = new GolemBrowser();
let messageQueue = Promise.resolve();

// --- 意圖處理核心 ---
async function handleGeminiIntent(chatId, text) {
    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
    
    // 1. 無 JSON -> 普通對話
    if (!jsonMatch) return handleNormalResponse(chatId, text);

    // 2. 解析 JSON
    let intent;
    try {
        intent = JSON.parse(jsonMatch[1]);
    } catch (e) {
        return bot.sendMessage(chatId, `⚠️ JSON 解析失敗: ${e.message}`);
    }

    console.log('🤖 意圖偵測:', intent);

    // 3. 安全審計
    const assessment = security.evaluateRisk(intent);
    
    if (assessment.action === 'DENY') {
        return bot.sendMessage(chatId, `⛔ **攔截**\n${assessment.reason}`, { parse_mode: 'Markdown' });
    }

    if (assessment.action === 'ALLOW') {
        await executeTask(chatId, intent);
        return;
    }

    // 4. 需要人工確認 (Ask/Strict)
    // 存入 Map 並生成 UUID
    const taskId = uuidv4();
    pendingTasks.set(taskId, intent);

    const isStrict = assessment.action === 'CONFIRM_STRICT';
    const opts = {
        reply_markup: {
            inline_keyboard: [[
                { text: isStrict ? '🔥 Root 授權執行' : '✅ 批准', callback_data: `EXEC:${taskId}` },
                { text: '🛡️ 駁回', callback_data: `DENY:${taskId}` }
            ]]
        }
    };

    const msg = `
${assessment.risk} **請求授權**
━━━━━━━━━━━━━━
🤖 動作：\`${intent.type}\`
📂 目標：\`${intent.path || intent.cmd || 'N/A'}\`
📝 理由：${intent.reason}
━━━━━━━━━━━━━━
${isStrict ? '⚠️ 警告：此操作可能涉及系統變更或越獄。' : '需授權以存取沙盒。'}
    `;
    return bot.sendMessage(chatId, msg, { parse_mode: 'Markdown', ...opts });
}

// --- 任務執行器 (支援特權升級) ---
async function executeTask(chatId, intent) {
    const actionMsg = await bot.sendMessage(chatId, `⚙️ 執行中: ${intent.type}...`);
    
    try {
        let result = '';
        let execOptions = { cwd: CONFIG.WORKSPACE }; // 預設：關在沙盒

        // A. Shell 指令 & 安裝
        if (intent.type === 'exec_shell' || intent.type === 'install') {
            
            // 🚨 特權檢查：是否為系統級安裝指令
            const systemInstallers = ['brew', 'apt', 'apt-get', 'choco', 'winget', 'npm install -g'];
            const isSystemInstall = systemInstallers.some(installer => intent.cmd.startsWith(installer));

            if (isSystemInstall) {
                // 如果能執行到這裡，代表使用者已經按了「🔥 Root 授權執行」
                // 暫時將執行目錄切換到根目錄 (或不指定 cwd 以使用系統預設)
                execOptions.cwd = process.cwd(); 
                console.log(`⚠️ PRIVILEGE ESCALATION: Running in Root -> ${intent.cmd}`);
            }

            result = await new Promise((resolve) => {
                exec(intent.cmd, execOptions, (err, stdout, stderr) => {
                    if (err) resolve(`❌ 失敗:\n${stderr || err.message}`);
                    else resolve(`✅ 成功:\n${stdout}\n${stderr ? `(Info: ${stderr})` : ''}`);
                });
            });
        }

        // B. 檔案操作 (已由 SecurityManager 確保路徑安全)
        else if (intent.type === 'read_file') {
            if (!fs.existsSync(intent.absolutePath)) throw new Error("檔案不存在");
            const content = fs.readFileSync(intent.absolutePath, 'utf-8');
            result = `📄 **${intent.path}**\n\`\`\`\n${content.substring(0, 3000)}\n\`\`\``;
        }

        else if (intent.type === 'write_file') {
            fs.writeFileSync(intent.absolutePath, intent.content);
            result = `💾 已寫入: \`${intent.path}\``;
        }

        // 回傳結果 (長度截斷)
        const finalMsg = result.length > 3800 ? result.substring(0, 3800) + '... (下略)' : result;
        await bot.editMessageText(finalMsg, { chat_id: chatId, message_id: actionMsg.message_id, parse_mode: 'Markdown' });

    } catch (error) {
        await bot.editMessageText(`❌ 錯誤: ${error.message}`, { chat_id: chatId, message_id: actionMsg.message_id });
    }
}

// --- 普通訊息與摘要 ---
async function handleNormalResponse(chatId, text) {
    if (text.length > 4000) {
        // 嘗試用 Ollama 摘要
        try {
             bot.sendChatAction(chatId, 'typing');
             const summary = await ollama.chat({
                model: 'llama3.2:3b', // 需確保有此模型
                messages: [{ role: 'user', content: `摘要重點 (繁體中文):\n${text.substring(0, 2000)}` }] 
             });
             await bot.sendMessage(chatId, `🧠 **重點摘要:**\n${summary.message.content}`, { parse_mode: 'Markdown' });
        } catch(e) { /* Ollama 沒開就算了 */ }

        // 切分發送
        const chunks = text.match(/.{1,4000}/g);
        for (const chunk of chunks) await bot.sendMessage(chatId, chunk);
    } else {
        try {
            await bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
        } catch {
            await bot.sendMessage(chatId, text); // 降級為純文字
        }
    }
}

// ============================================================
// 🎮 事件監聽 (Event Loop)
// ============================================================

bot.on('message', (msg) => {
    messageQueue = messageQueue.then(async () => {
        const chatId = msg.chat.id;
        const text = msg.text;
        if (!text) return;

        if (text === '/start') return bot.sendMessage(chatId, '👋 Golem v3.5 (Fortress) Online.\n輸入 /new 初始化 Agent 環境。');
        
        if (text === '/new') {
            const status = await golem.resetChat();
            return bot.sendMessage(chatId, status);
        }

        const thinkingMsg = await bot.sendMessage(chatId, '🧱 Golem 思考中...');
        bot.sendChatAction(chatId, 'typing');

        try {
            // 1. 取得 Gemini 回應
            const response = await golem.sendMessage(text);
            await bot.deleteMessage(chatId, thinkingMsg.message_id).catch(()=>{});
            
            // 2. 意圖判斷與執行
            await handleGeminiIntent(chatId, response);

        } catch (error) {
            await bot.editMessageText(`⚠️ 系統錯誤: ${error.message}\n(嘗試自我修復中...)`, { chat_id: chatId, message_id: thinkingMsg.message_id });
            await golem.cleanup(); // 嘗試重啟瀏覽器
        }
    }).catch(console.error);
});

// 按鈕回調
bot.on('callback_query', async (query) => {
    const { id, data, message } = query;
    const chatId = message.chat.id;
    const [action, taskId] = data.split(':');

    // 駁回
    if (action === 'DENY') {
        pendingTasks.delete(taskId);
        await bot.answerCallbackQuery(id, { text: '已取消' });
        await bot.editMessageText('🛡️ 操作已由使用者駁回。', { chat_id: chatId, message_id: message.message_id });
        return;
    }

    // 執行
    if (action === 'EXEC') {
        const intent = pendingTasks.get(taskId);
        if (!intent) {
            await bot.answerCallbackQuery(id, { text: '任務已過期' });
            return;
        }

        await bot.answerCallbackQuery(id, { text: '授權通過，執行中...' });
        
        // 重新注入絕對路徑 (因為 Map 裡存的是原始 intent，需要確保安全檢查後的路徑還在)
        // 這裡重新跑一次 verify 確保萬無一失
        if (intent.path) {
            const check = security.verifyPath(intent.path);
            if (check.safe) intent.absolutePath = check.path;
        }
        
        await executeTask(chatId, intent);
        pendingTasks.delete(taskId); // 清除任務
    }
});

console.log('📡 Golem v3.5 (Fortress Ultimate) 啟動完成。');
console.log(`📂 安全沙盒位置: ${CONFIG.WORKSPACE}`);
