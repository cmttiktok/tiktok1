const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const { WebcastPushConnection } = require('tiktok-live-connector');

app.use(express.static('public'));

io.on('connection', (socket) => {
    let tiktokConnection;

    socket.on('set-username', (username) => {
        if (tiktokConnection) tiktokConnection.disconnect();

        tiktokConnection = new WebcastPushConnection(username);

        tiktokConnection.connect().then(state => {
            socket.emit('status', `✅ Kết nối thành công tới: ${state.roomId}`);
        }).catch(err => {
            socket.emit('status', `❌ Lỗi: ${err.message}`);
        });

        // Bắt sự kiện comment và lấy ảnh đại diện
        tiktokConnection.on('chat', (data) => {
            const payload = {
                user: data.nickname,
                comment: data.comment,
                // Lấy URL ảnh đại diện từ TikTok
                profile: data.profilePictureUrl,
                type: 'chat'
            };
            io.emit('audio-data', payload);
        });

        // Tương tự cho quà tặng và các sự kiện khác
        tiktokConnection.on('gift', (data) => {
            const payload = {
                user: data.nickname,
                comment: `tặng ${data.giftName} x${data.repeatCount}`,
                profile: data.profilePictureUrl,
                type: 'gift'
            };
            io.emit('audio-data', payload);
        });
    });

    socket.on('disconnect', () => {
        if (tiktokConnection) tiktokConnection.disconnect();
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`Server chạy tại port: ${PORT}`);
});
