const express = require('express');
const path = require('path');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const { WebcastPushConnection } = require('tiktok-live-connector');

// CHỈNH SỬA: Đảm bảo Server đọc được file index.html dù bạn để ở đâu
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

io.on('connection', (socket) => {
    let tiktok;
    socket.on('set-username', (user) => {
        if (tiktok) tiktok.disconnect();
        tiktok = new WebcastPushConnection(user);
        tiktok.connect().then(s => socket.emit('status', {ok:true}))
              .catch(e => socket.emit('status', {ok:false}));

        tiktok.on('chat', (d) => {
            io.emit('audio-data', {
                user: d.nickname,
                comment: d.comment,
                profile: d.profilePictureUrl // Lấy avatar
            });
        });
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log('Server is running!'));
