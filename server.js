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

// --- KẾT NỐI CSDL RIÊNG ---
const MONGODB_URI = "mongodb+srv://datahethong:Minhphuong97@datahethong.o0mfr6t.mongodb.net/tiktok_dashboard?retryWrites=true&w=majority&appName=datahethong";
mongoose.connect(MONGODB_URI).then(() => console.log("✅ Hệ thống CSDL Black-Luxury đã sẵn sàng"));

// Định nghĩa Models
const BannedWord = mongoose.model('BannedWord', { word: String });
const Acronym = mongoose.model('Acronym', { key: String, value: String });
const EmojiMap = mongoose.model('EmojiMap', { icon: String, text: String });
const BotAnswer = mongoose.model('BotAnswer', { keyword: String, response: String });

// Xử lý âm thanh
async function getGoogleAudio(text) {
    try {
        const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text.substring(0, 200))}&tl=vi&client=tw-ob`;
        const res = await axios.get(url, { responseType: 'arraybuffer' });
        return `data:audio/mp3;base64,${Buffer.from(res.data, 'binary').toString('base64')}`;
    } catch (e) { return null; }
}

// Xử lý nội dung văn bản (Tích hợp từ 3 file cũ)
async function processContent(text) {
    if (!text) return "";
    let processed = text.toLowerCase().trim();
    const banned = await BannedWord.find();
    if (banned.some(b => processed.includes(b.word.toLowerCase()))) return null;

    const emos = await EmojiMap.find();
    for (const e of emos) { processed = processed.split(e.icon).join(" " + e.text + " "); }

    const acrs = await Acronym.find();
    acrs.forEach(a => {
        const regex = new RegExp(`\\b${a.key}\\b`, 'gi');
        processed = processed.replace(regex, a.value);
    });
    return processed;
}

// --- API QUẢN TRỊ ---
app.get('/api/all', async (req, res) => {
    res.json({ words: await BannedWord.find(), acrs: await Acronym.find(), emos: await EmojiMap.find(), bots: await BotAnswer.find() });
});

app.post('/api/add', async (req, res) => {
    const { type, data } = req.body;
    if (type === 'word') await BannedWord.create({ word: data.w });
    if (type === 'bot') await BotAnswer.create({ keyword: data.k, response: data.r });
    if (type === 'acr') await Acronym.create({ key: data.k, value: data.v });
    if (type === 'emo') await EmojiMap.create({ icon: data.i, text: data.t });
    res.sendStatus(200);
});

app.delete('/api/:col/:id', async (req, res) => {
    await mongoose.connection.collection(req.params.col + 's').deleteOne({ _id: new mongoose.Types.ObjectId(req.params.id) });
    res.sendStatus(200);
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

io.on('connection', (socket) => {
    let tiktok;
    let pkTimer;

    socket.on('set-host', (hostId) => {
        if (tiktok) tiktok.disconnect();
        tiktok = new WebcastPushConnection(hostId);
        tiktok.connect().then(() => socket.emit('status', `LIVE: ${hostId}`));

        tiktok.on('chat', async (data) => {
            const bots = await BotAnswer.find();
            const match = bots.find(b => data.comment.toLowerCase().includes(b.keyword.toLowerCase()));
            if (match) {
                const audio = await getGoogleAudio(`Trả lời ${data.nickname}: ${match.response}`);
                socket.emit('event', { type: 'bot', user: "BOT", msg: match.response, audio });
            } else {
                const clean = await processContent(data.comment);
                if (clean) {
                    const audio = await getGoogleAudio(`${data.nickname} nói: ${clean}`);
                    socket.emit('event', { type: 'chat', user: data.nickname, msg: data.comment, audio });
                }
            }
        });

        tiktok.on('member', async (data) => {
            const name = await processContent(data.nickname);
            if (name) {
                const audio = await getGoogleAudio(`Chào mừng ${name} đã vào xem live`);
                socket.emit('event', { type: 'welcome', user: "HỆ THỐNG", msg: `Chào ${data.nickname}`, audio });
            }
        });

        tiktok.on('gift', async (data) => {
            if (data.repeatEnd) {
                const audio = await getGoogleAudio(`Cảm ơn ${data.nickname} đã tặng ${data.giftName}`);
                socket.emit('event', { type: 'gift', user: "QUÀ", msg: `${data.nickname} tặng ${data.giftName}`, audio });
            }
        });

        tiktok.on('linkMicBattle', () => {
            if (pkTimer) clearInterval(pkTimer);
            let time = 300;
            pkTimer = setInterval(async () => {
                time--;
                if (time === 20) {
                    const audio = await getGoogleAudio("Cả nhà ơi, 20 giây cuối nhấn màn hình thả bông nào");
                    socket.emit('event', { type: 'pk', user: "HỆ THỐNG", msg: "NHẮC PK 20S", audio });
                }
                if (time <= 0) clearInterval(pkTimer);
            }, 1000);
        });
    });
});

server.listen(process.env.PORT || 3000);
