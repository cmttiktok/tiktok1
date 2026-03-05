const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { WebcastPushConnection } = require('tiktok-live-connector');
const cors = require('cors');

const app = express();
app.use(cors()); // Cho phép kết nối từ bên ngoài

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", // Cho phép GitHub Pages truy cập
        methods: ["GET", "POST"]
    }
});

io.on('connection', (socket) => {
    let tiktokConnection;

    // Lắng nghe sự kiện yêu cầu kết nối từ trình duyệt
    socket.on('set-host', (hostId) => {
        if (tiktokConnection) {
            tiktokConnection.disconnect();
        }

        // Tạo kết nối mới tới TikTok
        tiktokConnection = new WebcastPushConnection(hostId);

        tiktokConnection.connect().then(state => {
            console.log(`Đã kết nối tới Live ID: ${state.roomId}`);
            socket.emit('status', `Đã kết nối tới: ${hostId}`);
        }).catch(err => {
            console.error(err);
            socket.emit('error', 'Không tìm thấy Livestream hoặc User này.');
        });

        // Khi có comment mới, gửi ngay về trình duyệt qua Socket.io
        tiktokConnection.on('chat', (data) => {
            io.emit('new-comment', {
                uniqueId: data.uniqueId,
                nickname: data.nickname,
                comment: data.comment,
                profilePictureUrl: data.profilePictureUrl
            });
        });
    });

    socket.on('disconnect', () => {
        if (tiktokConnection) tiktokConnection.disconnect();
    });
});

// Render sẽ tự động cấp PORT, nếu không có thì chạy cổng 3000
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server đang chạy tại port: ${PORT}`);
});
