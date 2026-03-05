const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { WebcastPushConnection } = require('tiktok-live-connector');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// Phục vụ giao diện
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Endpoint dành riêng cho Cron-job để giữ server thức
app.get('/ping', (req, res) => {
    res.send('Pong! Server đang thức.');
});

io.on('connection', (socket) => {
    let tiktok;
    socket.on('set-host', (hostId) => {
        if (tiktok) tiktok.disconnect();
        tiktok = new WebcastPushConnection(hostId);
        tiktok.connect().then(() => socket.emit('status', `Đang đọc Live: ${hostId}`))
            .catch(() => socket.emit('error', 'Lỗi kết nối TikTok'));
        
        tiktok.on('chat', (data) => {
            io.emit('new-comment', { user: data.nickname, msg: data.comment });
        });
    });
    socket.on('disconnect', () => { if(tiktok) tiktok.disconnect(); });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Live trên cổng ${PORT}`));
