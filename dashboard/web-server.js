const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');

class WebServer {
    constructor(dashboard) {
        this.dashboard = dashboard; // Reference to main dashboard if needed for initial state
        this.app = express();
        this.server = http.createServer(this.app);
        this.io = new Server(this.server);
        this.port = process.env.DASHBOARD_PORT || 3000;

        this.init();
    }

    init() {
        // Serve static files
        const publicPath = path.join(__dirname, 'public');
        this.app.use(express.static(publicPath));

        // Socket.io connection handler
        this.io.on('connection', (socket) => {
            // Send initial state upon connection
            if (this.dashboard) {
                socket.emit('init', {
                    queueCount: this.dashboard.queueCount,
                    lastSchedule: this.dashboard.lastSchedule,
                    uptime: process.uptime()
                });
            }
        });

        // Start Server
        this.server.listen(this.port, () => {
            // Server started
            // We avoid console.log here to prevent recursive loops if hooked, 
            // though dashboard.js handles loop prevention.
        });
    }

    broadcastLog(data) {
        if (this.io) {
            this.io.emit('log', data);
        }
    }

    broadcastState(data) {
        if (this.io) {
            this.io.emit('state_update', data);
        }
    }

    broadcastHeartbeat(data) {
        if (this.io) {
            this.io.emit('heartbeat', data);
        }
    }

    stop() {
        if (this.server) {
            this.server.close();
        }
    }
}

module.exports = WebServer;
