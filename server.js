const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { WebcastPushConnection } = require('tiktok-live-connector');
const axios = require('axios'); // Dùng để tải âm thanh
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// Hàm này giúp lấy giọng nói trực tiếp từ server
async function getGoogleAudio(text) {
    try {
        const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text.substring(0, 200))}&tl=vi&client=tw-ob`;
        const res = await axios.get(url, { responseType: 'arraybuffer' });
        // Chuyển âm thanh thành dạng chuỗi Base64 để gửi qua Socket.io
        return `data:audio/mp3;base64,${Buffer.from(res.data, 'binary').toString('base64')}`;
    } catch (e) {
        console.error("Lỗi lấy âm thanh:", e);
        return null;
    }
}

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

io.on('connection', (socket) => {
    let tiktok;
    socket.on('set-host', (hostId) => {
        if (tiktok) tiktok.disconnect();
        const cleanId = hostId.startsWith('@') ? hostId.substring(1) : hostId;
        tiktok = new WebcastPushConnection(cleanId);
        
        tiktok.connect().then(() => socket.emit('status', `Kết nối thành công: ${cleanId}`));
        
        tiktok.on('chat', async (data) => {
            const content = `${data.nickname} nói ${data.comment}`;
            const audioData = await getGoogleAudio(content); // Lấy âm thanh tại server
            
            io.emit('new-comment', { 
                user: data.nickname, 
                msg: data.comment,
                audio: audioData // Gửi chuỗi âm thanh về máy khách
            });
        });
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server chạy tại cổng ${PORT}`));
