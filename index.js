/**
 * 🦞 Project Golem v6.3 (Ouroboros Edition)
 * ---------------------------------------------------
 * 架構：[Gemini 大腦] -> [Ollama 翻譯官] -> [Security 審計官] -> [Node.js 執行者]
 * 特性：自我內省、熱修復補丁、自主進化、人格記憶、雙模互動
 */

require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { Ollama } = require('ollama');
const { exec, execSync } = require('child_process');
const { v4: uuidv4 } = require('uuid');
const os = require('os');
const fs = require('fs');
const path = require('path');
const skills = require('./skills'); // 引入技能與人格

// --- ⚙️ 全域配置 ---
const CONFIG = {
    TOKEN: process.env.TELEGRAM_TOKEN,
    USER_DATA_DIR: process.env.USER_DATA_DIR || './golem_memory',
    OLLAMA_MODEL: 'llama3',
    SPLIT_TOKEN: '---GOLEM_ACTION_PLAN---',
    ADMIN_ID: process.env.ADMIN_ID
};

// --- 初始化組件 ---
puppeteer.use(StealthPlugin());
const ollama = new Ollama();
const bot = new TelegramBot(CONFIG.TOKEN, { polling: true });
const pendingTasks = new Map(); // 暫存等待審核的 Shell 任務
global.pendingPatch = null;     // 暫存等待審核的 代碼 Patch

// ============================================================
// 🧠 Experience Memory (經驗記憶體)
// ============================================================
class ExperienceMemory {
    constructor() {
        this.memoryFile = path.join(process.cwd(), 'golem_learning.json');
        this.data = this._load();
    }

    _load() {
        try {
            if (fs.existsSync(this.memoryFile)) {
                return JSON.parse(fs.readFileSync(this.memoryFile, 'utf-8'));
            }
        } catch (e) { console.error("記憶讀取失敗:", e); }
        return { lastProposalType: null, rejectedCount: 0, avoidList: [] };
    }

    save() {
        fs.writeFileSync(this.memoryFile, JSON.stringify(this.data, null, 2));
    }

    recordProposal(type) {
        this.data.lastProposalType = type;
        this.save();
    }

    recordRejection() {
        this.data.rejectedCount++;
        if (this.data.lastProposalType) {
            this.data.avoidList.push(this.data.lastProposalType);
            if (this.data.avoidList.length > 3) this.data.avoidList.shift();
        }
        this.save();
        return this.data.rejectedCount;
    }

    recordSuccess() {
        this.data.rejectedCount = 0;
        this.data.avoidList = [];
        this.save();
    }

    getAdvice() {
        if (this.data.avoidList.length > 0) {
            return `⚠️ 注意：主人最近拒絕了以下類型的提案：[${this.data.avoidList.join(', ')}]。請嘗試完全不同的方向。`;
        }
        return "";
    }
}
const memory = new ExperienceMemory();

// ============================================================
// 🪞 Introspection (內省模組)
// ============================================================
class Introspection {
    static readSelf() {
        try {
            const content = fs.readFileSync(__filename, 'utf-8');
            // 脫敏處理：隱藏 Token
            return content.replace(/TOKEN: .*,/, 'TOKEN: "HIDDEN",');
        } catch (e) {
            return `無法讀取自身代碼: ${e.message}`;
        }
    }
}

// ============================================================
// 🩹 Patch Manager (神經補丁管理)
// ============================================================
class PatchManager {
    static apply(originalCode, patch) {
        if (!originalCode.includes(patch.search)) {
            // 簡單容錯：若找不到完全匹配，拋出錯誤 (未來可加入 Fuzzy Match)
            throw new Error(`❌ 找不到匹配的原始代碼段落`);
        }
        return originalCode.replace(patch.search, patch.replace);
    }

    static createTestClone(originalPath, patchContent) {
        try {
            const originalCode = fs.readFileSync(originalPath, 'utf-8');
            let patchedCode = originalCode;
            const patches = Array.isArray(patchContent) ? patchContent : [patchContent];
            
            patches.forEach((p, index) => {
                patchedCode = this.apply(patchedCode, p);
            });

            const testFile = 'index.test.js';
            fs.writeFileSync(testFile, patchedCode, 'utf-8');
            return testFile;
        } catch (e) {
            throw new Error(`補丁應用失敗: ${e.message}`);
        }
    }

    static verify(filePath) {
        try {
            execSync(`node -c ${filePath}`); // 靜態語法檢查
            return true;
        } catch (e) {
            return false;
        }
    }
}

// ============================================================
// 🕰️ Autonomy Manager (自主進化排程)
// ============================================================
class AutonomyManager {
    constructor(bot, brain, chatId) {
        this.bot = bot;
        this.brain = brain;
        this.chatId = chatId;
    }

    start() {
        if (!this.chatId) return console.log("⚠️ 未設定 ADMIN_ID，自主進化模組未啟動。");
        console.log("🕰️ [Autonomy] 自主進化模組已啟動 (隨機週期模式)");
        this.scheduleNextAwakening();
    }

    scheduleNextAwakening() {
        // 隨機設定 18 ~ 30 小時後醒來
        const minHours = 18;
        const range = 12; 
        const nextWaitHours = minHours + Math.random() * range;
        
        console.log(`💤 [Autonomy] Golem 進入休眠，預計 ${nextWaitHours.toFixed(1)} 小時後進行自我審查。`);

        setTimeout(() => {
            this.performSelfReflection();
            this.scheduleNextAwakening();
        }, nextWaitHours * 60 * 60 * 1000);
    }

    async performSelfReflection() {
        try {
            const adviceFromMemory = memory.getAdvice();
            const currentCode = Introspection.readSelf();
            
            const prompt = `
            【任務】自主進化提案 (Autonomy Evolution)
            【角色】你是一個追求完美的 AI 助手。
            【原始碼】(略...系統已讀取)
            \`\`\`javascript
            ${currentCode.slice(0, 15000)}
            \`\`\`
            【記憶與限制】
            ${adviceFromMemory} 
            (若有拒絕記錄，請避開該方向。若無，請自由發揮。)

            【輸出要求】
            1. 找出一個優化點 (效能、安全、新功能)。
            2. 輸出 JSON 陣列 Patch。
            3. 格式：[{"type": "feature/security", "description": "一句話說明", "search": "...", "replace": "..."}]
            `;

            const rawResponse = await this.brain.sendMessage(prompt);
            let jsonStr = rawResponse.replace(/```json|```/g, '').trim();
            const jsonMatch = jsonStr.match(/\[\s*\{[\s\S]*\}\s*\]/);
            if(jsonMatch) jsonStr = jsonMatch[0];

            const patches = JSON.parse(jsonStr);
            const proposalType = patches[0].type || 'unknown';
            memory.recordProposal(proposalType);

            // 生成與測試
            const testFile = PatchManager.createTestClone(__filename, patches);
            
            if (PatchManager.verify(testFile)) {
                global.pendingPatch = testFile;
                
                const opts = {
                    reply_markup: {
                        inline_keyboard: [[
                            { text: '🚀 部署 (Deploy)', callback_data: 'PATCH_DEPLOY' },
                            { text: '🗑️ 丟棄 (Drop)', callback_data: 'PATCH_DROP' }
                        ]]
                    }
                };

                await this.bot.sendMessage(this.chatId, 
                    `💡 **靈感湧現！** (類型: ${proposalType})\n` +
                    `我想到了：**「${patches[0].description}」**\n` +
                    `測試分身已建立，請指示：`,
                    opts
                );
                await this.bot.sendDocument(this.chatId, testFile);
            }
        } catch (e) {
            console.error("進化失敗:", e.message);
        }
    }
}

// ============================================================
// 🔍 System Fingerprint (環境感知)
// ============================================================
function getSystemFingerprint() {
    try {
        const platform = os.platform(); 
        const release = os.release();
        const totalMem = (os.totalmem() / 1024 / 1024 / 1024).toFixed(2) + ' GB';
        const freeMem = (os.freemem() / 1024 / 1024 / 1024).toFixed(2) + ' GB';
        const cpuModel = os.cpus()[0] ? os.cpus()[0].model : 'Unknown CPU';
        const arch = os.arch();
        let shellType = platform === 'win32' ? 'PowerShell / CMD' : 'Bash';

        return `
        - 作業系統 (OS): ${platform} (${release})
        - 系統架構 (Arch): ${arch}
        - 處理器 (CPU): ${cpuModel}
        - 記憶體 (RAM): Total ${totalMem} / Free ${freeMem}
        - 建議指令集: ${shellType}
        - 工作目錄: ${process.cwd()}
        `;
    } catch (e) {
        return "無法取得詳細系統資訊，請預設使用 Linux Bash。";
    }
}

// ============================================================
// 🛡️ Security Manager (安全審計)
// ============================================================
class SecurityManager {
    constructor() {
        this.SAFE_COMMANDS = ['ls', 'dir', 'pwd', 'date', 'echo', 'cat', 'grep', 'find', 'whoami', 'tail', 'head', 'Get-ChildItem', 'Get-Content', 'Select-String'];
        this.BLOCK_PATTERNS = [
            /rm\s+-rf\s+\//, /rd\s+\/s\s+\/q\s+[c-zC-Z]:\\$/, />\s*\/dev\/sd/, /:(){:|:&};:/, /mkfs/, /Format-Volume/
        ];
    }

    assess(cmd) {
        const baseCmd = cmd.trim().split(/\s+/)[0];
        if (this.BLOCK_PATTERNS.some(regex => regex.test(cmd))) return { level: 'BLOCKED', reason: '偵測到毀滅性指令' };
        if (this.SAFE_COMMANDS.includes(baseCmd)) return { level: 'SAFE' };
        const dangerousOps = ['rm', 'mv', 'chmod', 'chown', 'sudo', 'su', 'shutdown', 'reboot', 'Remove-Item', 'Move-Item', 'Restart-Computer', 'Stop-Computer'];
        if (dangerousOps.includes(baseCmd)) return { level: 'DANGER', reason: '涉及檔案刪除或系統變更' };
        return { level: 'WARNING', reason: '系統操作需確認' };
    }
}

// ============================================================
// 🧠 Golem Brain (Gemini)
// ============================================================
class GolemBrain {
    constructor() {
        this.browser = null;
        this.page = null;
    }

    // ✨ 修改：支援 forceReload 參數，用於改名後重新載入 Prompt
    async init(forceReload = false) {
        if (this.browser && !forceReload) return;
        
        if (!this.browser) {
            console.log('🧠 [Brain] 啟動 Gemini...');
            this.browser = await puppeteer.launch({
                headless: false,
                userDataDir: CONFIG.USER_DATA_DIR,
                args: ['--no-sandbox', '--window-size=1280,900']
            });
        }

        if (!this.page) {
            const pages = await this.browser.pages();
            this.page = pages.length > 0 ? pages[0] : await this.browser.newPage();
            await this.page.goto('https://gemini.google.com/app', { waitUntil: 'networkidle2' });
        }

        if (forceReload || !this.page) {
            console.log('📚 [Brain] 正在載入人格與技能...');
            const fingerprint = getSystemFingerprint();
            // 從 skills.js 獲取包含新名字的 Prompt
            const systemPrompt = skills.getSystemPrompt(fingerprint);
            
            await this.sendMessage(systemPrompt, true);
            const p = skills.persona.get();
            console.log(`🧠 [Brain] 人格已更新: ${p.aiName} <-> ${p.userName}`);
        }
    }

    async sendMessage(text, isSystem = false) {
        if (!this.browser) await this.init();
        try {
            const selector = 'div[contenteditable="true"], rich-textarea > div';
            await this.page.waitForSelector(selector, { timeout: 15000 });
            await this.page.evaluate((sel, txt) => {
                const el = document.querySelector(sel);
                el.focus();
                document.execCommand('insertText', false, txt);
            }, selector, text);

            await new Promise(r => setTimeout(r, 800));
            await this.page.keyboard.press('Enter');

            if (isSystem) { await new Promise(r => setTimeout(r, 2000)); return; }

            console.log('🧠 [Brain] 思考中...');
            await this.page.waitForFunction(() => {
                const stopBtn = document.querySelector('[aria-label="Stop generating"], [aria-label="停止產生"]');
                const thinking = document.querySelector('.streaming-icon');
                return !stopBtn && !thinking;
            }, { timeout: 120000, polling: 1000 });

            return await this.page.evaluate(() => {
                const bubbles = document.querySelectorAll('message-content, .model-response-text');
                return bubbles.length ? bubbles[bubbles.length - 1].innerText : "";
            });
        } catch (e) { return `Brain Error: ${e.message}`; }
    }
}

// ============================================================
// 🦎 Golem Translator (Ollama)
// ============================================================
class GolemTranslator {
    async parse(planText) {
        if (!planText || planText.trim().length < 2) return [];
        console.log('🦎 [Translator] 解析指令中...');
        const prompt = `
        【任務】從下方文字提取 Shell/PowerShell 指令。
        【文字】"${planText}"
        【格式】JSON Array: [{"cmd": "ls", "desc": "說明"}]
        【規則】只輸出 JSON，忽略解釋。
        `;
        try {
            const res = await ollama.chat({
                model: CONFIG.OLLAMA_MODEL,
                messages: [{ role: 'user', content: prompt }],
                format: 'json',
                stream: false
            });
            return JSON.parse(res.message.content).steps || [];
        } catch (e) {
            console.error('🦎 解析失敗:', e);
            return [];
        }
    }
}

// ============================================================
// ⚡ Task Controller (核心控制)
// ============================================================
class TaskController {
    constructor() {
        this.executor = new Executor();
        this.security = new SecurityManager();
    }

    async runSequence(chatId, steps, startIndex = 0) {
        let logBuffer = "";
        for (let i = startIndex; i < steps.length; i++) {
            const step = steps[i];
            const risk = this.security.assess(step.cmd);

            if (risk.level === 'BLOCKED') {
                await bot.sendMessage(chatId, `⛔ **已攔截危險指令**：\`${step.cmd}\`\n理由：${risk.reason}`, { parse_mode: 'Markdown' });
                return;
            }

            if (risk.level === 'WARNING' || risk.level === 'DANGER') {
                const approvalId = uuidv4();
                pendingTasks.set(approvalId, { steps: steps, nextIndex: i, chatId: chatId });
                const riskIcon = risk.level === 'DANGER' ? '🔥' : '⚠️';
                const msg = `${riskIcon} **操作請求確認** (${i + 1}/${steps.length})\n指令：\`${step.cmd}\`\n風險：${risk.reason}`;
                await bot.sendMessage(chatId, msg, {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [[
                            { text: '✅ 批准執行', callback_data: `APPROVE:${approvalId}` },
                            { text: '🛡️ 駁回', callback_data: `DENY:${approvalId}` }
                        ]]
                    }
                });
                return;
            }

            await bot.sendMessage(chatId, `⚙️ *Step ${i + 1}:* ${step.desc}\n\`${step.cmd}\``, { parse_mode: 'Markdown' });
            try {
                const output = await this.executor.run(step.cmd);
                logBuffer += `✅ [${step.cmd}] OK\n`;
            } catch (err) {
                await bot.sendMessage(chatId, `❌ **執行失敗**：\`${step.cmd}\`\n${err}`);
                return;
            }
        }
        await bot.sendMessage(chatId, `🎉 **所有任務執行完畢**\n${logBuffer}`);
    }
}

class Executor {
    run(cmd) {
        return new Promise((resolve, reject) => {
            console.log(`⚡ Exec: ${cmd}`);
            exec(cmd, { cwd: process.cwd() }, (err, stdout, stderr) => {
                if (err) reject(stderr || err.message);
                else resolve(stdout);
            });
        });
    }
}

// ============================================================
// 🎮 主程式邏輯 (整合版)
// ============================================================
const brain = new GolemBrain();
const translator = new GolemTranslator();
const controller = new TaskController();
const autonomy = new AutonomyManager(bot, brain, CONFIG.ADMIN_ID);

(async () => {
    await brain.init();
    autonomy.start();

    // 👋 新增：初次見面問候邏輯
    const persona = skills.persona.get();
    if (persona.isNew && CONFIG.ADMIN_ID) {
        await bot.sendMessage(CONFIG.ADMIN_ID, 
            `🎉 **系統啟動成功！**\n\n` +
            `初次見面，我目前的預設代號是 **${persona.aiName}**。\n` +
            `請問我該如何稱呼您？\n\n` +
            `👉 請回覆： \`/callme [您的稱呼]\``
        );
    }
})();

// --- 輔助函式：部署與丟棄 ---
async function executeDeploy(chatId) {
    if (!global.pendingPatch) return;
    try {
        fs.copyFileSync(__filename, `index.bak-${Date.now()}.js`); // 備份
        const patchContent = fs.readFileSync(global.pendingPatch);
        fs.writeFileSync(__filename, patchContent); // 覆蓋
        fs.unlinkSync(global.pendingPatch); // 清理
        global.pendingPatch = null;
        memory.recordSuccess(); 
        await bot.sendMessage(chatId, "🚀 **系統升級完畢！** 正在重啟神經網路...");
        process.exit(0);
    } catch (e) {
        await bot.sendMessage(chatId, `❌ 部署失敗: ${e.message}`);
    }
}

async function executeDrop(chatId) {
    if (!global.pendingPatch) return;
    fs.unlinkSync(global.pendingPatch);
    global.pendingPatch = null;
    const failCount = memory.recordRejection(); 
    await bot.sendMessage(chatId, `🗑️ 已丟棄提案 (連續拒絕: ${failCount} 次)`);
}

function detectIntent(text) {
    text = text.toLowerCase().trim();
    if (['1', 'ok', 'yes', 'y', 'deploy', '好', '可以', '部署'].includes(text)) return 'DEPLOY';
    if (['2', 'no', 'n', 'drop', '不', '不要', '丟棄'].includes(text)) return 'DROP';
    return 'UNKNOWN';
}

// --- 1. 訊息監聽 ---
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    if (!text) return;

    // 權限檢查
    if (CONFIG.ADMIN_ID && String(chatId) !== CONFIG.ADMIN_ID) {
        return bot.sendMessage(chatId, "🚫 未授權的使用者。");
    }

    // 🌟 1. 優先：待審核 Patch 的意圖識別
    if (global.pendingPatch) {
        const intent = detectIntent(text);
        if (intent === 'DEPLOY') { await executeDeploy(chatId); return; }
        if (intent === 'DROP') { await executeDrop(chatId); return; }
    }

    // 🌟 2. 身份設定指令 (NEW)
    // 幫使用者取名
    if (text.startsWith('/callme') || text.startsWith('叫我')) {
        const newName = text.replace(/\/callme|叫我/g, '').trim();
        if (newName) {
            skills.persona.setName('user', newName);
            await brain.init(true); // 強制刷新 Prompt
            return bot.sendMessage(chatId, `👌 沒問題，以後我就稱呼您為 **${newName}**。`);
        }
    }
    // 幫 AI 取名
    if (text.startsWith('/setname') || text.startsWith('你叫')) {
        const newName = text.replace(/\/setname|你叫/g, '').trim();
        if (newName) {
            skills.persona.setName('ai', newName);
            await brain.init(true); // 強制刷新 Prompt
            return bot.sendMessage(chatId, `🤖 系統重命名完成。**${newName}** 隨時為您服務，${skills.persona.get().userName}。`);
        }
    }

    // 🌟 3. 手動進化指令
    if (text.startsWith('/patch') || text.includes('優化代碼') || text.startsWith('/audit')) {
        const req = text.replace('/patch', '').replace('/audit', '').trim() || "優化現有代碼結構";
        bot.sendMessage(chatId, `🧬 收到了，正在針對「${req}」進行分析與改造...`);
        
        // 觸發 Autonomy 的邏輯 (這裡手動執行一次反射)
        const currentCode = Introspection.readSelf();
        const prompt = `【任務】代碼熱修復\n【需求】${req}\n【源碼】\n${currentCode.slice(0,12000)}\n【格式】請輸出符合 PatchManager 格式的 JSON Array Patch`;
        
        try {
            const rawResponse = await brain.sendMessage(prompt);
            let jsonStr = rawResponse.replace(/```json|```/g, '').trim();
            const jsonMatch = jsonStr.match(/\[\s*\{[\s\S]*\}\s*\]/);
            if(jsonMatch) jsonStr = jsonMatch[0];
            const patches = JSON.parse(jsonStr);
            const testFile = PatchManager.createTestClone(__filename, patches);
            if (PatchManager.verify(testFile)) {
                global.pendingPatch = testFile;
                const opts = { reply_markup: { inline_keyboard: [[{ text: '🚀 部署', callback_data: 'PATCH_DEPLOY' }, { text: '🗑️ 丟棄', callback_data: 'PATCH_DROP' }]] } };
                await bot.sendMessage(chatId, `💡 **手動進化提案已就緒！**\n附件是測試代碼，請審閱：`, opts);
                await bot.sendDocument(chatId, testFile);
            }
        } catch (e) {
            bot.sendMessage(chatId, `❌ 進化生成失敗: ${e.message}`);
        }
        return; 
    }

    // 🌟 4. 一般對話與任務 (原有邏輯)
    bot.sendChatAction(chatId, 'typing');
    try {
        const raw = await brain.sendMessage(text);
        const [chatPart, planPart] = raw.split(CONFIG.SPLIT_TOKEN);

        if (chatPart && chatPart.trim()) await bot.sendMessage(chatId, chatPart.trim());

        if (planPart && planPart.trim()) {
            const steps = await translator.parse(planPart.trim());
            if (steps.length > 0) await controller.runSequence(chatId, steps, 0);
        }
    } catch (e) {
        console.error(e);
        bot.sendMessage(chatId, `❌ 系統錯誤: ${e.message}`);
    }
});

// --- 2. 按鈕回調監聽 (整合版) ---
bot.on('callback_query', async (query) => {
    const { id, data, message } = query;
    const chatId = message.chat.id;

    // A. 處理 Patch 按鈕
    if (data === 'PATCH_DEPLOY') {
        await bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chatId, message_id: message.message_id });
        await executeDeploy(chatId);
        return bot.answerCallbackQuery(id, { text: '部署中...' });
    }
    if (data === 'PATCH_DROP') {
        await bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chatId, message_id: message.message_id });
        await executeDrop(chatId);
        return bot.answerCallbackQuery(id, { text: '已丟棄' });
    }

    // B. 處理 Shell 任務按鈕 (原有)
    if (!data.includes(':')) return; 
    const [action, taskId] = data.split(':');
    const task = pendingTasks.get(taskId);

    if (!task) return bot.answerCallbackQuery(id, { text: '任務失效' });
    await bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chatId, message_id: message.message_id });

    if (action === 'DENY') {
        pendingTasks.delete(taskId);
        await bot.sendMessage(chatId, '🛡️ **操作駁回。**', { parse_mode: 'Markdown' });
        return;
    }

    if (action === 'APPROVE') {
        bot.answerCallbackQuery(id, { text: '授權通過' });
        const { steps, nextIndex } = task;
        const currentStep = steps[nextIndex];
        try {
            await bot.sendMessage(chatId, `🔥 **執行**: \`${currentStep.cmd}\``, { parse_mode: 'Markdown' });
            await new Executor().run(currentStep.cmd);
            pendingTasks.delete(taskId);
            await controller.runSequence(chatId, steps, nextIndex + 1);
        } catch (e) {
            await bot.sendMessage(chatId, `❌ 執行失敗: ${e}`);
            pendingTasks.delete(taskId);
        }
    }
});

console.log('📡 Golem v6.3 (Ouroboros Edition) is Online.');
console.log('🛡️ Security Protocols & Autonomy System Active.');
