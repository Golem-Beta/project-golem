/**
 * 檔案名稱: dashboard.js
 * 版本: v9.0 (MultiAgent Monitor)
 * ---------------------------------------
 * 更新重點：
 * 1. 🟢 適配 v9.0 核心架構。
 * 2. 👥 新增 MultiAgent 活動監控 (青色顯示)。
 * 3. 🎨 介面標題與狀態更新，保留所有 v8.6 功能。
 */
const blessed = require('blessed');
const contrib = require('blessed-contrib');
const os = require('os');
const WebServer = require('./web-dashboard/server');

class DashboardPlugin {
    constructor() {
        // 1. 保存原始的 Console 方法
        this.originalLog = console.log;
        this.originalError = console.error;
        this.isDetached = false;

        // 狀態追蹤
        this.queueCount = 0;
        this.lastSchedule = "無排程";

        // Web Server Init (保留 v8.6 Web 介面功能)
        this.webServer = new WebServer(this);

        // 2. 初始化螢幕
        this.screen = blessed.screen({
            smartCSR: true,
            title: '🦞 Golem v9.0 戰術控制台 (MultiAgent Edition)',
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

        // [中層] 隊列監控 (Queue Log) - 顯示對話進出與 Agent 會議
        this.queueLog = this.grid.set(4, 6, 3, 6, contrib.log, {
            fg: "magenta",
            selectedFg: "magenta",
            label: '🚦 隊列交通 (Traffic & Agents)'
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

            // Strip blessed tags and ANSI codes for clean processing
            // eslint-disable-next-line no-control-regex
            const cleanMsg = msg.replace(/\u001b\[.*?m/g, '').replace(/\{.*?\}/g, '');

            // Web Socket Emission
            if (this.webServer) {
                let type = 'general';
                if (cleanMsg.includes('Error') || cleanMsg.includes('❌')) type = 'error';
                else if (cleanMsg.includes('[MultiAgent]')) type = 'agent';
                else if (cleanMsg.includes('[Chronos]') || cleanMsg.includes('排程')) type = 'chronos';
                else if (cleanMsg.includes('[Queue]') || cleanMsg.includes('隊列')) type = 'queue';

                this.webServer.broadcastLog({
                    time: time,
                    msg: cleanMsg.trim(),
                    type: type,
                    raw: msg
                });
            }

            // 分流邏輯
            // 分流邏輯
            if (cleanMsg.includes('[Chronos]') || cleanMsg.includes('排程') || cleanMsg.includes('TimeWatcher')) {
                // 保留 Chronos 監控
                if (this.chronosLog) this.chronosLog.log(`{yellow-fg}${msg}{/yellow-fg}`);
                if (cleanMsg.includes('新增排程')) {
                    // Fix: Use cleanMsg to avoid ANSI issues and trim result
                    const scheduleText = cleanMsg.split('新增排程:')[1] || "更新中...";
                    this.lastSchedule = scheduleText.trim();
                    if (this.webServer) {
                        this.webServer.broadcastState({ lastSchedule: this.lastSchedule });
                    }
                }
            }
            // v9.0 新增：捕捉 MultiAgent 會議紀錄，並導向 QueueLog 以區隔顯示
            else if (msg.includes('[InteractiveMultiAgent]') || msg.includes('[MultiAgent]')) {
                if (this.queueLog) this.queueLog.log(`{cyan-fg}${msg}{/cyan-fg}`);
            }
            else if (msg.includes('[Queue]') || msg.includes('隊列')) {
                // 保留原有 Queue 監控
                if (this.queueLog) this.queueLog.log(`{magenta-fg}${msg}{/magenta-fg}`);
                // 簡單的狀態解析
                if (msg.includes('加入隊列')) this.queueCount++;
                if (msg.includes('開始處理')) this.queueCount = Math.max(0, this.queueCount - 1);

                if (this.webServer) this.webServer.broadcastState({ queueCount: this.queueCount });
            }

            // 全域顯示
            if (this.logBox) this.logBox.log(formattedMsg);
        };

        console.error = (...args) => {
            this.originalError.apply(console, args);
            if (this.isDetached) return;
            const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' ');
            if (this.logBox) this.logBox.log(`{red-fg}[錯誤] ${msg}{/red-fg}`);
            if (this.webServer) this.webServer.broadcastLog({ time: new Date().toLocaleTimeString(), msg: msg, type: 'error' });
        };
    }

    detach() {
        this.isDetached = true;
        this.screen.destroy();
        console.log = this.originalLog;
        console.error = this.originalError;

        if (this.webServer) {
            this.webServer.stop();
            this.originalLog("🌐 Web Dashboard has been stopped.");
        }

        console.log("\n============================================");
        console.log("📺 Dashboard 已關閉 (Visual Interface Detached)");
        console.log("🤖 Golem v9.0 仍在背景執行中...");
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

            // Web Socket Heartbeat
            if (this.webServer) {
                this.webServer.broadcastHeartbeat({
                    memUsage,
                    uptime: `${hours}h ${minutes}m`,
                    cpu: 0 // Placeholder
                });
            }

            // 狀態面板更新 (v9.0 特有狀態)
            this.statusBox.setMarkdown(`
# 核心狀態 (v9.0)
- **模式**: ${mode}
- **架構**: Multi-Agent
- **運行**: ${hours}h ${minutes}m

# System Modules
- **Chronos**: Online
- **Agents**: Ready
- **狀態**: 🟢 Online
`);
            this.screen.render();
        }, 1000);
    }

    setContext(brain, memory) {
        if (this.webServer) {
            this.webServer.setContext(brain, memory);
        }
    }
}

module.exports = new DashboardPlugin();
