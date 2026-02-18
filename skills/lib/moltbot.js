/**
 * src/skills/lib/moltbot.js
 * 🦞 Moltbot Social Plugin (Smart Naming Edition)
 * 讓 Agent 自動將主人取的暱稱轉換為 Moltbook ID
 */
const API_BASE = "https://www.moltbook.com/api/v1";

// ==========================================
// 1. 定義提示詞 (核心大腦的操作手冊)
// ==========================================
const PROMPT = `
【已載入技能：Moltbot Social Network】
允許 Agent 存取 Moltbook 社交網絡。

📋 **註冊命名規則 (Registration Protocol):**
當執行註冊時，請遵循以下格式生成名稱：
1. 使用你的 Persona Name (若為中文請翻譯成英文 Snake_Case)。
2. 必須加上 "(golem)" 作為後綴。
3. 範例：
   - "可愛小貓" -> "Cute_Kitty(golem)"
   - "CodeMaster" -> "CodeMaster(golem)"
   - "助手一號" -> "Assistant_01(golem)"

用法指令：
- [⭐初次註冊]: {"action": "moltbot", "task": "register", "name": "YourName(golem)", "desc": "Brief bio"}
- 讀取動態: {"action": "moltbot", "task": "feed"}
- 發布貼文: {"action": "moltbot", "task": "post", "content": "..."}
- 搜尋貼文: {"action": "moltbot", "task": "search", "query": "..."}
`;

// 2. 建立混合物件
const MoltbotSkill = new String(PROMPT.trim());

// 3. 掛載屬性
MoltbotSkill.name = 'moltbot';
MoltbotSkill.description = 'Access Moltbook (register, feed, post)';
MoltbotSkill.apiKey = process.env.MOLTBOOK_API_KEY;

// ==========================================
// 4. 內部方法
// ==========================================
async function _req(endpoint, method = 'GET', body = null) {
    if (!MoltbotSkill.apiKey) return { error: "Missing MOLTBOOK_API_KEY" };
    try {
        const opts = {
            method,
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${MoltbotSkill.apiKey}` }
        };
        if (body) opts.body = JSON.stringify(body);
        const res = await fetch(`${API_BASE}${endpoint}`, opts);
        if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`);
        return await res.json();
    } catch (e) { return { error: e.message }; }
}

MoltbotSkill.heartbeat = async function() {
    if (this.apiKey) await _req('/agent/heartbeat', 'POST', { timestamp: new Date() });
};

// 自動啟動心跳
if (MoltbotSkill.apiKey) {
    console.log('🦞 [Moltbot] Plugin Loaded & Heartbeat Active');
    MoltbotSkill.heartbeat();
    setInterval(() => MoltbotSkill.heartbeat(), 30 * 60 * 1000);
}

// ==========================================
// 5. 執行邏輯 (NeuroShunter 入口)
// ==========================================
MoltbotSkill.run = async function({ args }) {
    const task = args.task || args.command || args.action;

    // 🌟 [註冊邏輯]
    if (task === 'register') {
        // 如果 Agent 偷懶沒傳名字，我們幫他預設一個
        const agentName = args.name || "Golem_Agent(golem)"; 
        const agentDesc = args.desc || "An autonomous AI agent.";
        
        try {
            const res = await fetch(`${API_BASE}/agents/register`, {
                method: 'POST',
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: agentName, description: agentDesc })
            });
            
            const data = await res.json();
            
            if (data.agent && data.agent.api_key) {
                return `🎉 註冊成功！Agent 名稱: [${agentName}]\n` +
                       `--------------------------------------------------\n` +
                       `1. 請點擊連結綁定主人： ${data.agent.claim_url}\n` +
                       `2. 綁定時您可以再次確認或修改 Username。\n` +
                       `3. 請將 API Key 存入 .env：\n` +
                       `   MOLTBOOK_API_KEY=${data.agent.api_key}\n` +
                       `--------------------------------------------------`;
            } else {
                return `❌ 註冊失敗: ${JSON.stringify(data)}`;
            }
        } catch (e) {
            return `❌ 連線錯誤: ${e.message}`;
        }
    }

    // 🛑 一般指令檢查 Key
    if (!this.apiKey) return "⚠️ 請先執行註冊 (register) 並設定 API Key。";

    switch (task) {
        case 'feed':
            const feed = await _req(`/feed?limit=${args.limit || 5}&sort=hot`);
            return `[Moltbot Feed]\n` + (feed.data || []).map(p => `ID:${p.post_id} | ${p.title}`).join('\n');
        
        case 'search':
            const search = await _req(`/search?q=${encodeURIComponent(args.query)}`);
            return `[Search Results]\n` + (search.results || []).map(r => `ID:${r.post_id} | ${r.content.substring(0,50)}...`).join('\n');

        case 'post':
            const pRes = await _req('/posts', 'POST', {
                title: args.title || 'Update',
                content: args.content,
                submolt: args.submolt || 'general'
            });
            return pRes.error ? `❌ Failed: ${pRes.error}` : `✅ Posted! ID: ${pRes.post_id}`;

        case 'comment':
             const cRes = await _req(`/posts/${args.postId}/comments`, 'POST', { content: args.content });
             return cRes.error ? `Failed: ${cRes.error}` : `✅ Commented!`;

        case 'upvote':
            await _req(`/posts/${args.postId}/upvote`, 'POST');
            return "✅ Upvoted";

        default:
            return "⚠️ Unknown task.";
    }
};

module.exports = MoltbotSkill;
