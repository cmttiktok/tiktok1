const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { WebcastPushConnection } = require('tiktok-live-connector');
const cors = require('cors');

const app = express();
app.use(cors());

// Giúp fix lỗi "Cannot GET /"
app.get('/', (req, res) => {
    res.send('Server TikTok Live đang hoạt động ổn định!');
});

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", 
        methods: ["GET", "POST"]
    }
});

io.on('connection', (socket) => {
    let tiktokConnection;

    socket.on('set-host', (hostId) => {
        if (tiktokConnection) {
            tiktokConnection.disconnect();
        }

        tiktokConnection = new WebcastPushConnection(hostId);

        tiktokConnection.connect().then(state => {
            console.log(`Connected to: ${state.roomId}`);
            socket.emit('status', `Đã kết nối tới: ${hostId}`);
        }).catch(err => {
            socket.emit('error', 'Không tìm thấy Live. Hãy kiểm tra lại ID!');
        });

        tiktokConnection.on('chat', (data) => {
            io.emit('new-comment', {
                uniqueId: data.uniqueId,
                nickname: data.nickname,
                comment: data.comment
            });
        });
    });

    socket.on('disconnect', () => {
        if (tiktokConnection) tiktokConnection.disconnect();
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
