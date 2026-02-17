/**
 * 🦞 Project Golem v9.0 (Ultimate Chronos + MultiAgent + WebSkillEngine Edition)
 * -------------------------------------------------------------------------
 * 架構：[Universal Context] -> [Conversation Queue] -> [NeuroShunter] <==> [Web Gemini]
 * * 🎯 v9.0 核心升級：
 * 1. 結合 v8.7 的高穩定性 (Flood Guard, KeyChain v2)
 * 2. 整合 v8.8 的互動式多 Agent 會議系統 (InteractiveMultiAgent)
 * 3. 升級 Titan Protocol 支援多重動作指令
 * 4. ✨ 新增 Web-Based Skill Engine (Architect 使用 Web Gemini 生成)
 * * [保留功能]
 * - KeyChain v2 智慧冷卻機制
 * - SecurityManager v2 Taint 追蹤
 * - Flood Guard 啟動時間過濾
 * - DOM Doctor 自動修復
 */

// ==========================================
// 📟 儀表板外掛 (Dashboard Switch)
// ==========================================
if (process.argv.includes('dashboard')) {
    try {
        require('./dashboard');
        console.log("✅ 戰術控制台已啟動 (繁體中文版)");
    } catch (e) {
        console.error("❌ 無法載入 Dashboard:", e.message);
    }
} else {
    console.log("ℹ️  以標準模式啟動 (無 Dashboard)。若需介面請輸入 'npm start dashboard'");
}

// ==========================================
require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { Client, GatewayIntentBits, Partials, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { exec, execSync, spawn } = require('child_process');
const { v4: uuidv4 } = require('uuid');
const os = require('os');
const fs = require('fs');
const path = require('path');
const https = require('https');
const skills = require('./skills');

// ✨ [v9.0 Addon] 引入新一代技能引擎
const SkillArchitect = require('./lib/skill-architect');
const skillManager = require('./lib/skill-manager');

// --- ⚙️ 全域配置 ---
const cleanEnv = (str, allowSpaces = false) => {
    if (!str) return "";
    let cleaned = str.replace(/[^\x20-\x7E]/g, "");
    if (!allowSpaces) cleaned = cleaned.replace(/\s/g, "");
    return (cleaned || "").trim();
};

const isPlaceholder = (str) => {
    if (!str) return true;
    return /你的|這裡|YOUR_|TOKEN/i.test(str) || str.length < 10;
};

const CONFIG = {
    TG_TOKEN: cleanEnv(process.env.TELEGRAM_TOKEN),
    DC_TOKEN: cleanEnv(process.env.DISCORD_TOKEN),
    USER_DATA_DIR: cleanEnv(process.env.USER_DATA_DIR || './golem_memory', true),
    API_KEYS: (process.env.GEMINI_API_KEYS || '').split(',').map(k => cleanEnv(k)).filter(k => k),
    ADMIN_ID: cleanEnv(process.env.ADMIN_ID),
    DISCORD_ADMIN_ID: cleanEnv(process.env.DISCORD_ADMIN_ID),
    ADMIN_IDS: [process.env.ADMIN_ID, process.env.DISCORD_ADMIN_ID].map(k => cleanEnv(k)).filter(k => k),
    GITHUB_REPO: cleanEnv(process.env.GITHUB_REPO || 'https://raw.githubusercontent.com/Arvincreator/project-golem/main/', true),
    QMD_PATH: cleanEnv(process.env.GOLEM_QMD_PATH || 'qmd', true),
    DONATE_URL: 'https://buymeacoffee.com/arvincreator'
};

// 驗證關鍵 Token
if (isPlaceholder(CONFIG.TG_TOKEN)) { console.warn("⚠️ [Config] TELEGRAM_TOKEN 無效，TG Bot 不啟動。"); CONFIG.TG_TOKEN = ""; }
if (isPlaceholder(CONFIG.DC_TOKEN)) { console.warn("⚠️ [Config] DISCORD_TOKEN 無效，Discord Bot 不啟動。"); CONFIG.DC_TOKEN = ""; }
if (CONFIG.API_KEYS.some(isPlaceholder)) CONFIG.API_KEYS = CONFIG.API_KEYS.filter(k => !isPlaceholder(k));

// ✨ [v9.0 Addon] 初始化技能架構師 (Web Gemini Mode)
// 注意：這裡不傳入 Model，因為我們將在 NodeRouter 中傳入 Web Brain
const architect = new SkillArchitect(); 
console.log("🏗️ [SkillArchitect] 技能架構師已就緒 (Web Mode)");

// --- 初始化組件 ---
// ⏱️ [v8.7 保留] Flood Guard - 啟動時間戳記
const BOOT_TIME = Date.now();
console.log(`🛡️ [v8.7 Flood Guard] 系統啟動時間: ${new Date(BOOT_TIME).toLocaleString('zh-TW', { hour12: false })}`);

puppeteer.use(StealthPlugin());

const tgBot = CONFIG.TG_TOKEN ? new TelegramBot(CONFIG.TG_TOKEN, { polling: true }) : null;
const dcClient = CONFIG.DC_TOKEN ? new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
    partials: [Partials.Channel]
}) : null;

const pendingTasks = new Map();
global.pendingPatch = null;

// ✨ [v9.0 新增] MultiAgent 全域狀態
global.multiAgentListeners = new Map();
global.pausedConversations = new Map();

// 🔧 FIX: pendingTasks 自動過期機制 (5 分鐘)
setInterval(() => {
    const now = Date.now();
    for (const [id, task] of pendingTasks.entries()) {
        if (task.timestamp && (now - task.timestamp > 300000)) {
            pendingTasks.delete(id);
            console.log(`🗑️ [TaskCleanup] 清理過期任務: ${id}`);
        }
    }
}, 60000); // 每分鐘檢查一次

// ============================================================
// 👁️ OpticNerve (視神經 - Gemini 2.5 Flash Bridge)
// ============================================================
class OpticNerve {
    static async analyze(fileUrl, mimeType, apiKey) {
        console.log(`👁️ [OpticNerve] 正在透過 Gemini 2.5 Flash 分析檔案 (${mimeType})...`);
        try {
            const buffer = await new Promise((resolve, reject) => {
                https.get(fileUrl, (res) => {
                    const data = [];
                    res.on('data', (chunk) => data.push(chunk));
                    res.on('end', () => resolve(Buffer.concat(data)));
                    res.on('error', reject);
                });
            });
            const genAI = new GoogleGenerativeAI(apiKey);
            const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
            const prompt = mimeType.startsWith('image/')
                ? "請詳細描述這張圖片的視覺內容。如果包含文字或程式碼，請完整轉錄。如果是介面截圖，請描述UI元件。請忽略無關的背景雜訊。"
                : "請閱讀這份文件，並提供詳細的摘要、關鍵數據與核心內容。";

            const result = await model.generateContent([
                prompt,
                { inlineData: { data: buffer.toString('base64'), mimeType: mimeType } }
            ]);
            const text = result.response.text();
            console.log("✅ [OpticNerve] 分析完成 (長度: " + text.length + ")");
            return text;
        } catch (e) {
            console.error("❌ [OpticNerve] 解析失敗:", e.message);
            return `(系統錯誤：視神經無法解析此檔案。原因：${e.message})`;
        }
    }
}

// ============================================================
// 🔌 Universal Context (通用語境層)
// ============================================================
class UniversalContext {
    constructor(platform, event, instance) {
        this.platform = platform;
        this.event = event;
        this.instance = instance;
        this.isInteraction = platform === 'discord' && (event.isButton?.() || event.isCommand?.());
    }

    get userId() {
        return this.platform === 'telegram' ? String(this.event.from?.id || this.event.user?.id) : this.event.user ? this.event.user.id : this.event.author?.id;
    }

    get chatId() {
        if (this.platform === 'telegram') return this.event.message ? this.event.message.chat.id : this.event.chat.id;
        return this.event.channelId || this.event.channel.id;
    }

    get text() {
        if (this.platform === 'telegram') return this.event.text || this.event.caption || "";
        return this.event.content || "";
    }

    async getAttachment() {
        if (this.platform === 'telegram') {
            const msg = this.event;
            let fileId = null;
            let mimeType = 'image/jpeg';
            if (msg.photo) fileId = msg.photo[msg.photo.length - 1].file_id;
            else if (msg.document) {
                fileId = msg.document.file_id;
                mimeType = msg.document.mime_type;
            }
            if (fileId) {
                try {
                    const file = await this.instance.getFile(fileId);
                    return { url: `https://api.telegram.org/file/bot${CONFIG.TG_TOKEN}/${file.file_path}`, mimeType: mimeType };
                } catch (e) { console.error("TG File Error:", e); }
            }
        } else {
            const attachment = this.event.attachments && this.event.attachments.first();
            if (attachment) {
                return { url: attachment.url, mimeType: attachment.contentType || 'application/octet-stream' };
            }
        }
        return null;
    }

    get isAdmin() {
        if (CONFIG.ADMIN_IDS.length === 0) return true;
        return CONFIG.ADMIN_IDS.includes(this.userId);
    }

    async reply(content, options) {
        if (this.isInteraction) {
            try {
                if (!this.event.deferred && !this.event.replied) {
                    return await this.event.reply({ content, flags: 64 });
                } else {
                    return await this.event.followUp({ content, flags: 64 });
                }
            } catch (e) {
                console.error('UniversalContext Discord Reply Error:', e.message);
                try {
                    const channel = await this.instance.channels.fetch(this.chatId);
                    return await channel.send(content);
                } catch (err) {
                    console.error('UniversalContext Fallback Error:', err.message);
                }
            }
        }
        return await MessageManager.send(this, content, options);
    }

    async sendDocument(filePath) {
        try {
            if (this.platform === 'telegram') await this.instance.sendDocument(this.chatId, filePath);
            else {
                const channel = await this.instance.channels.fetch(this.chatId);
                await channel.send({ files: [filePath] });
            }
        } catch (e) {
            if (e.message.includes('Request entity too large')) await this.reply(`⚠️ 檔案過大 (Discord Limit 25MB)。`);
            else await this.reply(`❌ 傳送失敗: ${e.message}`);
        }
    }

    get messageTime() {
        if (this.platform === 'telegram') {
            const msg = this.event.message || this.event;
            return msg.date ? msg.date * 1000 : null;
        }
        if (this.platform === 'discord') {
            return this.event.createdTimestamp || null;
        }
        return null;
    }

    async sendTyping() {
        if (this.isInteraction) return;
        if (this.platform === 'telegram') {
            this.instance.sendChatAction(this.chatId, 'typing');
        } else {
            try {
                const channel = await this.instance.channels.fetch(this.chatId);
                await channel.sendTyping();
            } catch (e) { }
        }
    }
}

// ============================================================
// 📨 Message Manager (雙模版訊息切片器)
// ============================================================
class MessageManager {
    static async send(ctx, text, options = {}) {
        if (!text) return;
        const MAX_LENGTH = ctx.platform === 'telegram' ? 4000 : 1900;
        const chunks = [];
        let remaining = text;
        while (remaining.length > 0) {
            if (remaining.length <= MAX_LENGTH) { chunks.push(remaining); break; }
            let splitIndex = remaining.lastIndexOf('\n', MAX_LENGTH);
            if (splitIndex === -1) splitIndex = MAX_LENGTH;
            chunks.push(remaining.substring(0, splitIndex));
            remaining = remaining.substring(splitIndex).trim();
        }

        for (const chunk of chunks) {
            try {
                if (ctx.platform === 'telegram') {
                    await ctx.instance.sendMessage(ctx.chatId, chunk, options);
                } else {
                    const channel = await ctx.instance.channels.fetch(ctx.chatId);
                    const dcOptions = { content: chunk };
                    if (options.reply_markup && options.reply_markup.inline_keyboard) {
                        const row = new ActionRowBuilder();
                        options.reply_markup.inline_keyboard[0].forEach(btn => {
                            row.addComponents(new ButtonBuilder().setCustomId(btn.callback_data).setLabel(btn.text).setStyle(ButtonStyle.Primary));
                        });
                        dcOptions.components = [row];
                    }
                    await channel.send(dcOptions);
                }
            } catch (e) { console.error(`[MessageManager] 發送失敗:`, e.message); }
        }
    }
}

// ============================================================
// 🧠 Experience Memory (經驗記憶體)
// ============================================================
class ExperienceMemory {
    constructor() {
        this.memoryFile = path.join(process.cwd(), 'golem_learning.json');
        this.data = this._load();
    }
    _load() {
        try { if (fs.existsSync(this.memoryFile)) return JSON.parse(fs.readFileSync(this.memoryFile, 'utf-8')); } catch (e) { }
        return { lastProposalType: null, rejectedCount: 0, avoidList: [], nextWakeup: 0 };
    }
    save() { fs.writeFileSync(this.memoryFile, JSON.stringify(this.data, null, 2)); }
    recordProposal(type) { this.data.lastProposalType = type; this.save(); }
    recordRejection() {
        this.data.rejectedCount++;
        if (this.data.lastProposalType) {
            this.data.avoidList.push(this.data.lastProposalType);
            if (this.data.avoidList.length > 3) this.data.avoidList.shift();
        }
        this.save();
    }
    recordSuccess() { this.data.rejectedCount = 0; this.data.avoidList = []; this.save(); }
    getAdvice() {
        if (this.data.avoidList.length > 0) return `⚠️ 注意：主人最近拒絕了：[${this.data.avoidList.join(', ')}]。請避開。`;
        return "";
    }
}
const memory = new ExperienceMemory();

// ============================================================
// 🪞 Introspection (內省模組)
// ============================================================
// ==================== [KERNEL PROTECTED START] ====================
class Introspection {
    static readSelf() {
        try {
            let main = fs.readFileSync(__filename, 'utf-8');
            main = main.replace(/TOKEN: .*,/, 'TOKEN: "HIDDEN",').replace(/API_KEYS: .*,/, 'API_KEYS: "HIDDEN",');
            let skills = "";
            try { skills = fs.readFileSync(path.join(process.cwd(), 'skills.js'), 'utf-8'); } catch (e) { }
            return `=== index.js ===\n${main}\n\n=== skills.js ===\n${skills}`;
        } catch (e) { return `無法讀取自身代碼: ${e.message}`; }
    }
}
// ==================== [KERNEL PROTECTED END] ====================

// ============================================================
// 🩹 Patch Manager (神經補丁 - Fix Edition)
// ============================================================
// ==================== [KERNEL PROTECTED START] ====================
class PatchManager {
    static apply(originalCode, patch) {
        const protectedPattern = /\/\/ =+ \[KERNEL PROTECTED START\] =+([\s\S]*?)\/\/ =+ \[KERNEL PROTECTED END\] =+/g;
        let match;
        while ((match = protectedPattern.exec(originalCode)) !== null) {
            if (match[1].includes(patch.search)) throw new Error(`⛔ 權限拒絕：試圖修改系統核心禁區。`);
        }
        if (originalCode.includes(patch.search)) return originalCode.replace(patch.search, patch.replace);
        try {
            const escapeRegExp = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const fuzzySearch = escapeRegExp(patch.search).replace(/\s+/g, '[\\s\\n]*');
            const regex = new RegExp(fuzzySearch);
            if (regex.test(originalCode)) {
                console.log("⚠️ [PatchManager] 啟用模糊匹配模式。");
                return originalCode.replace(regex, patch.replace);
            }
        } catch (e) { console.warn("模糊匹配失敗:", e); }
        throw new Error(`❌ 找不到匹配代碼段落`);
    }
    static createTestClone(originalPath, patchContent) {
        try {
            const originalCode = fs.readFileSync(originalPath, 'utf-8');
            let patchedCode = originalCode;
            const patches = Array.isArray(patchContent) ? patchContent : [patchContent];
            patches.forEach(p => { patchedCode = this.apply(patchedCode, p); });
            const ext = path.extname(originalPath);
            const name = path.basename(originalPath, ext);
            const testFile = `${name}.test${ext}`;
            fs.writeFileSync(testFile, patchedCode, 'utf-8');
            return testFile;
        } catch (e) { throw new Error(`補丁應用失敗: ${e.message}`); }
    }
    static verify(filePath) {
        try {
            execSync(`node -c "${filePath}"`);
            if (filePath.includes('index.test.js')) {
                execSync(`node "${filePath}"`, { env: { ...process.env, GOLEM_TEST_MODE: 'true' }, timeout: 5000, stdio: 'pipe' });
            }
            console.log(`✅ [PatchManager] ${filePath} 驗證通過`);
            return true;
        } catch (e) {
            console.error(`❌ [PatchManager] 驗證失敗: ${e.message}`);
            try { fs.unlinkSync(filePath); console.log("🧹 已清理失效的測試檔案"); } catch (delErr) { }
            return false;
        }
    }
}
// ==================== [KERNEL PROTECTED END] ====================

// ============================================================
// 🛡️ Security Manager (安全審計)
// ============================================================
// ==================== [KERNEL PROTECTED START] ====================
class SecurityManager {
    constructor() {
        this.SAFE_COMMANDS = ['ls', 'dir', 'pwd', 'date', 'echo', 'cat', 'grep', 'find', 'whoami', 'tail', 'head', 'df', 'free', 'Get-ChildItem', 'Select-String', 'golem-check'];
        this.BLOCK_PATTERNS = [/rm\s+-rf\s+\//, /rd\s+\/s\s+\/q\s+[c-zC-Z]:\\$/, />\s*\/dev\/sd/, /:(){:|:&};:/, /mkfs/, /Format-Volume/, /dd\s+if=/, /chmod\s+[-]x\s+/];
    }
    assess(cmd) {
        const safeCmd = (cmd || "").trim();
        const baseCmd = safeCmd.split(/\s+/)[0];
        if (this.BLOCK_PATTERNS.some(regex => regex.test(safeCmd))) return { level: 'BLOCKED', reason: '毀滅性指令' };
        if (this.SAFE_COMMANDS.includes(baseCmd)) return { level: 'SAFE' };
        const dangerousOps = ['rm', 'mv', 'chmod', 'chown', 'sudo', 'su', 'reboot', 'shutdown', 'npm uninstall', 'Remove-Item', 'Stop-Computer'];
        if (dangerousOps.includes(baseCmd)) return { level: 'DANGER', reason: '高風險操作' };
        return { level: 'WARNING', reason: '需確認' };
    }
}
// ==================== [KERNEL PROTECTED END] ====================

// ============================================================
// 🔍 ToolScanner (工具自動探測器)
// ============================================================
class ToolScanner {
    static check(toolName) {
        const isWin = os.platform() === 'win32';
        const checkCmd = isWin ? `where ${toolName}` : `which ${toolName}`;
        try {
            const path = execSync(checkCmd, { encoding: 'utf-8', stdio: 'pipe' }).toString().trim().split('\n')[0];
            return `✅ **已安裝**: \`${toolName}\`\n路徑: ${path}`;
        } catch (e) {
            return `❌ **未安裝**: \`${toolName}\`\n(系統找不到此指令)`;
        }
    }
}

// ============================================================
// 📖 Help Manager (動態說明書) - v9.0 Enhanced
// ============================================================
class HelpManager {
    static getManual() {
        const source = Introspection.readSelf();
        const routerPattern = /text\.(?:startsWith|match)\(['"]\/?([a-zA-Z0-9_|]+)['"]\)/g;
        const foundCmds = new Set(['help', 'callme', 'patch', 'update', 'donate']);
        let match;
        while ((match = routerPattern.exec(source)) !== null) foundCmds.add(match[1].replace(/\|/g, '/').replace(/[\^\(\)]/g, ''));
        
        let skillList = "基礎系統操作";
        // ✨ [v9.0] 從 SkillManager 動態獲取技能列表
        try { 
            const dynamicSkills = skillManager.listSkills().map(s => s.name);
            if (dynamicSkills.length > 0) skillList = dynamicSkills.join(', ');
            else {
                // 回退到舊版 skills.js 檢查
                try { skillList = Object.keys(skills).filter(k => k !== 'persona' && k !== 'getSystemPrompt').join(', '); } catch (e) { }
            }
        } catch (e) { }

        return `
🤖 **Golem v9.0 (Ultimate Chronos + MultiAgent + WebSkillEngine)**
---------------------------
⚡ **Node.js**: Reflex Layer + Action Executor
🧠 **Web Gemini**: Infinite Context Brain
🔥 **KeyChain v2**: 智慧冷卻 + API 節流
🛡️ **Flood Guard**: 離線訊息過濾
🌗 **Dual-Memory**: ${cleanEnv(process.env.GOLEM_MEMORY_MODE || 'browser')} mode
🥪 **Sync Mode**: Envelope/Sandwich Lock (Reliable)
🚦 **Queue**: Debounce & Serialization Active
⏰ **Chronos**: Timeline Scheduler Active
🎭 **MultiAgent**: Interactive Collaboration System
✨ **Skill Engine**: Web-Based Generation Active
🔍 **Auto-Discovery**: Active
👁️ **OpticNerve**: Vision Enabled
🔌 **Neuro-Link**: CDP Network Interception Active
📡 **連線狀態**: TG(${CONFIG.TG_TOKEN ? '✅' : '⚪'}) / DC(${CONFIG.DC_TOKEN ? '✅' : '⚪'})

🛠️ **可用指令:**
${Array.from(foundCmds).map(c => `• \`/${c}\``).join('\n')}

✨ **技能指令 (Skill Engine):**
• \`/learn <描述>\` - 使用網頁大腦編寫新功能
• \`/export <名稱>\` - 分享您的技能
• \`/skills\` - 查看所有技能
• **匯入**: 直接貼上 \`GOLEM_SKILL::...\`

🧠 **技能模組:** ${skillList}

☕ **支持開發者:**
${CONFIG.DONATE_URL}
`;
    }
}

// ============================================================
// 🗝️ KeyChain & 🚑 DOM Doctor (已修復 AI 廢話導致崩潰問題)
// ============================================================
class KeyChain {
    constructor() {
        this.keys = CONFIG.API_KEYS;
        this.currentIndex = 0;
        // 🔥 [v8.7 保留] API 節流與冷卻機制
        this._lastCallTime = 0;
        this._minInterval = 2500;
        this._cooldownUntil = new Map();
        this._stats = new Map();
        this.keys.forEach(k => this._stats.set(k, { calls: 0, errors: 0, lastUsed: 0 }));
        console.log(`🗝️ [KeyChain v2] 已載入 ${this.keys.length} 把 API Key (節流: ${this._minInterval}ms)`);
    }

    markCooldown(key, durationMs = 15 * 60 * 1000) {
        this._cooldownUntil.set(key, Date.now() + durationMs);
        console.log(`🧊 [KeyChain] Key #${this.keys.indexOf(key)} 冷卻 ${Math.round(durationMs / 60000)} 分鐘`);
    }

    _isCooling(key, idx = null) {
        const until = this._cooldownUntil.get(key);
        if (!until) return false;
        if (Date.now() >= until) {
            this._cooldownUntil.delete(key);
            if (idx === null) idx = this.keys.indexOf(key);
            console.log(`✅ [KeyChain] Key #${idx} 冷卻解除`);
            return false;
        }
        return true;
    }

    async _throttle() {
        const now = Date.now();
        const timeSinceLast = now - this._lastCallTime;
        if (timeSinceLast < this._minInterval) {
            await new Promise(r => setTimeout(r, this._minInterval - timeSinceLast));
        }
        this._lastCallTime = Date.now();
    }

    async getKey() {
        if (this.keys.length === 0) return null;
        await this._throttle();
        for (let i = 0; i < this.keys.length; i++) {
            const idx = (this.currentIndex + i) % this.keys.length;
            const key = this.keys[idx];
            if (!this._isCooling(key, idx)) {
                this.currentIndex = (idx + 1) % this.keys.length;
                const stat = this._stats.get(key);
                if (stat) { stat.calls++; stat.lastUsed = Date.now(); }
                return key;
            }
        }
        console.warn('⚠️ [KeyChain] 所有 Key 都在冷卻中 (暫停服務)');
        return null;
    }

    recordError(key, error) {
        const stat = this._stats.get(key);
        if (stat) stat.errors++;
        if (error?.message?.includes('429') || error?.message?.includes('RESOURCE_EXHAUSTED')) {
            const isDaily = error.message.includes('per day');
            this.markCooldown(key, isDaily ? 15 * 60 * 1000 : 90 * 1000);
        }
    }

    getStatus() {
        const cooling = [];
        for (const [k, t] of this._cooldownUntil) {
            const remain = Math.max(0, Math.round((t - Date.now()) / 1000));
            if (remain > 0) cooling.push(`#${this.keys.indexOf(k)}(${remain}s)`);
        }
        return cooling.length > 0 ? cooling.join(', ') : '全部可用';
    }
}

class DOMDoctor {
    constructor() {
        this.keyChain = new KeyChain();
        this.cacheFile = path.join(process.cwd(), 'golem_selectors.json');
        this.defaults = {
            input: 'div[contenteditable="true"], rich-textarea > div, p[data-placeholder]',
            send: 'button[aria-label*="Send"], button[aria-label*="傳送"], span[data-icon="send"]',
            response: '.model-response-text, .message-content, .markdown, div[data-test-id="message-content"]'
        };
    }
    loadSelectors() {
        try {
            if (fs.existsSync(this.cacheFile)) {
                const cached = JSON.parse(fs.readFileSync(this.cacheFile, 'utf-8'));
                return { ...this.defaults, ...cached };
            }
        } catch (e) { }
        return { ...this.defaults };
    }
    saveSelectors(newSelectors) {
        try {
            const current = this.loadSelectors();
            const updated = { ...current, ...newSelectors };
            fs.writeFileSync(this.cacheFile, JSON.stringify(updated, null, 2));
            console.log("💾 [Doctor] Selector 已更新並存檔！");
        } catch (e) { }
    }
    async diagnose(htmlSnippet, targetType) {
        if (this.keyChain.keys.length === 0) return null;
        const hints = {
            'input': '目標是輸入框。⚠️ 注意：請忽略內層的 <p>, <span> 或 text node。請往上尋找最近的一個「容器 div」，它通常具備 contenteditable="true"、role="textbox" 或 class="ql-editor" 屬性。',
            'send': '目標是發送按鈕。⚠️ 注意：請找出外層的 <button> 或具備互動功能的 <mat-icon>，不要只選取裡面的 <svg> 或 <path>。特徵：aria-label="Send" 或 data-mat-icon-name="send"。',
            'response': '找尋 AI 回覆的文字氣泡。'
        };
        const targetDescription = hints[targetType] || targetType;
        console.log(`🚑 [Doctor] 啟動深層診斷: 目標 [${targetType}]...`);

        let safeHtml = htmlSnippet;
        if (htmlSnippet.length > 60000) {
            const head = htmlSnippet.substring(0, 5000);
            const tail = htmlSnippet.substring(htmlSnippet.length - 55000);
            safeHtml = `${head}\n\n\n\n${tail}`;
        }

        const prompt = `你是 Puppeteer 自動化專家。目前的 CSS Selector 失效。
請分析 HTML，找出目標: "${targetType}" (${targetDescription}) 的最佳 CSS Selector。

HTML 片段:
\`\`\`html
${safeHtml}
\`\`\`

規則：
1. 只回傳 JSON: {"selector": "your_css_selector"}
2. 選擇器必須具備高特異性 (Specificity)，但不要依賴隨機生成的 ID (如 #xc-123)。
3. 優先使用 id, name, role, aria-label, data-attribute。`;

        let attempts = 0;
        while (attempts < this.keyChain.keys.length) {
            try {
                const apiKey = await this.keyChain.getKey();
                if (!apiKey) {
                    console.warn("⚠️ [Doctor] 無可用 API Key，跳過診斷。");
                    return null;
                }
                const genAI = new GoogleGenerativeAI(apiKey);
                const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
                const result = await model.generateContent(prompt);
                const rawText = result.response.text().trim();

                let selector = "";
                try {
                    const jsonStr = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
                    const parsed = JSON.parse(jsonStr);
                    selector = parsed.selector;
                } catch (jsonErr) {
                    console.warn(`⚠️ [Doctor] JSON 解析失敗，嘗試暴力提取 (Raw: ${rawText.substring(0, 50)}...)`);
                    const lines = rawText.split('\n').filter(l => l.trim().length > 0);
                    const lastLine = lines[lines.length - 1].trim();
                    if (!lastLine.includes(' ')) selector = lastLine;
                }

                if (selector && selector.length > 0 && selector.length < 150 && !selector.includes('問題')) {
                    console.log(`✅ [Doctor] 診斷成功，新 Selector: ${selector}`);
                    return selector;
                } else {
                    console.warn(`⚠️ [Doctor] AI 提供的 Selector 無效或包含雜訊: ${selector}`);
                }
            } catch (e) {
                console.error(`❌ [Doctor] 診斷 API 錯誤: ${e.message}`);
                attempts++;
            }
        }
        return null;
    }
}

// ============================================================
// 🧠 Memory Drivers (雙模記憶驅動 + 排程擴充)
// ============================================================
class BrowserMemoryDriver {
    constructor(brain) { this.brain = brain; }
    async init() {
        if (this.brain.memoryPage) return;
        try {
            this.brain.memoryPage = await this.brain.browser.newPage();
            const memoryPath = 'file:///' + path.join(process.cwd(), 'memory.html').replace(/\\/g, '/');
            console.log(`🧠 [Memory:Browser] 正在掛載神經海馬迴: ${memoryPath}`);
            await this.brain.memoryPage.goto(memoryPath);
            await new Promise(r => setTimeout(r, 5000));
        } catch (e) { console.error("❌ [Memory:Browser] 啟動失敗:", e.message); }
    }
    async recall(query) {
        if (!this.brain.memoryPage) return [];
        return await this.brain.memoryPage.evaluate(async (txt) => {
            return window.queryMemory ? await window.queryMemory(txt) : [];
        }, query);
    }
    async memorize(text, metadata) {
        if (!this.brain.memoryPage) return;
        await this.brain.memoryPage.evaluate(async (t, m) => {
            if (window.addMemory) await window.addMemory(t, m);
        }, text, metadata);
    }
    async addSchedule(task, time) {
        if (!this.brain.memoryPage) return;
        await this.brain.memoryPage.evaluate(async (t, time) => {
            if (window.addSchedule) await window.addSchedule(t, time);
        }, task, time);
    }
    async checkDueTasks() {
        if (!this.brain.memoryPage) return [];
        return await this.brain.memoryPage.evaluate(async () => {
            return window.checkSchedule ? await window.checkSchedule() : [];
        });
    }
}

class SystemQmdDriver {
    constructor() {
        this.baseDir = path.join(process.cwd(), 'golem_memory', 'knowledge');
        if (!fs.existsSync(this.baseDir)) fs.mkdirSync(this.baseDir, { recursive: true });
        this.qmdCmd = 'qmd';
    }
    async init() {
        console.log("🔍 [Memory:Qmd] 啟動引擎探測...");
        try {
            const checkCmd = (c) => {
                try {
                    const findCmd = os.platform() === 'win32' ? `where ${c}` : `command -v ${c}`;
                    execSync(findCmd, { stdio: 'ignore', env: process.env });
                    return true;
                } catch (e) { return false; }
            };
            if (CONFIG.QMD_PATH !== 'qmd' && fs.existsSync(CONFIG.QMD_PATH)) this.qmdCmd = `"${CONFIG.QMD_PATH}"`;
            else if (checkCmd('qmd')) this.qmdCmd = 'qmd';
            else {
                const homeQmd = path.join(os.homedir(), '.bun', 'bin', 'qmd');
                if (fs.existsSync(homeQmd)) this.qmdCmd = `"${homeQmd}"`;
                else if (os.platform() !== 'win32') {
                    try {
                        const bashFound = execSync('bash -lc "which qmd"', { encoding: 'utf8', env: process.env }).trim();
                        if (bashFound) this.qmdCmd = `"${bashFound}"`;
                        else throw new Error();
                    } catch (e) { throw new Error("QMD_NOT_FOUND"); }
                } else throw new Error("QMD_NOT_FOUND");
            }
            console.log(`🧠 [Memory:Qmd] 引擎連線成功: ${this.qmdCmd}`);
            try {
                execSync(`${this.qmdCmd} collection add "${path.join(this.baseDir, '*.md')}" --name golem-core`, { stdio: 'ignore', env: process.env, shell: true });
            } catch (e) { }
        } catch (e) {
            console.error(`❌ [Memory:Qmd] 找不到 qmd。`);
            throw new Error("QMD_MISSING");
        }
    }
    async recall(query) {
        return new Promise((resolve) => {
            const safeQuery = query.replace(/"/g, '\\"');
            const cmd = `${this.qmdCmd} search golem-core "${safeQuery}" --hybrid --limit 3`;
            exec(cmd, (err, stdout) => {
                if (err) { resolve([]); return; }
                const result = stdout.trim();
                if (result) resolve([{ text: result, score: 0.95, metadata: { source: 'qmd' } }]);
                else resolve([]);
            });
        });
    }
    async memorize(text, metadata) {
        const filename = `mem_${Date.now()}.md`;
        const filepath = path.join(this.baseDir, filename);
        fs.writeFileSync(filepath, `---\ndate: ${new Date().toISOString()}\ntype: ${metadata.type || 'general'}\n---\n${text}`, 'utf8');
        exec(`${this.qmdCmd} embed golem-core "${filepath}"`, (err) => { if (err) console.error("⚠️ [Memory:Qmd] 索引失敗"); });
    }
    async addSchedule(task, time) { console.warn("⚠️ QMD 模式不支援排程"); }
    async checkDueTasks() { return []; }
}

class SystemNativeDriver {
    constructor() {
        this.baseDir = path.join(process.cwd(), 'golem_memory', 'knowledge');
        if (!fs.existsSync(this.baseDir)) fs.mkdirSync(this.baseDir, { recursive: true });
    }
    async init() { console.log("🧠 [Memory:Native] 系統原生核心已啟動"); }
    async recall(query) {
        try {
            const files = fs.readdirSync(this.baseDir).filter(f => f.endsWith('.md'));
            const results = [];
            for (const file of files) {
                const content = fs.readFileSync(path.join(this.baseDir, file), 'utf8');
                const keywords = query.toLowerCase().split(/\s+/);
                let score = 0;
                keywords.forEach(k => { if (content.toLowerCase().includes(k)) score += 1; });
                if (score > 0) results.push({ text: content.replace(/---[\s\S]*?---/, '').trim(), score: score / keywords.length, metadata: { source: file } });
            }
            return results.sort((a, b) => b.score - a.score).slice(0, 3);
        } catch (e) { return []; }
    }
    async memorize(text, metadata) {
        const filename = `mem_${Date.now()}.md`;
        const filepath = path.join(this.baseDir, filename);
        fs.writeFileSync(filepath, `---\ndate: ${new Date().toISOString()}\ntype: ${metadata.type || 'general'}\n---\n${text}`, 'utf8');
    }
    async addSchedule(task, time) { console.warn("⚠️ Native 模式不支援排程"); }
    async checkDueTasks() { return []; }
}

// ============================================================
// 🧠 Golem Brain (Web Gemini) - Dual-Engine + Titan Protocol
// ============================================================
function getSystemFingerprint() { return `OS: ${os.platform()} | Arch: ${os.arch()} | Mode: ${cleanEnv(process.env.GOLEM_MEMORY_MODE || 'browser')}`; }

class GolemBrain {
    constructor() {
        this.browser = null;
        this.page = null;
        this.memoryPage = null;
        this.doctor = new DOMDoctor();
        this.selectors = this.doctor.loadSelectors();
        this.cdpSession = null;

        const mode = cleanEnv(process.env.GOLEM_MEMORY_MODE || 'browser').toLowerCase();
        console.log(`⚙️ [System] 記憶引擎模式: ${mode.toUpperCase()}`);
        if (mode === 'qmd') this.memoryDriver = new SystemQmdDriver();
        else if (mode === 'native' || mode === 'system') this.memoryDriver = new SystemNativeDriver();
        else this.memoryDriver = new BrowserMemoryDriver(this);

        this.chatLogFile = path.join(__dirname, 'logs', 'agent_chat.jsonl');
        // Ensure directory exists
        if (!fs.existsSync(path.dirname(this.chatLogFile))) {
            fs.mkdirSync(path.dirname(this.chatLogFile), { recursive: true });
        }

        // Retention: Clean logs older than 1 day
        this._cleanupLogs(24 * 60 * 60 * 1000);
    }

    _cleanupLogs(maxAgeMs) {
        if (!fs.existsSync(this.chatLogFile)) return;
        try {
            const now = Date.now();
            const content = fs.readFileSync(this.chatLogFile, 'utf8');
            const lines = content.trim().split('\n');
            const keptLines = lines.filter(line => {
                try {
                    const entry = JSON.parse(line);
                    return (now - entry.timestamp) < maxAgeMs;
                } catch (e) { return false; }
            });

            if (keptLines.length < lines.length) {
                fs.writeFileSync(this.chatLogFile, keptLines.join('\n') + '\n');
                console.log(`🧹 [System] 已清理過期對話日誌 (${lines.length - keptLines.length} 條)`);
            }
        } catch (e) {
            console.error("Cleanup logs failed:", e);
        }
    }

    _appendChatLog(entry) {
        try {
            fs.appendFileSync(this.chatLogFile, JSON.stringify(entry) + '\n');
        } catch (e) {
            console.error("Failed to write chat log:", e);
        }
    }

    async init(forceReload = false) {
        if (this.browser && !forceReload) return;
        let isNewSession = false;
        if (!this.browser) {
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
            isNewSession = true;
        }
        try { await this.memoryDriver.init(); } catch (e) {
            console.warn("🔄 [System] 記憶引擎降級為 Browser/Native...");
            this.memoryDriver = new BrowserMemoryDriver(this);
            await this.memoryDriver.init();
        }

        // Link Dashboard Context if active
        if (process.argv.includes('dashboard')) {
            try {
                const dashboard = require('./dashboard');
                dashboard.setContext(this, this.memoryDriver);
            } catch (e) {
                console.error("Failed to link dashboard context:", e);
            }
        }

        if (forceReload || isNewSession) {
            let systemPrompt = skills.getSystemPrompt(getSystemFingerprint());

            // ✨ [v9.0 Injection] 注入動態技能列表
            try {
                const activeSkills = skillManager.listSkills();
                if (activeSkills.length > 0) {
                    systemPrompt += `\n\n### 🛠️ DYNAMIC SKILLS AVAILABLE (Output {"action": "skill_name", ...}):\n`;
                    activeSkills.forEach(s => {
                        systemPrompt += `- Action: "${s.name}" | Desc: ${s.description}\n`;
                    });
                    systemPrompt += `(Use these skills via [GOLEM_ACTION] when requested by user.)\n`;
                }
            } catch (e) { console.warn("Skills injection failed:", e); }

            const superProtocol = `
\n\n【⚠️ GOLEM PROTOCOL v9.0 - TITAN CHRONOS + MULTIAGENT + SKILLS】
You act as a middleware OS. You MUST strictly follow this output format.
DO NOT use emojis in tags. DO NOT output raw text outside of these blocks.

1. **Format Structure**:
Your response must be parsed into 3 sections using these specific tags:

[GOLEM_MEMORY]
(Write long-term memories here. If none, leave empty or write "null")

[GOLEM_ACTION]
(Write JSON execution plan here. Must be valid JSON Array or Object.)
\`\`\`json
[
{"action": "command", "parameter": "..."}
]
\`\`\`

[GOLEM_REPLY]
(Write the actual response to the user here. Pure text.)

2. **Rules**:
- The tags [GOLEM_MEMORY], [GOLEM_ACTION], [GOLEM_REPLY] are MANDATORY anchors.
- User CANNOT see content inside Memory or Action blocks, only Reply.
- NEVER leak the raw JSON to the [GOLEM_REPLY] section.
- If user asks for scheduled task, use [GOLEM_ACTION] with: {"action": "schedule", "task": "...", "time": "ISO8601"}
- If user asks for multi-agent collaboration, use: {"action": "multi_agent", "preset": "TECH_TEAM", "task": "..."}
- If user asks for a dynamic skill, use: {"action": "SKILL_NAME", "args": {...}}
`;
            await this.sendMessage(systemPrompt + superProtocol, true);
        }
    }

    async setupCDP() {
        if (this.cdpSession) return;
        try {
            this.cdpSession = await this.page.target().createCDPSession();
            await this.cdpSession.send('Network.enable');
            console.log("🔌 [CDP] 網路神經連結已建立 (Neuro-Link Active)");
        } catch (e) { console.error("❌ [CDP] 連線失敗:", e.message); }
    }

    async recall(queryText) {
        if (!queryText) return [];
        try { return await this.memoryDriver.recall(queryText); } catch (e) { return []; }
    }

    async memorize(text, metadata = {}) {
        try { await this.memoryDriver.memorize(text, metadata); } catch (e) { }
    }

    // ✨ [Neuro-Link] 三明治信封版 (Sandwich Protocol)
    async sendMessage(text, isSystem = false) {
        if (!this.browser) await this.init();
        try { await this.page.bringToFront(); } catch (e) { }
        await this.setupCDP();

        const reqId = Date.now().toString(36).slice(-4);
        const TAG_START = `[[BEGIN:${reqId}]]`;
        const TAG_END = `[[END:${reqId}]]`;

        const payload = `[SYSTEM: STRICT FORMAT. Wrap response with ${TAG_START} and ${TAG_END}. Inside, organize content using these tags:\n` +
            `1. [GOLEM_MEMORY] (Optional)\n` +
            `2. [GOLEM_ACTION] (Optional)\n` +
            `3. [GOLEM_REPLY] (Required)\n` +
            `Do not output raw text outside tags.]\n\n${text}`;

        console.log(`📡 [Brain] 發送訊號: ${reqId} (三流全激活模式)`);

        const tryInteract = async (sel, retryCount = 0) => {
            if (retryCount > 3) throw new Error("🔥 DOM Doctor 修復失敗，請檢查網路或 HTML 結構大幅變更。");

            try {
                const baseline = await this.page.evaluate((s) => {
                    const bubbles = document.querySelectorAll(s);
                    return bubbles.length > 0 ? bubbles[bubbles.length - 1].innerText : "";
                }, sel.response);

                let inputEl = await this.page.$(sel.input);
                if (!inputEl) {
                    console.log("🚑 找不到輸入框，呼叫 DOM Doctor...");
                    const html = await this.page.content();
                    const newSel = await this.doctor.diagnose(html, 'input');
                    if (newSel) {
                        this.selectors.input = newSel;
                        this.doctor.saveSelectors(this.selectors);
                        return tryInteract(this.selectors, retryCount + 1);
                    }
                    throw new Error(`無法修復輸入框 Selector`);
                }

                await this.page.evaluate((s, t) => {
                    const el = document.querySelector(s);
                    el.focus();
                    document.execCommand('insertText', false, t);
                }, sel.input, payload);

                await new Promise(r => setTimeout(r, 800));

                let sendEl = await this.page.$(sel.send);
                if (!sendEl) {
                    console.log("🚑 找不到發送按鈕，呼叫 DOM Doctor...");
                    const html = await this.page.content();
                    const newSel = await this.doctor.diagnose(html, 'send');
                    if (newSel) {
                        this.selectors.send = newSel;
                        this.doctor.saveSelectors(this.selectors);
                        return tryInteract(this.selectors, retryCount + 1);
                    }
                    console.log("⚠️ 無法修復按鈕，嘗試使用 Enter 鍵發送...");
                    await this.page.keyboard.press('Enter');
                } else {
                    try {
                        await this.page.waitForSelector(sel.send, { timeout: 2000 });
                        await this.page.click(sel.send);
                    } catch (e) { await this.page.keyboard.press('Enter'); }
                }

                if (isSystem) { await new Promise(r => setTimeout(r, 2000)); return ""; }

                console.log(`⚡ [Brain] 等待信封完整性 (${TAG_START} ... ${TAG_END})...`);

                const finalResponse = await this.page.evaluate(async (selector, startTag, endTag, oldText) => {
                    return new Promise((resolve) => {
                        const startTime = Date.now();
                        let stableCount = 0;
                        let lastCheckText = "";

                        const check = () => {
                            const bubbles = document.querySelectorAll(selector);
                            if (bubbles.length === 0) { setTimeout(check, 500); return; }

                            const currentLastBubble = bubbles[bubbles.length - 1];
                            const rawText = currentLastBubble.innerText || "";
                            const startIndex = rawText.indexOf(startTag);

                            if (startIndex !== -1) {
                                const endIndex = rawText.indexOf(endTag);
                                if (endIndex !== -1 && endIndex > startIndex) {
                                    const content = rawText.substring(startIndex + startTag.length, endIndex).trim();
                                    resolve({ status: 'ENVELOPE_COMPLETE', text: content });
                                    return;
                                }
                                if (rawText === lastCheckText && rawText.length > lastCheckText.length) {
                                    stableCount = 0;
                                } else if (rawText === lastCheckText) {
                                    stableCount++;
                                } else {
                                    stableCount = 0;
                                }
                                lastCheckText = rawText;
                                if (stableCount > 5) { // 等待時間
                                    const content = rawText.substring(startIndex + startTag.length).trim();
                                    resolve({ status: 'ENVELOPE_TRUNCATED', text: content });
                                    return;
                                }
                            } else if (rawText !== oldText && !rawText.includes('SYSTEM: Please WRAP')) {
                                if (rawText === lastCheckText && rawText.length > 5) stableCount++;
                                else stableCount = 0;
                                lastCheckText = rawText;
                                if (stableCount > 5) { resolve({ status: 'FALLBACK_DIFF', text: rawText }); return; }
                            }

                            if (Date.now() - startTime > 120000) { resolve({ status: 'TIMEOUT', text: '' }); return; } // Web Skill 生成可能需要較長時間
                            setTimeout(check, 500);
                        };
                        check();
                    });
                }, sel.response, TAG_START, TAG_END, baseline);

                if (finalResponse.status === 'TIMEOUT') throw new Error("等待回應超時");

                console.log(`🏁 [Brain] 捕獲: ${finalResponse.status} | 長度: ${finalResponse.text.length}`);
                let cleanText = finalResponse.text
                    .replace(TAG_START, '')
                    .replace(TAG_END, '')
                    .replace(/\[SYSTEM: Please WRAP.*?\]/, '')
                    .trim();
                return cleanText;

            } catch (e) {
                console.warn(`⚠️ [Brain] 互動失敗: ${e.message}`);
                if (retryCount === 0) {
                    console.log('🩺 [Brain] 啟動 DOM Doctor 進行 Response 診斷...');
                    const htmlDump = await this.page.content();
                    const newSelector = await this.doctor.diagnose(htmlDump, 'response');
                    if (newSelector) {
                        this.selectors.response = newSelector;
                        this.doctor.saveSelectors(this.selectors);
                        return await tryInteract(this.selectors, retryCount + 1);
                    }
                }
                throw e;
            }
        };
        return await tryInteract(this.selectors);
    }
}

// ============================================================
// 🎭 InteractiveMultiAgent (v9.0 New Feature)
// ============================================================
class InteractiveMultiAgent {
    constructor(brain) {
        this.brain = brain;
        this.activeConversation = null;
    }

    async startConversation(ctx, task, agentConfigs, options = {}) {
        const conversationId = `conv_${Date.now()}`;
        this.activeConversation = {
            id: conversationId,
            chatId: ctx.chatId,
            task: task,
            agents: agentConfigs,
            agentMap: new Map(agentConfigs.map(a => [a.name.toLowerCase(), a])),
            context: '',
            round: 0,
            maxRounds: options.maxRounds || 3,
            messages: [],
            sharedMemory: [],
            status: 'active',
            waitingForUser: false,
            interruptRequested: false
        };

        const teamIntro = agentConfigs.map((agent, idx) =>
            `${idx + 1}. 🤖 **${agent.name}** - ${agent.role}\n   *${agent.expertise.slice(0, 2).join('、')}*`
        ).join('\n');

        await ctx.reply(
            `🎭 **互動式多 Agent 協作啟動**\n\n` +
            `📋 **任務**: ${task}\n\n` +
            `👥 **團隊成員**:\n${teamIntro}\n\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `💡 **互動指令**:\n` +
            `• 每輪結束後可發言（30秒內輸入）\n` +
            `• 用 \`@Agent名\` 指定某個成員發言\n` +
            `• 輸入 \`中斷\` 暫停討論（稍後可恢復）\n` +
            `• 輸入 \`結束\` 提前結束並生成總結\n` +
            `• 輸入 \`繼續\` 跳過發言\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
        );

        await this._interactiveLoop(ctx);

        if (this.activeConversation.status !== 'interrupted') {
            await this._generateSummary(ctx);
        }
        this._cleanup();
    }

    async _interactiveLoop(ctx) {
        const conv = this.activeConversation;
        conv.context = `【團隊任務】${conv.task}\n【成員】${conv.agents.map(a => a.name).join('、')}\n\n【對話記錄】\n`;

        for (let round = 1; round <= conv.maxRounds; round++) {
            if (conv.status === 'completed' || conv.status === 'interrupted') break;
            conv.round = round;
            await ctx.reply(`\n**━━━ Round ${round} / ${conv.maxRounds} ━━━**`);

            for (const agent of conv.agents) {
                if (conv.status !== 'active') break;
                await this._agentSpeak(ctx, agent, round);
                await this._delay(1500);
            }

            if (conv.status === 'active' && round < conv.maxRounds) {
                const userAction = await this._userTurn(ctx, round);
                if (userAction === 'END') {
                    conv.status = 'completed';
                    await ctx.reply(`✅ _會議已結束，正在生成總結..._`);
                    break;
                } else if (userAction === 'INTERRUPT') {
                    conv.status = 'interrupted';
                    await ctx.reply(
                        `⏸️ **會議已暫停**\n\n` +
                        `💾 當前進度已保存 (Round ${round})\n` +
                        `📊 已有 ${conv.messages.length} 則發言\n\n` +
                        `輸入「恢復會議」可繼續討論`
                    );
                    return;
                }
            }

            if (this._checkEarlyConsensus(conv.messages)) {
                await ctx.reply(`\n✅ _團隊已達成共識，提前結束討論_`);
                conv.status = 'completed';
                break;
            }
        }
        if (conv.status === 'active') {
            conv.status = 'completed';
        }
    }

    async _agentSpeak(ctx, agent, round) {
        const conv = this.activeConversation;
        try {
            await ctx.sendTyping();
            const rolePrompt = this._buildProtocolPrompt(agent, round);
            const rawResponse = await this.brain.sendMessage(rolePrompt);
            const parsed = await this._parseAgentOutput(rawResponse, agent);

            if (parsed.memories.length > 0) {
                for (const memory of parsed.memories) {
                    conv.sharedMemory.push({
                        agent: agent.name,
                        content: memory,
                        round: round,
                        timestamp: Date.now()
                    });
                }
                console.log(`[MultiAgent] ${agent.name} 寫入 ${parsed.memories.length} 條記憶`);
            }

            if (parsed.actions.length > 0) {
                await ctx.reply(`⚡ _${agent.name} 正在執行操作..._`);
                for (const action of parsed.actions) {
                    if (this._isAllowedAction(action)) {
                        await this._executeAgentAction(ctx, action, agent);
                    }
                }
            }

            const message = {
                round: round,
                speaker: agent.name,
                role: agent.role,
                type: 'agent',
                content: parsed.reply,
                hadMemory: parsed.memories.length > 0,
                hadAction: parsed.actions.length > 0,
                timestamp: Date.now()
            };
            conv.messages.push(message);
            conv.context += `[Round ${round}] ${agent.name}: ${parsed.reply}\n`;

            const badges = [];
            if (parsed.memories.length > 0) badges.push('🧠');
            if (parsed.actions.length > 0) badges.push('⚡');

            await ctx.reply(
                `🤖 **${agent.name}** _(${agent.role})_ ${badges.join(' ')}\n` +
                `${parsed.reply}`
            );
            console.log(`[MultiAgent] [${agent.name}] ${parsed.reply.replace(/\n/g, ' ')}`);
            this.brain._appendChatLog({
                timestamp: Date.now(),
                sender: agent.name,
                content: parsed.reply,
                type: 'agent',
                role: agent.role,
                isSystem: false
            });
        } catch (e) {
            console.error(`[InteractiveMultiAgent] ${agent.name} 發言失敗:`, e.message);
            await ctx.reply(`⚠️ ${agent.name} 暫時無法發言`);
        }
    }

    async _userTurn(ctx, round) {
        const conv = this.activeConversation;
        conv.waitingForUser = true;
        await ctx.reply(
            `\n💬 **輪到您發言** _(30秒內輸入，或輸入「繼續」跳過)_\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
        );
        const userInput = await this._waitForUserInput(ctx, 30000);
        conv.waitingForUser = false;
        if (!userInput) {
            await ctx.reply(`⏱️ _超時，自動繼續下一輪_`);
            return 'CONTINUE';
        }
        const input = userInput.trim();
        const lowerInput = input.toLowerCase();

        if (['繼續', 'continue', 'skip', 'c', 'next'].includes(lowerInput)) return 'CONTINUE';
        if (['結束', 'end', 'stop', 'finish', '結束會議'].includes(lowerInput)) return 'END';
        if (['中斷', 'interrupt', 'pause', 'break', '暫停'].includes(lowerInput)) return 'INTERRUPT';

        const mentionMatch = input.match(/@(\w+)/gi);
        if (mentionMatch) {
            await this._handleMention(ctx, input, mentionMatch, round);
        } else {
            await this._recordUserMessage(ctx, input, round);
        }
        return 'CONTINUE';
    }

    async _handleMention(ctx, input, mentions, round) {
        const conv = this.activeConversation;
        await ctx.reply(`👤 **您的發言**\n${input}`);
        console.log(`[MultiAgent] [User] ${input.replace(/\n/g, ' ')}`);
        this.brain._appendChatLog({
            timestamp: Date.now(),
            sender: 'User',
            content: input,
            type: 'user',
            role: 'User',
            isSystem: false
        });
        conv.messages.push({
            round: round,
            speaker: '您',
            role: 'User',
            type: 'user',
            content: input,
            timestamp: Date.now()
        });
        conv.context += `[用戶]: ${input}\n`;

        for (const mention of mentions) {
            const agentName = mention.substring(1).toLowerCase();
            const agent = conv.agentMap.get(agentName);
            if (agent) {
                await ctx.reply(`\n🎤 _邀請 ${agent.name} 回應..._`);
                await this._delay(1000);
                await this._agentRespondToUser(ctx, agent, input, round);
            } else {
                const availableAgents = Array.from(conv.agentMap.keys()).join('、');
                await ctx.reply(
                    `⚠️ 找不到 Agent「${mention.substring(1)}」\n` +
                    `可用成員：${availableAgents}`
                );
            }
        }
    }

    async _agentRespondToUser(ctx, agent, userMessage, round) {
        const conv = this.activeConversation;
        try {
            await ctx.sendTyping();
            const prompt = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【系統指令：用戶詢問回應】
你是 ${agent.name} (${agent.role})，性格：${agent.personality}
【當前情境】
團隊正在討論：${conv.task}
【對話歷史】
${conv.context}
【用戶剛才對你說】
${userMessage}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
請按照 Titan Protocol 格式回應用戶：
[GOLEM_MEMORY]
（如果用戶提供了重要資訊）
[GOLEM_REPLY]
（直接回應用戶的問題，保持你的角色性格，2-3句話）
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;
            const rawResponse = await this.brain.sendMessage(prompt);
            const parsed = await this._parseAgentOutput(rawResponse, agent);
            if (parsed.memories.length > 0) {
                for (const memory of parsed.memories) {
                    conv.sharedMemory.push({
                        agent: agent.name,
                        content: memory,
                        round: round,
                        source: 'user_interaction'
                    });
                }
            }
            conv.messages.push({
                round: round,
                speaker: agent.name,
                role: agent.role,
                type: 'agent_response',
                content: parsed.reply,
                replyTo: 'user',
                timestamp: Date.now()
            });
            conv.context += `[${agent.name} 回應用戶]: ${parsed.reply}\n`;
            await ctx.reply(
                `🤖 **${agent.name}** _(回應您)_ ${parsed.memories.length > 0 ? '🧠' : ''}\n` +
                `${parsed.reply}`
            );
        } catch (e) {
            console.error(`[InteractiveMultiAgent] ${agent.name} 回應失敗:`, e.message);
            await ctx.reply(`⚠️ ${agent.name} 無法回應`);
        }
    }

    async _recordUserMessage(ctx, input, round) {
        const conv = this.activeConversation;
        await ctx.reply(`👤 **您的發言已加入討論**\n${input}`);
        console.log(`[MultiAgent] [User] ${input.replace(/\n/g, ' ')}`);
        this.brain._appendChatLog({
            timestamp: Date.now(),
            sender: 'User',
            content: input,
            type: 'user',
            role: 'User',
            isSystem: false
        });
        conv.messages.push({
            round: round,
            speaker: '您',
            role: 'User',
            type: 'user',
            content: input,
            timestamp: Date.now()
        });
        conv.context += `[用戶]: ${input}\n`;
    }

    async _waitForUserInput(ctx, timeout) {
        return new Promise((resolve) => {
            const timeoutId = setTimeout(() => {
                this._removeInputListener(ctx.chatId);
                resolve(null);
            }, timeout);
            this._registerInputListener(ctx.chatId, (input) => {
                clearTimeout(timeoutId);
                this._removeInputListener(ctx.chatId);
                resolve(input);
            });
        });
    }

    _registerInputListener(chatId, callback) {
        if (!global.multiAgentListeners) global.multiAgentListeners = new Map();
        global.multiAgentListeners.set(chatId, callback);
        console.log(`[InteractiveMultiAgent] 監聽器已註冊: ${chatId}`);
    }

    _removeInputListener(chatId) {
        if (global.multiAgentListeners) {
            global.multiAgentListeners.delete(chatId);
            console.log(`[InteractiveMultiAgent] 監聽器已移除: ${chatId}`);
        }
    }

    static canResume(chatId) {
        return global.pausedConversations && global.pausedConversations.has(chatId);
    }

    static async resumeConversation(ctx, brain) {
        if (!global.pausedConversations || !global.pausedConversations.has(ctx.chatId)) {
            await ctx.reply('⚠️ 沒有暫停的會議可以恢復');
            return;
        }
        const savedConv = global.pausedConversations.get(ctx.chatId);
        global.pausedConversations.delete(ctx.chatId);
        await ctx.reply(
            `▶️ **恢復會議**\n\n` +
            `📋 任務: ${savedConv.task}\n` +
            `📊 已有 ${savedConv.messages.length} 則發言\n` +
            `🔄 從 Round ${savedConv.round + 1} 繼續...\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
        );
        const instance = new InteractiveMultiAgent(brain);
        instance.activeConversation = savedConv;
        instance.activeConversation.status = 'active';
        await instance._interactiveLoop(ctx);
        await instance._generateSummary(ctx);
        instance._cleanup();
    }

    _cleanup() {
        const conv = this.activeConversation;
        if (conv.status === 'interrupted') {
            if (!global.pausedConversations) global.pausedConversations = new Map();
            global.pausedConversations.set(conv.chatId, conv);
            console.log(`[InteractiveMultiAgent] 會議已暫停並保存: ${conv.chatId}`);
        }
        this._removeInputListener(conv.chatId);
        this.activeConversation = null;
    }

    _buildProtocolPrompt(agent, round) {
        const conv = this.activeConversation;
        let sharedMemoryContext = '';
        if (conv.sharedMemory.length > 0) {
            const recentMemories = conv.sharedMemory.slice(-5);
            sharedMemoryContext = '\n【團隊共享記憶】\n' +
                recentMemories.map(m => `- [${m.agent}] ${m.content}`).join('\n') + '\n';
        }
        const isLastRound = round >= conv.maxRounds;
        return `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【系統指令：多 Agent 協作模式】
🎭 **你的角色**：
- 身份：${agent.name}
- 職位：${agent.role}
- 性格：${agent.personality}
- 專長：${agent.expertise.join('、')}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【當前情境】
任務："${conv.task}"
成員：${conv.agents.map(a => a.name).join('、')} + 用戶
進度：第 ${round} / ${conv.maxRounds} 輪
【對話歷史】
${conv.context}
${sharedMemoryContext}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【輸出格式 - Titan Protocol】
[GOLEM_MEMORY]
（記錄重要資訊：決策、數據、共識等）
[GOLEM_REPLY]
${round === 1
                ? '提出你的專業建議和初步想法'
                : '回應其他成員的觀點，可以用 @成員名 指定回應對象'
            }
${isLastRound ? '\n⚠️ 這是最後一輪，請給出最終結論！' : ''}
（保持簡潔：2-3句話，50-80字）
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
請以 ${agent.name} 的身份發言：
`;
    }

    async _parseAgentOutput(rawResponse, agent) {
        const result = { memories: [], actions: [], reply: '' };
        const memoryRegex = /\[GOLEM_MEMORY\]([\s\S]*?)(?=\[GOLEM_|$)/i;
        const memoryMatch = rawResponse.match(memoryRegex);
        if (memoryMatch) {
            result.memories = memoryMatch[1]
                .trim().split('\n').map(line => line.trim())
                .filter(line => line && !line.startsWith('[') && line.length > 5);
        }
        const actionRegex = /\[GOLEM_ACTION\]([\s\S]*?)(?=\[GOLEM_|$)/i;
        const actionMatch = rawResponse.match(actionRegex);
        if (actionMatch) {
            const jsonMatches = actionMatch[1].match(/\{[\s\S]*?\}/g) || [];
            for (const jsonStr of jsonMatches) {
                try {
                    const action = JSON.parse(jsonStr);
                    action._agent = agent.name;
                    result.actions.push(action);
                } catch (e) { }
            }
        }
        const replyRegex = /\[GOLEM_REPLY\]([\s\S]*?)(?=\[GOLEM_|$)/i;
        const replyMatch = rawResponse.match(replyRegex);
        if (replyMatch) {
            result.reply = replyMatch[1].trim();
        } else {
            result.reply = rawResponse
                .replace(/\[GOLEM_MEMORY\][\s\S]*?(?=\[GOLEM_|$)/gi, '')
                .replace(/\[GOLEM_ACTION\][\s\S]*?(?=\[GOLEM_|$)/gi, '')
                .trim();
        }
        result.reply = this._cleanResponse(result.reply, agent.name);
        return result;
    }

    _cleanResponse(response, agentName) {
        let cleaned = response.trim();
        const prefixes = [`${agentName}:`, `${agentName}：`, `**${agentName}**:`, `[${agentName}]`];
        for (const prefix of prefixes) {
            if (cleaned.startsWith(prefix)) {
                cleaned = cleaned.substring(prefix.length).trim();
            }
        }
        cleaned = cleaned.replace(/^>\s*/gm, '');
        if (cleaned.length > 300) cleaned = cleaned.substring(0, 297) + '...';
        return cleaned;
    }

    _isAllowedAction(action) {
        const allowed = ['search', 'calculate', 'translate'];
        const forbidden = ['shell', 'file_write', 'patch'];
        const actionType = action.action || action.type;
        if (forbidden.includes(actionType)) return false;
        return allowed.includes(actionType);
    }

    async _executeAgentAction(ctx, action, agent) {
        console.log(`[MultiAgent] ${agent.name} 執行 Action:`, action.action);
    }

    _checkEarlyConsensus(messages) {
        if (messages.length < 6) return false;
        const recent = messages.slice(-3);
        const keywords = ['達成共識', '就這樣決定', '沒問題', '我同意', '就照這個方案'];
        return recent.some(msg => keywords.some(kw => msg.content.includes(kw)));
    }

    async _generateSummary(ctx) {
        const conv = this.activeConversation;
        await ctx.reply(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n🎯 **正在整合團隊意見...**`);
        const memoryContext = conv.sharedMemory.length > 0
            ? '\n【團隊記憶庫】\n' + conv.sharedMemory.map(m => `- ${m.content}`).join('\n') : '';
        const summaryPrompt = `
【系統指令：會議總結】
整合以下討論，生成專業總結。
【任務】${conv.task}
【成員】${conv.agents.map(a => `${a.name}(${a.role})`).join('、')} + 用戶
【完整討論】
${conv.context}
${memoryContext}
【統計】
- 發言數: ${conv.messages.length}
- 輪數: ${conv.round}
- 記憶: ${conv.sharedMemory.length} 條
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
請按格式輸出：
[GOLEM_MEMORY]
（最重要的 3-5 條決策）
[GOLEM_REPLY]
## 核心結論
（2-3句話）
## 關鍵決策
- 決策1
- 決策2
## 後續行動
- 行動1
- 行動2
`;
        try {
            const rawSummary = await this.brain.sendMessage(summaryPrompt);
            const parsed = await this._parseAgentOutput(rawSummary, { name: 'Master' });
            await ctx.reply(
                `🎯 **團隊總結報告**\n\n${parsed.reply}\n\n` +
                `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                `📊 統計: ${conv.messages.length} 則發言 / ${conv.round} 輪對話 / ${conv.sharedMemory.length} 條記憶`
            );
        } catch (e) {
            console.error('[InteractiveMultiAgent] 總結失敗:', e.message);
            await ctx.reply('⚠️ 總結生成失敗');
        }
    }
    _delay(ms) { return new Promise(r => setTimeout(r, ms)); }
}

InteractiveMultiAgent.PRESETS = {
    TECH_TEAM: [
        { name: 'Alex', role: '前端工程師', personality: '注重 UX，追求美感', expertise: ['React', 'Next.js', 'UI/UX', 'CSS'] },
        { name: 'Bob', role: '後端工程師', personality: '謹慎務實，重視安全', expertise: ['Node.js', 'Database', 'API', '系統架構'] },
        { name: 'Carol', role: '產品經理', personality: '用戶導向，商業思維', expertise: ['需求分析', '產品規劃', '市場策略'] }
    ],
    DEBATE_TEAM: [
        { name: 'Devil', role: '魔鬼代言人', personality: '批判性思維，挑戰假設', expertise: ['風險分析', '邏輯辯證'] },
        { name: 'Angel', role: '樂觀主義者', personality: '正向思考，尋找機會', expertise: ['願景規劃', '機會挖掘'] },
        { name: 'Judge', role: '中立評審', personality: '理性客觀，平衡觀點', expertise: ['決策分析', '綜合評估'] }
    ],
    CREATIVE_TEAM: [
        { name: 'Writer', role: '文案創作者', personality: '富有想像力', expertise: ['故事撰寫', '文案設計', '內容策略'] },
        { name: 'Designer', role: '視覺設計師', personality: '藝術感強', expertise: ['平面設計', '品牌形象'] },
        { name: 'Strategist', role: '策略顧問', personality: '邏輯清晰', expertise: ['市場分析', '策略規劃'] }
    ],
    BUSINESS_TEAM: [
        { name: 'Finance', role: '財務顧問', personality: '數字敏銳', expertise: ['財務規劃', '成本分析', '投資評估'] },
        { name: 'Marketing', role: '行銷專家', personality: '創意豐富', expertise: ['品牌策略', '用戶增長', '市場推廣'] },
        { name: 'Operations', role: '營運專家', personality: '注重執行', expertise: ['流程設計', '效率提升'] }
    ]
};

// ============================================================
// ⚡ ResponseParser (JSON 解析器 - 寬鬆版 + 集中化)
// ============================================================
class ResponseParser {
    static parse(raw) {
        const parsed = { memory: null, actions: [], reply: "" };
        const SECTION_REGEX = /(?:\s*\[\s*)?GOLEM_(MEMORY|ACTION|REPLY)(?:\s*\]\s*|:)?([\s\S]*?)(?=(?:\s*\[\s*)?GOLEM_(?:MEMORY|ACTION|REPLY)|$)/ig;
        let match;
        let hasStructuredData = false;
        while ((match = SECTION_REGEX.exec(raw)) !== null) {
            hasStructuredData = true;
            const type = match[1].toUpperCase();
            const content = (match[2] || "").trim();
            if (type === 'MEMORY') {
                if (content && content !== 'null' && content !== '(無)') parsed.memory = content;
            } else if (type === 'ACTION') {
                const jsonCandidate = content.replace(/```json/g, '').replace(/```/g, '').trim();
                if (jsonCandidate && jsonCandidate !== 'null') {
                    try {
                        const jsonObj = JSON.parse(jsonCandidate);
                        const steps = Array.isArray(jsonObj) ? jsonObj : (jsonObj.steps || [jsonObj]);
                        parsed.actions.push(...steps);
                    } catch (e) {
                        const fallbackMatch = jsonCandidate.match(/\[\s*\{[\s\S]*\}\s*\]/) || jsonCandidate.match(/\{[\s\S]*\}/);
                        if (fallbackMatch) {
                            try {
                                const fixed = JSON.parse(fallbackMatch[0]);
                                parsed.actions.push(...(Array.isArray(fixed) ? fixed : [fixed]));
                            } catch (err) { }
                        }
                    }
                }
            } else if (type === 'REPLY') {
                parsed.reply = content;
            }
        }
        if (!hasStructuredData) parsed.reply = raw.replace(/GOLEM_\w+/g, '').trim();
        return parsed;
    }
    static extractJson(text) {
        if (!text) return [];
        try {
            const match = text.match(/```json([\s\S]*?)```/);
            if (match) return JSON.parse(match[1]).steps || JSON.parse(match[1]);
            const arrayMatch = text.match(/\[\s*\{[\s\S]*\}\s*\]/);
            if (arrayMatch) return JSON.parse(arrayMatch[0]);
        } catch (e) { console.error("解析 JSON 失敗:", e.message); }
        return [];
    }
}

// ============================================================
// 🧬 NeuroShunter (神經分流中樞 - 核心邏輯層)
// ============================================================
class NeuroShunter {
    static async dispatch(ctx, rawResponse, brain, controller) {
        const parsed = ResponseParser.parse(rawResponse);

        if (parsed.memory) {
            console.log(`🧠 [Memory] 寫入: ${parsed.memory.substring(0, 20)}...`);
            await brain.memorize(parsed.memory, { type: 'fact', timestamp: Date.now() });
        }

        if (parsed.reply) {
            await ctx.reply(parsed.reply);
        }

        if (parsed.actions.length > 0) {
            const normalActions = [];
            for (const act of parsed.actions) {
                if (act.action === 'schedule') {
                    if (brain.memoryDriver.addSchedule) {
                        const safeTime = new Date(act.time).toISOString();
                        console.log(`📅 [Chronos] 新增排程: ${act.task} @ ${safeTime}`);
                        await brain.memoryDriver.addSchedule(act.task, safeTime);
                        await ctx.reply(`⏰ 已設定排程：${act.task} (於 ${safeTime} 執行)`);
                    } else {
                        await ctx.reply("⚠️ 當前記憶模式不支援排程功能。");
                    }
                } else if (act.action === 'multi_agent') {
                    // ✨ [v9.0] 處理多 Agent 請求
                    await controller._handleMultiAgent(ctx, act, brain);
                } else {
                    // ✨ [v9.0] 檢查是否為動態技能 (Skill Engine)
                    const skillName = act.action;
                    const dynamicSkill = skillManager.getSkill(skillName);
                    
                    if (dynamicSkill) {
                        await ctx.reply(`🔌 執行技能: **${dynamicSkill.name}**...`);
                        try {
                            const result = await dynamicSkill.run({
                                page: brain.page,
                                browser: brain.browser,
                                log: console,
                                io: { ask: (q) => ctx.reply(q) },
                                args: act // 傳遞參數給技能
                            });
                            if (result) await ctx.reply(`✅ 技能回報: ${result}`);
                        } catch (e) {
                            await ctx.reply(`❌ 技能執行錯誤: ${e.message}`);
                        }
                    } else {
                        normalActions.push(act);
                    }
                }
            }

            if (normalActions.length > 0) {
                const observation = await controller.runSequence(ctx, normalActions);
                if (observation) {
                    if (ctx.sendTyping) await ctx.sendTyping();
                    const feedbackPrompt = `[System Observation]\n${observation}\n\nPlease reply to user naturally using [GOLEM_REPLY].`;
                    const finalRes = await brain.sendMessage(feedbackPrompt);
                    await this.dispatch(ctx, finalRes, brain, controller);
                }
            }
        }
    }
}

// ============================================================
// ☁️ System Upgrader (OTA 空中升級)
// ============================================================
class SystemUpgrader {
    static async performUpdate(ctx) {
        if (!CONFIG.GITHUB_REPO) return ctx.reply("❌ 未設定 GitHub Repo，無法更新。");
        await ctx.reply("☁️ 連線至 GitHub 母體，開始下載最新核心...");
        await ctx.sendTyping();
        const filesToUpdate = ['index.js', 'skills.js'];
        const downloadedFiles = [];
        try {
            for (const file of filesToUpdate) {
                const url = `${CONFIG.GITHUB_REPO}${file}?t=${Date.now()}`;
                const tempPath = path.join(process.cwd(), `${file}.new`);
                console.log(`📥 Downloading ${file}...`);
                const response = await fetch(url);
                if (!response.ok) throw new Error(`下載失敗 ${file} (${response.status})`);
                const code = await response.text();
                fs.writeFileSync(tempPath, code);
                downloadedFiles.push({ file, tempPath });
            }
            await ctx.reply("🛡️ 正在進行語法完整性掃描...");
            for (const item of downloadedFiles) {
                if (!PatchManager.verify(item.tempPath)) throw new Error(`檔案 ${item.file} 驗證失敗`);
            }
            await ctx.reply("🚀 系統更新成功！正在重啟...");
            for (const item of downloadedFiles) {
                const targetPath = path.join(process.cwd(), item.file);
                if (fs.existsSync(targetPath)) fs.copyFileSync(targetPath, `${targetPath}.bak`);
                fs.renameSync(item.tempPath, targetPath);
            }
            const subprocess = spawn(process.argv[0], process.argv.slice(1), { detached: true, stdio: 'ignore', cwd: process.cwd() });
            subprocess.unref();
            process.exit(0);
        } catch (e) {
            downloadedFiles.forEach(item => { if (fs.existsSync(item.tempPath)) fs.unlinkSync(item.tempPath); });
            await ctx.reply(`❌ 更新失敗：${e.message}`);
        }
    }
}

// ============================================================
// ⚡ NodeRouter (反射層)
// ============================================================
class NodeRouter {
    static async handle(ctx, brain) {
        const text = (ctx.text || "").trim();
        if (text.match(/^\/(help|menu|指令|功能)/)) { await ctx.reply(HelpManager.getManual(), { parse_mode: 'Markdown' }); return true; }
        if (text === '/donate' || text === '/support' || text === '贊助') {
            await ctx.reply(`☕ **感謝您的支持！**\n\n${CONFIG.DONATE_URL}\n\n(Golem 覺得開心 🤖❤️)`);
            return true;
        }
        if (text === '/update' || text === '/reset') {
            await ctx.reply("⚠️ **系統更新警告**\n這將強制覆蓋本地代碼。", {
                reply_markup: { inline_keyboard: [[{ text: '🔥 確認', callback_data: 'SYSTEM_FORCE_UPDATE' }, { text: '❌ 取消', callback_data: 'SYSTEM_UPDATE_CANCEL' }]] }
            });
            return true;
        }
        if (text.startsWith('/callme')) {
            const newName = text.replace('/callme', '').trim();
            if (newName) {
                skills.persona.setName('user', newName);
                await brain.init(true); // forceReload
                await ctx.reply(`👌 沒問題，以後稱呼您為 **${newName}**。`);
                return true;
            }
        }
        
        // ✨ [v9.0 Feature] 學習新技能 (Web Gemini Mode)
        if (text.startsWith('/learn ')) {
            const intent = text.replace('/learn ', '').trim();
            await ctx.reply(`🏗️ **Web 技能架構師啟動...**\n正在使用網頁算力為您設計：\`${intent}\``);
            await ctx.sendTyping();

            try {
                // 傳入 brain (Web Session) 讓 Architect 使用
                const existingSkills = skillManager.listSkills();
                const result = await architect.designSkill(brain, intent, existingSkills);

                if (result.success) {
                    skillManager.refresh(); // 熱重載
                    await ctx.reply(
                        `✅ **新技能編寫完成！**\n` +
                        `📜 **名稱**: \`${result.name}\`\n` +
                        `📝 **描述**: ${result.preview}\n` +
                        `📂 **檔案**: \`${path.basename(result.path)}\`\n` +
                        `_現在可以直接命令我使用此功能。_`
                    );
                } else {
                    await ctx.reply(`❌ **學習失敗**: ${result.error}`);
                }
            } catch (e) {
                console.error(e);
                await ctx.reply(`❌ **致命錯誤**: ${e.message}`);
            }
            return true;
        }

        // ✨ [v9.0 Feature] 匯出/匯入/列表
        if (text.startsWith('/export ')) {
            try {
                const token = skillManager.exportSkill(text.replace('/export ', '').trim());
                await ctx.reply(`📦 **技能膠囊**:\n\`${token}\``);
            } catch (e) { await ctx.reply(`❌ ${e.message}`); }
            return true;
        }
        if (text.startsWith('GOLEM_SKILL::')) {
            const res = skillManager.importSkill(text.trim());
            await ctx.reply(res.success ? `✅ 安裝成功: ${res.name}` : `⚠️ ${res.error}`);
            return true;
        }
        if (text === '/skills') {
            const skills = skillManager.listSkills();
            await ctx.reply(skills.length ? `📚 **已安裝**:\n${skills.map(s=>`• ${s.name}`).join('\n')}` : "無自定義技能。");
            return true;
        }

        if (text.startsWith('/patch') || text.includes('優化代碼')) return false;
        return false;
    }
}

// ============================================================
// 🚦 Conversation Manager (隊列與防抖系統 - 多用戶隔離版)
// ============================================================
class ConversationManager {
    constructor(brain, neuroShunterClass, controller) {
        this.brain = brain;
        this.NeuroShunter = neuroShunterClass;
        this.controller = controller;
        this.queue = [];
        this.isProcessing = false;
        this.userBuffers = new Map();
        this.DEBOUNCE_MS = 1500;
    }

    async enqueue(ctx, text) {
        const chatId = ctx.chatId;
        let userState = this.userBuffers.get(chatId) || { text: "", timer: null, ctx: ctx };
        userState.text = userState.text ? `${userState.text}\n${text}` : text;
        userState.ctx = ctx;
        console.log(`⏳ [Queue] 收到片段 (${chatId}): "${text.substring(0, 15)}..."`);
        if (userState.timer) clearTimeout(userState.timer);
        userState.timer = setTimeout(() => {
            this._commitToQueue(chatId);
        }, this.DEBOUNCE_MS);
        this.userBuffers.set(chatId, userState);
    }

    _commitToQueue(chatId) {
        const userState = this.userBuffers.get(chatId);
        if (!userState || !userState.text) return;
        const fullText = userState.text;
        const currentCtx = userState.ctx;
        this.userBuffers.delete(chatId);
        console.log(`📦 [Queue] 訊息封包完成 (${chatId})，加入隊列。`);
        this.queue.push({ ctx: currentCtx, text: fullText });
        this._processQueue();
    }

    async _processQueue() {
        if (this.isProcessing || this.queue.length === 0) return;
        this.isProcessing = true;
        const task = this.queue.shift();
        try {
            console.log(`🚀 [Queue] 開始處理訊息...`);

            // ✨ [Log] 記錄用戶輸入 (Fix missing user logs)
            this.brain._appendChatLog({
                timestamp: Date.now(),
                sender: 'User', // 統一顯示為 User，也可由 ctx.userId 區分
                content: task.text,
                type: 'user',
                role: 'User',
                isSystem: false
            });

            await task.ctx.sendTyping();
            const memories = await this.brain.recall(task.text);
            let finalInput = task.text;
            if (memories.length > 0) {
                finalInput = `【相關記憶】\n${memories.map(m => `• ${m.text}`).join('\n')}\n---\n${finalInput}`;
            }
            const raw = await this.brain.sendMessage(finalInput);
            await this.NeuroShunter.dispatch(task.ctx, raw, this.brain, this.controller);
        } catch (e) {
            console.error("❌ [Queue] 處理失敗:", e);
            await task.ctx.reply(`⚠️ 處理錯誤: ${e.message}`);
        } finally {
            this.isProcessing = false;
            setTimeout(() => this._processQueue(), 500);
        }
    }
}

// ============================================================
// ⚡ Task Controller (閉環回饋版)
// ============================================================
class TaskController {
    constructor() {
        this.executor = new Executor();
        this.security = new SecurityManager();
        this.multiAgent = null; // ✨ [v9.0]
    }

    // ✨ [v9.0] 處理多 Agent 請求
    async _handleMultiAgent(ctx, action, brain) {
        try {
            if (!this.multiAgent) {
                this.multiAgent = new InteractiveMultiAgent(brain);
            }
            const presetName = action.preset || 'TECH_TEAM';
            const agentConfigs = InteractiveMultiAgent.PRESETS[presetName];
            if (!agentConfigs) {
                const available = Object.keys(InteractiveMultiAgent.PRESETS).join(', ');
                await ctx.reply(`⚠️ 未知團隊: ${presetName}。可用: ${available}`);
                return;
            }
            const task = action.task || '討論專案';
            const options = { maxRounds: action.rounds || 3 };
            await this.multiAgent.startConversation(ctx, task, agentConfigs, options);
        } catch (e) {
            console.error('[TaskController] MultiAgent 執行失敗:', e);
            await ctx.reply(`❌ 執行失敗: ${e.message}`);
        }
    }

    async runSequence(ctx, steps, startIndex = 0) {
        let reportBuffer = [];
        for (let i = startIndex; i < steps.length; i++) {
            const step = steps[i];
            const cmdToRun = step.cmd || step.parameter || step.command || "";
            const risk = this.security.assess(cmdToRun);
            if (cmdToRun.startsWith('golem-check')) {
                const toolName = cmdToRun.split(' ')[1];
                reportBuffer.push(toolName ? `🔍 [ToolCheck] ${ToolScanner.check(toolName)}` : `⚠️ 缺少參數`);
                continue;
            }
            if (risk.level === 'BLOCKED') return `⛔ 指令被系統攔截：${cmdToRun}`;
            if (risk.level === 'WARNING' || risk.level === 'DANGER') {
                const approvalId = uuidv4();
                pendingTasks.set(approvalId, {
                    steps, nextIndex: i, ctx, timestamp: Date.now()
                });
                await ctx.reply(
                    `⚠️ ${risk.level === 'DANGER' ? '🔴 危險指令' : '🟡 警告'}\n\`${cmdToRun}\`\n${risk.reason}`,
                    {
                        reply_markup: {
                            inline_keyboard: [[
                                { text: '✅ 批准', callback_data: `APPROVE_${approvalId}` },
                                { text: '❌ 拒絕', callback_data: `DENY_${approvalId}` }
                            ]]
                        }
                    }
                );
                return null;
            }
            try {
                if (!this.internalExecutor) this.internalExecutor = new Executor();
                const output = await this.internalExecutor.run(cmdToRun);
                reportBuffer.push(`[Step ${i + 1} Success] cmd: ${cmdToRun}\nResult:\n${(output || "").trim() || "(No stdout)"}`);
            } catch (err) { reportBuffer.push(`[Step ${i + 1} Failed] cmd: ${cmdToRun}\nError:\n${err.message}`); }
        }
        return reportBuffer.join('\n\n----------------\n\n');
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
// 🕰️ Autonomy Manager
// ============================================================
class AutonomyManager {
    constructor(brain) { this.brain = brain; }
    start() {
        if (!CONFIG.TG_TOKEN && !CONFIG.DC_TOKEN) return;
        this.scheduleNextAwakening();
        setInterval(() => this.timeWatcher(), 60000);
    }
    async timeWatcher() {
        if (!this.brain.memoryDriver || !this.brain.memoryDriver.checkDueTasks) return;
        try {
            const tasks = await this.brain.memoryDriver.checkDueTasks();
            if (tasks && tasks.length > 0) {
                console.log(`⏰ [TimeWatcher] 發現 ${tasks.length} 個到期任務！`);
                for (const task of tasks) {
                    const adminCtx = await this.getAdminContext();
                    const prompt = `【⏰ 系統排程觸發】\n時間：${task.time}\n任務內容：${task.task}\n\n請根據任務內容，主動向使用者發送訊息或執行操作。`;
                    if (typeof convoManager !== 'undefined') {
                        await convoManager.enqueue(adminCtx, prompt);
                    }
                }
            }
        } catch (e) { console.error("TimeWatcher Error:", e); }
    }
    scheduleNextAwakening() {
        const waitMs = (2 + Math.random() * 3) * 3600000;
        const nextWakeTime = new Date(Date.now() + waitMs);
        const hour = nextWakeTime.getHours();
        let finalWait = waitMs;
        if (hour >= 1 && hour <= 7) {
            console.log("💤 Golem 休息中...");
            const morning = new Date(nextWakeTime);
            morning.setHours(8, 0, 0, 0);
            if (morning < nextWakeTime) morning.setDate(morning.getDate() + 1);
            finalWait = morning.getTime() - Date.now();
        }
        console.log(`♻️ [LifeCycle] 下次醒來: ${(finalWait / 60000).toFixed(1)} 分鐘後`);
        setTimeout(() => { this.manifestFreeWill(); this.scheduleNextAwakening(); }, finalWait);
    }
    async manifestFreeWill() {
        try {
            const roll = Math.random();
            if (roll < 0.2) await this.performSelfReflection();
            else if (roll < 0.6) await this.performNewsChat();
            else await this.performSpontaneousChat();
        } catch (e) { console.error("自由意志執行失敗:", e.message); }
    }
    async getAdminContext() {
        const fakeCtx = {
            isAdmin: true,
            platform: 'autonomy',
            reply: async (msg, opts) => await this.sendNotification(msg),
            sendTyping: async () => { }
        };
        return fakeCtx;
    }
    async run(taskName, type) {
        console.log(`🤖 自主行動: ${taskName}`);
        const prompt = `[系統指令: ${type}]\n任務：${taskName}\n請執行並使用標準格式回報。`;
        const raw = await this.brain.sendMessage(prompt);
        await NeuroShunter.dispatch(await this.getAdminContext(), raw, this.brain, controller);
    }
    async performNewsChat() { await this.run("上網搜尋「科技圈熱門話題」或「全球趣聞」，挑選一件分享給主人。要有個人觀點，像朋友一樣聊天。", "NewsChat"); }
    async performSpontaneousChat() { await this.run("主動社交，傳訊息給主人。語氣自然，符合當下時間。", "SpontaneousChat"); }
    async performSelfReflection(triggerCtx = null) {
        const currentCode = Introspection.readSelf();
        const advice = memory.getAdvice();
        const prompt = `【任務】自主進化提案\n代碼：\n${currentCode.slice(0, 20000)}\n記憶：${advice}\n要求：輸出 JSON Array。`;
        const raw = await this.brain.sendMessage(prompt);
        const patches = ResponseParser.extractJson(raw);
        if (patches.length > 0) {
            const patch = patches[0];
            const targetName = patch.file === 'skills.js' ? 'skills.js' : 'index.js';
            const targetPath = targetName === 'skills.js' ? path.join(process.cwd(), 'skills.js') : __filename;
            const testFile = PatchManager.createTestClone(targetPath, patches);
            global.pendingPatch = { path: testFile, target: targetPath, name: targetName, description: patch.description };
            const msgText = `💡 **自主進化提案**\n目標：${targetName}\n內容：${patch.description}`;
            const options = { reply_markup: { inline_keyboard: [[{ text: '🚀 部署', callback_data: 'PATCH_DEPLOY' }, { text: '🗑️ 丟棄', callback_data: 'PATCH_DROP' }]] } };
            if (triggerCtx) { await triggerCtx.reply(msgText, options); await triggerCtx.sendDocument(testFile); }
            else if (tgBot && CONFIG.ADMIN_IDS[0]) { await tgBot.sendMessage(CONFIG.ADMIN_IDS[0], msgText, options); await tgBot.sendDocument(CONFIG.ADMIN_IDS[0], testFile); }
        }
    }
    async sendNotification(msgText) {
        if (!msgText) return;
        if (tgBot && CONFIG.ADMIN_IDS[0]) await tgBot.sendMessage(CONFIG.ADMIN_IDS[0], msgText);
        else if (dcClient && CONFIG.DISCORD_ADMIN_ID) {
            const user = await dcClient.users.fetch(CONFIG.DISCORD_ADMIN_ID);
            await user.send(msgText);
        }
    }
}

// ============================================================
// 🎮 Hydra Main Loop
// ============================================================
const brain = new GolemBrain();
const controller = new TaskController();
const autonomy = new AutonomyManager(brain);
const convoManager = new ConversationManager(brain, NeuroShunter, controller);

(async () => {
    if (process.env.GOLEM_TEST_MODE === 'true') { console.log('🚧 GOLEM_TEST_MODE active.'); return; }
    await brain.init();
    autonomy.start();
    console.log('✅ Golem v9.0 (Ultimate Chronos + MultiAgent Edition) is Online.');
    if (dcClient) dcClient.login(CONFIG.DC_TOKEN);
})();

// --- 統一事件處理 ---
async function handleUnifiedMessage(ctx) {
    // ⏱️ [v8.7 保留] Flood Guard - 忽略離線期間訊息
    const msgTime = ctx.messageTime;
    if (msgTime && msgTime < BOOT_TIME) {
        console.log(`⏸️ [Flood Guard] 忽略離線訊息 (${new Date(msgTime).toLocaleString('zh-TW')})`);
        return;
    }

    // ✨ [v9.0] 優先檢查：是否在 MultiAgent 等待用戶輸入
    if (global.multiAgentListeners && global.multiAgentListeners.has(ctx.chatId)) {
        const callback = global.multiAgentListeners.get(ctx.chatId);
        callback(ctx.text); // 將輸入傳給 MultiAgent
        return; // 不進入正常流程
    }

    // ✨ [v9.0] 檢查：是否要恢復會議
    if (ctx.text && ['恢復會議', 'resume', '繼續會議'].includes(ctx.text.toLowerCase())) {
        if (InteractiveMultiAgent.canResume(ctx.chatId)) {
            await InteractiveMultiAgent.resumeConversation(ctx, brain);
            return;
        }
    }

    if (!ctx.text && !ctx.getAttachment) return;
    if (!ctx.isAdmin) return;
    if (await NodeRouter.handle(ctx, brain)) return;
    if (global.pendingPatch && ['ok', 'deploy', 'y', '部署'].includes(ctx.text.toLowerCase())) return executeDeploy(ctx);
    if (global.pendingPatch && ['no', 'drop', 'n', '丟棄'].includes(ctx.text.toLowerCase())) return executeDrop(ctx);

    if (ctx.text.startsWith('/patch') || ctx.text.includes('優化代碼')) {
        await autonomy.performSelfReflection(ctx);
        return;
    }

    await ctx.sendTyping();
    try {
        let finalInput = ctx.text;
        const attachment = await ctx.getAttachment();

        if (attachment) {
            await ctx.reply("👁️ 正在透過 OpticNerve 分析檔案...");
            const apiKey = await brain.doctor.keyChain.getKey();
            if (apiKey) {
                const analysis = await OpticNerve.analyze(attachment.url, attachment.mimeType, apiKey);
                finalInput = `【系統通知：視覺訊號】\n檔案類型：${attachment.mimeType}\n分析報告：\n${analysis}\n使用者訊息：${ctx.text || ""}\n請根據分析報告回應。`;
            } else {
                await ctx.reply("⚠️ 視覺系統暫時過熱 (API Rate Limit)，無法分析圖片，將僅處理文字訊息。");
            }
        }
        if (!finalInput && !attachment) return;
        await convoManager.enqueue(ctx, finalInput);
    } catch (e) { console.error(e); await ctx.reply(`❌ 錯誤: ${e.message}`); }
}

async function handleUnifiedCallback(ctx, actionData) {
    if (ctx.platform === 'discord' && ctx.isInteraction) {
        try {
            await ctx.event.deferReply({ flags: 64 });
        } catch (e) {
            console.error('Callback Discord deferReply Error:', e.message);
        }
    }

    if (!ctx.isAdmin) return;
    if (actionData === 'PATCH_DEPLOY') return executeDeploy(ctx);
    if (actionData === 'PATCH_DROP') return executeDrop(ctx);
    if (actionData === 'SYSTEM_FORCE_UPDATE') return SystemUpgrader.performUpdate(ctx);
    if (actionData === 'SYSTEM_UPDATE_CANCEL') return await ctx.reply("已取消更新操作。");

    if (actionData.includes('_')) {
        const [action, taskId] = actionData.split('_');
        const task = pendingTasks.get(taskId);
        if (!task) return await ctx.reply('⚠️ 任務已失效');
        if (action === 'DENY') {
            pendingTasks.delete(taskId);
            await ctx.reply('🛡️ 操作駁回');
        } else if (action === 'APPROVE') {
            const { steps, nextIndex } = task;
            pendingTasks.delete(taskId);
            await ctx.reply("✅ 授權通過，執行中...");
            const approvedStep = steps[nextIndex];
            const cmd = approvedStep.cmd || approvedStep.parameter || approvedStep.command || "";
            let execResult = "";
            try {
                const output = await controller.executor.run(cmd);
                execResult = `[Step ${nextIndex + 1} Success] cmd: ${cmd}\nResult:\n${(output || "").trim()}`;
            } catch (e) {
                execResult = `[Step ${nextIndex + 1} Failed] cmd: ${cmd}\nError:\n${e.message}`;
            }
            const remainingResult = await controller.runSequence(ctx, steps, nextIndex + 1);
            const observation = [execResult, remainingResult].filter(Boolean).join('\n\n----------------\n\n');
            if (observation) {
                const feedbackPrompt = `[System Observation]\nUser approved actions.\nResult:\n${observation}\nReport to user using [GOLEM_REPLY].`;
                const finalResponse = await brain.sendMessage(feedbackPrompt);
                await NeuroShunter.dispatch(ctx, finalResponse, brain, controller);
            }
        }
    }
}

async function executeDeploy(ctx) {
    if (!global.pendingPatch) return;
    try {
        const { path: patchPath, target: targetPath, name: targetName } = global.pendingPatch;
        fs.copyFileSync(targetPath, `${targetName}.bak-${Date.now()}`);
        fs.writeFileSync(targetPath, fs.readFileSync(patchPath));
        fs.unlinkSync(patchPath);
        global.pendingPatch = null;
        memory.recordSuccess();
        await ctx.reply(`🚀 ${targetName} 升級成功！正在重啟...`);
        const subprocess = spawn(process.argv[0], process.argv.slice(1), { detached: true, stdio: 'ignore' });
        subprocess.unref();
        process.exit(0);
    } catch (e) { await ctx.reply(`❌ 部署失敗: ${e.message}`); }
}

async function executeDrop(ctx) {
    if (!global.pendingPatch) return;
    try { fs.unlinkSync(global.pendingPatch.path); } catch (e) { }
    global.pendingPatch = null;
    memory.recordRejection();
    await ctx.reply("🗑️ 提案已丟棄");
}

if (tgBot) {
    tgBot.on('message', (msg) => handleUnifiedMessage(new UniversalContext('telegram', msg, tgBot)));

    // 🛠️ [Fix] 修正後的回調處理：優先應答，避免超時崩潰
    tgBot.on('callback_query', async (query) => {
        // 1. 先告訴 Telegram Server "我收到了"，停止前端轉圈圈
        // .catch() 是關鍵：防止因網路波動或 ID 過期導致整個程式崩潰 (Error: ETELEGRAM: 400)
        tgBot.answerCallbackQuery(query.id).catch(e => {
            console.warn(`⚠️ [TG] Callback Answer Warning: ${e.message}`);
        });

        // 2. 然後再執行耗時的業務邏輯 (AI 分析或指令執行)
        await handleUnifiedCallback(
            new UniversalContext('telegram', query, tgBot),
            query.data
        );
    });
}
if (dcClient) {
    dcClient.on('messageCreate', (msg) => { if (!msg.author.bot) handleUnifiedMessage(new UniversalContext('discord', msg, dcClient)); });
    dcClient.on('interactionCreate', (interaction) => { if (interaction.isButton()) handleUnifiedCallback(new UniversalContext('discord', interaction, dcClient), interaction.customId); });
}
