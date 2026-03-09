const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { WebcastPushConnection } = require('tiktok-live-connector');
const axios = require('axios');
const mongoose = require('mongoose');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.json());

const MONGODB_URI = "mongodb+srv://baoboi97:baoboi97@cluster0.skkajlz.mongodb.net/tiktok_tts?retryWrites=true&w=majority&appName=Cluster0";
mongoose.connect(MONGODB_URI).then(() => console.log("✅ MongoDB Connected")).catch(e => console.log("❌ DB Error", e));

const BannedWord = mongoose.model('BannedWord', { word: String });
const Acronym = mongoose.model('Acronym', { key: String, value: String });
const EmojiMap = mongoose.model('EmojiMap', { icon: String, text: String });
const BotAnswer = mongoose.model('BotAnswer', { keyword: String, response: String });

// API QUẢN TRỊ (Giữ nguyên để bạn không phải sửa Admin UI)
app.get('/api/:path', async (req, res) => {
    try {
        const { path } = req.params;
        if (path === 'words') return res.json((await BannedWord.find()).map(w => w.word));
        if (path === 'acronyms') return res.json(await Acronym.find());
        if (path === 'emojis') return res.json(await EmojiMap.find());
        res.json(await BotAnswer.find());
    } catch (e) { res.status(500).send(e.message); }
});

app.post('/api/:path', async (req, res) => {
    const { path } = req.params; const data = req.body;
    if (path === 'words') await BannedWord.updateOne({ word: data.word.toLowerCase() }, { word: data.word.toLowerCase() }, { upsert: true });
    else if (path === 'acronyms') await Acronym.findOneAndUpdate({ key: data.key.toLowerCase() }, { value: data.value }, { upsert: true });
    else if (path === 'emojis') await EmojiMap.findOneAndUpdate({ icon: data.icon }, { text: data.text }, { upsert: true });
    else if (path === 'bot') await BotAnswer.findOneAndUpdate({ keyword: data.keyword.toLowerCase() }, { response: data.response }, { upsert: true });
    res.sendStatus(200);
});

app.delete('/api/:path/:id', async (req, res) => {
    const { path, id } = req.params;
    if (path === 'words') await BannedWord.deleteOne({ word: id });
    else if (path === 'acronyms') await Acronym.deleteOne({ key: id });
    else if (path === 'emojis') await EmojiMap.findByIdAndDelete(id);
    else await BotAnswer.findByIdAndDelete(id);
    res.sendStatus(200);
});

// XỬ LÝ TTS & PK
async function getGoogleAudio(text) {
    try {
        const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text.substring(0, 200))}&tl=vi&client=tw-ob`;
        const res = await axios.get(url, { responseType: 'arraybuffer' });
        return `data:audio/mp3;base64,${Buffer.from(res.data, 'binary').toString('base64')}`;
    } catch (e) { return null; }
}

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

io.on('connection', (socket) => {
    let tiktok;
    let isInitial = true;

    socket.on('set-username', (username) => {
        if (tiktok) tiktok.disconnect();
        isInitial = true;
        tiktok = new WebcastPushConnection(username, { processInitialData: false });

        tiktok.connect().then(() => {
            socket.emit('status', `✅ Kết nối thành công: ${username}`);
            setTimeout(() => { isInitial = false; }, 10000); // 10 giây đầu bỏ qua PK ảo
        }).catch(e => socket.emit('status', `❌ Lỗi: ${e.message}`));

        // BẮT PK VỚI LOGIC CHÍNH XÁC CAO
        const handlePK = (data) => {
            if (isInitial) return; 
            // Kiểm tra xem có dữ liệu quân đội PK không
            if (data.armies && data.armies.length > 0) {
                console.log("🔥 PK THẬT SỰ BẮT ĐẦU!");
                socket.emit('pk-start');
            }
        };

        tiktok.on('linkMicArmies', handlePK);
        tiktok.on('linkMicBattle', handlePK);

        // Xử lý Chat & Bot
        tiktok.on('chat', async (data) => {
            const bots = await BotAnswer.find();
            const match = bots.find(b => data.comment.toLowerCase().includes(b.keyword));
            if (match) {
                const audio = await getGoogleAudio(`Bèo đáp nè: ${match.response}`);
                socket.emit('audio-data', { type: 'bot', user: "🤖 TRỢ LÝ", comment: match.response, audio });
            } else {
                const audio = await getGoogleAudio(`${data.nickname} nói: ${data.comment}`);
                socket.emit('audio-data', { type: 'chat', user: data.nickname, comment: data.comment, audio });
            }
        });

        tiktok.on('gift', async (data) => {
            if (data.repeatEnd) {
                const audio = await getGoogleAudio(`Cảm ơn ${data.nickname} đã tặng ${data.giftName}`);
                socket.emit('audio-data', { type: 'gift', user: "🎁 QUÀ", comment: `Tặng ${data.giftName}`, audio });
            }
        });
    });
});

server.listen(process.env.PORT || 3000, () => console.log("🚀 Hệ thống đã sẵn sàng!"));
