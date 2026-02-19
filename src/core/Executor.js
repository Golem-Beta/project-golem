const { spawn } = require('child_process');

class Executor {
    /**
     * 執行 Shell 指令 (優化版)
     * 使用 spawn 取代 exec，解決 maxBuffer 限制，並支援長任務
     */
    run(cmd) {
        return new Promise((resolve, reject) => {
            console.log(`⚡ Exec (Spawn): ${cmd}`);

            // 使用 shell: true 讓行為跟原本的 exec 一樣，可以吃複雜指令 (如 'ls -la | grep js')
            const child = spawn(cmd, [], {
                shell: true,
                cwd: process.cwd(),
                env: { ...process.env } // 繼承原本的環境變數
            });

            let stdout = '';
            let stderr = '';

            // 1. 監聽標準輸出 (以串流方式接收，不再受 1MB 限制)
            child.stdout.on('data', (data) => {
                const text = data.toString();
                stdout += text;
                // 如果您想即時在終端機看到進度，可以解開下面這行註解：
                // process.stdout.write(text); 
            });

            // 2. 監聽錯誤輸出
            child.stderr.on('data', (data) => {
                const text = data.toString();
                stderr += text;
            });

            // 3. 監聽錯誤事件 (例如指令根本找不到)
            child.on('error', (err) => {
                reject(err.message);
            });

            // 4. 指令結束
            child.on('close', (code) => {
                if (code !== 0) {
                    // 這裡您可以決定是否要 reject，或者 resolve 回傳錯誤訊息讓 AI 判斷
                    // 為了保持與您舊程式碼行為一致，這裡使用 reject
                    reject(stderr || `Command failed with code ${code}`);
                } else {
                    resolve(stdout);
                }
            });
        });
    }
}

module.exports = Executor;
