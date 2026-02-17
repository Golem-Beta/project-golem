# 🦞 Golem Web Dashboard v2.0 (Cyber-Noir Edition)

這是 Project Golem 的官方 Web 控制面板，基於 Next.js 15 與 Tailwind CSS 4 構建。提供實時監控、Agent 會議觀察與多模態互動介面。

## 🌟 核心功能

-   **實時指標**: 監控 CPU、記憶體佔用與系統運行時間。
-   **時序雷達 (Chronos Radar)**: 視覺化即將執行的排程任務。
-   **隊列交通 (Traffic Control)**: 即時觀察訊息處理流程與 Agent 協作狀態。
-   **神經日誌 (Neuro-Link Stream)**: 支援過濾與分類的全域日誌流。
-   **多智能體監控**: 專屬的互動式多 Agent 會議頻道。

## 🚀 快速啟動

當您啟動 Project Golem 主程式時，Web Dashboard 會自動隨之啟動：

```bash
# 在根目錄執行
npm run dashboard
```

或是手動啟動開發開發環境：

```bash
cd web-dashboard
npm install
npm run dev
```

啟動後請訪問：[http://localhost:3000/dashboard](http://localhost:3000/dashboard)

## 🛠️ 技術堆疊

-   **框架**: [Next.js](https://nextjs.org/)
-   **通訊**: [Socket.io](https://socket.io/) (實時同步)
-   **樣式**: [Tailwind CSS 4](https://tailwindcss.com/)
-   **元件**: Radix UI + Lucide Icons
-   **視覺化**: Recharts

## 🔧 自定義配置

您可以透過根目錄的 `.env` 檔案調整埠號：
```env
DASHBOARD_PORT=3000
```

---
**Developed with ❤️ by Arvincreator**
