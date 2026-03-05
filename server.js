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
        
        tiktok.connect().then(() => socket.emit('status', `Đang đọc Live: ${cleanId}`))
            .catch(() => socket.emit('error', 'Lỗi kết nối TikTok'));
        
        tiktok.on('chat', (data) => {
            // Tạo link gTTS (Google Text-to-Speech) trực tiếp
            // Chúng ta mã hóa nội dung để tránh lỗi ký tự đặc biệt
            const text = encodeURIComponent(`${data.nickname} nói ${data.comment}`);
            const audioUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${text}&tl=vi&client=tw-ob`;

            io.emit('new-comment', { 
                user: data.nickname, 
                msg: data.comment,
                audio: audioUrl // Gửi kèm link âm thanh chị Google chuẩn
            });
        });
    });
    socket.on('disconnect', () => { if(tiktok) tiktok.disconnect(); });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on ${PORT}`));
