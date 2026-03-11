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
        tiktok.connect().then(s => socket.emit('status', {ok:true, profile: s.ownerInfo?.avatarThumb})).catch(e => socket.emit('status', {ok:false}));

        tiktok.on('chat', (d) => {
            io.emit('audio-data', { user: d.nickname, comment: d.comment, profile: d.profilePictureUrl, type: 'chat' });
        });
        tiktok.on('gift', (d) => {
            io.emit('audio-data', { user: d.nickname, comment: `tặng ${d.giftName}`, profile: d.profilePictureUrl, type: 'gift' });
        });
    });
});
http.listen(process.env.PORT || 3000);
