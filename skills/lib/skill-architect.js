// lib/skill-architect.js
// Golem v9.0 Skill Architect - "The Forge"
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class SkillArchitect {
    constructor(geminiParams, skillsDir) {
        this.model = geminiParams.model; // 傳入 Gemini 模型實例
        this.skillsDir = skillsDir || path.join(process.cwd(), 'skills', 'user');
        
        // 確保目錄存在
        if (!fs.existsSync(this.skillsDir)) {
            fs.mkdirSync(this.skillsDir, { recursive: true });
        }
    }

    /**
     * 核心：將自然語言轉換為 v9.0 標準技能
     */
    async designSkill(userIntent, existingSkills = []) {
        console.log(`🏗️ Architect: Analyzing intent -> "${userIntent}"`);

        // 1. 重複性檢查 (簡易版)
        if (existingSkills.some(s => s.name.toLowerCase().includes(userIntent.split(' ')[0].toLowerCase()))) {
            console.warn("⚠️ Warning: A skill with a similar name might already exist.");
        }

        // 2. 建構 System Prompt (嚴格規範)
        const systemPrompt = `
        You are the Skill Architect for Golem v9.0, an advanced AI Agent system.
        
        YOUR GOAL: Create a robust, production-ready Node.js skill module based on the user's request.
        
        CONTEXT & TOOLS:
        - The agent uses Puppeteer. 'page' (the browser tab) is available in ctx.
        - 'ctx' object contains: { page, browser, log, io, metadata }.
        - Logging: Use ctx.log.info(), ctx.log.error(). NEVER use console.log.
        - Structure: CommonJS module.exports.
        
        STRICT RULES:
        1. OUTPUT ONLY JSON. No markdown, no explanation.
        2. Format: { "filename": "skill-name.js", "code": "..." }
        3. The code must handle errors using try/catch.
        4. If the logic is complex, break it down.
        5. DO NOT hallucinate selectors. Use generic strategies or ask the user if specific DOM is needed (but for now, generate best-effort logic).
        
        TEMPLATE:
        module.exports = {
            name: "SKILL_NAME",
            description: "Detailed description",
            tags: ["user-created", "v9"],
            version: "1.0.0",
            run: async (ctx, args) => {
                const { page, log } = ctx;
                try {
                    log.info("Starting SKILL_NAME...");
                    // Logic here
                    // ...
                    return "Success message";
                } catch (err) {
                    log.error("Error in SKILL_NAME", err);
                    throw err;
                }
            }
        };
        `;

        // 3. 呼叫 Gemini 生成
        const result = await this.model.generateContent({
            contents: [{ role: "user", parts: [{ text: systemPrompt + `\n\nUSER REQUEST: ${userIntent}` }] }]
        });
        
        const responseText = result.response.text();
        
        // 4. 解析與驗證
        try {
            // 嘗試提取 JSON (處理可能被包裹在 Markdown 的情況)
            const cleanJson = responseText.replace(/```json|```/g, '').trim();
            const skillData = JSON.parse(cleanJson);
            
            // 5. 寫入檔案
            const filePath = path.join(this.skillsDir, skillData.filename);
            fs.writeFileSync(filePath, skillData.code);
            
            console.log(`✅ Architect: Skill created at ${filePath}`);
            return { success: true, path: filePath, name: skillData.name };
            
        } catch (error) {
            console.error("❌ Architect: Failed to parse generated code.", error);
            // 這裡可以加入重試機制
            return { success: false, error: error.message };
        }
    }
}

module.exports = SkillArchitect;
