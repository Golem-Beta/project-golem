/**
 * 檔案名稱: dashboard.js
 * 版本: v8.6 (Titan Chronos Monitor)
 * ---------------------------------------
 * 更新重點：
 * 1. 🟢 新增 Chronos 時序雷達：捕捉並顯示系統排程任務。
 * 2. 🚦 新增 Queue 流量監控：視覺化對話隊列狀態。
 * 3. 🎨 介面升級：適配 v8.6 核心架構。
 */
const blessed = require('blessed');
const contrib = require('blessed-contrib');
const os = require('os');

class DashboardPlugin {
    constructor() {
        // 1. 保存原始的 Console 方法
        this.originalLog = console.log;
        this.originalError = console.error;
        this.isDetached = false;
        
        // 狀態追蹤
        this.queueCount = 0;
        this.lastSchedule = "無排程";

        // 2. 初始化螢幕
        this.screen = blessed.screen({
            smartCSR: true,
            title: '🦞 Golem v8.6 戰術控制台 (Titan Chronos)',
            fullUnicode: true
        });

        // 3. 建立網格 (12x12)
        this.grid = new contrib.grid({ rows: 12, cols: 12, screen: this.screen });

        // --- 介面元件佈局 ---

        // [左上] 系統心跳 (CPU/RAM)
        this.cpuLine = this.grid.set(0, 0, 4, 8, contrib.line, {
            style: { line: "yellow", text: "green", baseline: "black" },
            label: '⚡ 系統核心 (System Core)',
            showLegend: true
        });

        // [右上] 狀態概覽 (Status)
        this.statusBox = this.grid.set(0, 8, 4, 4, contrib.markdown, {
            label: '📊 狀態 (Status)',
            tags: true,
            style: { border: { fg: 'cyan' } }
        });

        // [中層] 時序雷達 (Chronos Log) - 專門顯示排程與時間相關資訊
        this.chronosLog = this.grid.set(4, 0, 3, 6, contrib.log, {
            fg: "green",
            selectedFg: "green",
            label: '⏰ 時序雷達 (Chronos Radar)'
        });

        // [中層] 隊列監控 (Queue Log) - 專門顯示對話進出
        this.queueLog = this.grid.set(4, 6, 3, 6, contrib.log, {
            fg: "magenta",
            selectedFg: "magenta",
            label: '🚦 隊列交通 (Traffic Control)'
        });

        // [底層] 全域日誌 (Global Log)
        this.logBox = this.grid.set(7, 0, 5, 12, contrib.log, {
            fg: "white",
            selectedFg: "white",
            label: '📝 核心日誌 (Neuro-Link Stream)'
        });

        // 4. 資料初始化
        this.memData = { title: 'Memory (MB)', x: Array(60).fill(0).map((_, i) => i.toString()), y: Array(60).fill(0) };
        
        // 5. 綁定按鍵
        this.screen.key(['escape', 'q', 'C-c'], () => this.detach());
        
        // 6. 啟動攔截器
        this.hijackConsole();
        this.startMonitoring();
        this.screen.render();
    }

    hijackConsole() {
        console.log = (...args) => {
            this.originalLog.apply(console, args); // 保持原輸出
            if (this.isDetached) return;

            const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' ');
            const time = new Date().toLocaleTimeString();
            const formattedMsg = `{gray-fg}[${time}]{/gray-fg} ${msg}`;

            // 分流邏輯
            if (msg.includes('[Chronos]') || msg.includes('排程') || msg.includes('TimeWatcher')) {
                if (this.chronosLog) this.chronosLog.log(`{yellow-fg}${msg}{/yellow-fg}`);
                if (msg.includes('新增排程')) this.lastSchedule = msg.split('新增排程:')[1] || "更新中...";
            } 
            else if (msg.includes('[Queue]') || msg.includes('隊列')) {
                if (this.queueLog) this.queueLog.log(`{magenta-fg}${msg}{/magenta-fg}`);
                // 簡單的狀態解析
                if (msg.includes('加入隊列')) this.queueCount++;
                if (msg.includes('開始處理')) this.queueCount = Math.max(0, this.queueCount - 1);
            }
            
            // 全域顯示
            if (this.logBox) this.logBox.log(formattedMsg);
        };

        console.error = (...args) => {
            this.originalError.apply(console, args);
            if (this.isDetached) return;
            const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' ');
            if (this.logBox) this.logBox.log(`{red-fg}[錯誤] ${msg}{/red-fg}`);
        };
    }

    detach() {
        this.isDetached = true;
        this.screen.destroy();
        console.log = this.originalLog;
        console.error = this.originalError;
        console.log("\n============================================");
        console.log("📺 Dashboard 已關閉 (Visual Interface Detached)");
        console.log("🤖 Golem v8.6 仍在背景執行中...");
        console.log("============================================\n");
    }

    startMonitoring() {
        this.timer = setInterval(() => {
            if (this.isDetached) return clearInterval(this.timer);

            // CPU/Mem 模擬數據 (或真實數據)
            const memUsage = process.memoryUsage().heapUsed / 1024 / 1024;
            this.memData.y.shift();
            this.memData.y.push(memUsage);
            this.cpuLine.setData([this.memData]);

            const mode = process.env.GOLEM_MEMORY_MODE || 'Browser';
            const uptime = Math.floor(process.uptime());
            const hours = Math.floor(uptime / 3600);
            const minutes = Math.floor((uptime % 3600) / 60);

            // 狀態面板更新 (v8.6 特有狀態)
            this.statusBox.setMarkdown(`
# 核心狀態 (v8.6)
- **模式**: ${mode}
- **記憶**: Active
- **運行**: ${hours}h ${minutes}m

# Titan Chronos
- **隊列**: ${this.queueCount > 0 ? `{red-fg}${this.queueCount} 處理中{/red-fg}` : `{green-fg}空閒{/green-fg}`}
- **排程**: ${this.lastSchedule.substring(0, 10)}...
- **狀態**: 🟢 Online
`);
            this.screen.render();
        }, 1000);
    }
}

module.exports = new DashboardPlugin();
