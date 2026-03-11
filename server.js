const express = require('express');
const path = require('path');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const { WebcastPushConnection } = require('tiktok-live-connector');

app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'index.html')); });

io.on('connection', (socket) => {
    let tiktok;
    socket.on('set-username', (user) => {
        if (tiktok) tiktok.disconnect();
        tiktok = new WebcastPushConnection(user);
        
        tiktok.connect().then(state => {
            // Gửi avatar chủ phòng ngay khi kết nối thành công
            socket.emit('status', { ok: true, profile: state.hostInfo?.avatarThumb || "" });
        }).catch(err => socket.emit('status', { ok: false }));

        // Bắt các sự kiện và định nghĩa 'type' rõ ràng cho Client xử lý
        tiktok.on('chat', (data) => {
            io.emit('audio-data', { user: data.nickname, comment: data.comment, profile: data.profilePictureUrl, type: 'chat' });
        });
        tiktok.on('gift', (data) => {
            io.emit('audio-data', { user: data.nickname, comment: `tặng ${data.giftName}`, profile: data.profilePictureUrl, type: 'gift' });
        });
        tiktok.on('member', (data) => {
            io.emit('audio-data', { user: data.nickname, comment: "vừa vào phòng", profile: data.profilePictureUrl, type: 'welcome' });
        });
    });
});
http.listen(process.env.PORT || 3000, () => console.log('Server Live!'));
