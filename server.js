const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { WebcastPushConnection } = require('tiktok-live-connector');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

io.on('connection', (socket) => {
    let tiktok;
    socket.on('set-host', (hostId) => {
        if (tiktok) tiktok.disconnect();
        const cleanId = hostId.startsWith('@') ? hostId.substring(1) : hostId;
        tiktok = new WebcastPushConnection(cleanId);
        
        tiktok.connect().then(() => socket.emit('status', `Đã kết nối: ${cleanId}`))
            .catch(() => socket.emit('error', 'Không tìm thấy livestream!'));
        
        tiktok.on('chat', (data) => {
            // Chỉ gửi text về, client sẽ tự tạo giọng đọc
            io.emit('new-comment', { 
                user: data.nickname, 
                msg: data.comment 
            });
        });
    });
    socket.on('disconnect', () => { if(tiktok) tiktok.disconnect(); });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('Server is running...'));
