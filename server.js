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

// --- KẾT NỐI CƠ SỞ DỮ LIỆU RIÊNG ---
const MONGODB_URI = "mongodb+srv://datahethong:Minhphuong97@datahethong.o0mfr6t.mongodb.net/tiktok_dashboard?retryWrites=true&w=majority&appName=datahethong";

mongoose.connect(MONGODB_URI)
    .then(() => console.log("✅ Kết nối CSDL: datahethong thành công"))
    .catch(err => console.error("❌ Lỗi kết nối CSDL:", err));

// Định nghĩa các bảng dữ liệu
const BannedWord = mongoose.model('BannedWord', { word: String });
const Acronym = mongoose.model('Acronym', { key: String, value: String });
const EmojiMap = mongoose.model('EmojiMap', { icon: String, text: String });
const BotAnswer = mongoose.model('BotAnswer', { keyword: String, response: String });

// --- CÁC HÀM XỬ LÝ LOGIC ---

async function getGoogleAudio(text) {
    try {
        const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text.substring(0, 200))}&tl=vi&client=tw-ob`;
        const res = await axios.get(url, { responseType: 'arraybuffer' });
        return `data:audio/mp3;base64,${Buffer.from(res.data, 'binary').toString('base64')}`;
    } catch (e) { return null; }
}

async function processText(text) {
    if (!text) return "";
    let processed = text.toLowerCase().trim();

    // 1. Chặn từ cấm
    const banned = await BannedWord.find();
    if (banned.some(b => processed.includes(b.word.toLowerCase()))) return null;

    // 2. Dịch Biểu tượng (Emoji)
    const emos = await EmojiMap.find();
    for (const e of emos) { processed = processed.split(e.icon).join(" " + e.text + " "); }

    // 3. Dịch từ viết tắt
    const acrs = await Acronym.find();
    acrs.forEach(a => {
        const regex = new RegExp(`\\b${a.key}\\b`, 'gi');
        processed = processed.replace(regex, a.value);
    });
    return processed;
}

// --- API QUẢN TRỊ (Dùng cho giao diện thiết lập) ---

app.get('/api/settings', async (req, res) => {
    res.json({
        words: await BannedWord.find(),
        acronyms: await Acronym.find(),
        emojis: await EmojiMap.find(),
        bots: await BotAnswer.find()
    });
});

app.post('/api/action', async (req, res) => {
    const { type, payload } = req.body;
    if (type === 'word') await BannedWord.create({ word: payload.word });
    if (type === 'bot') await BotAnswer.create({ keyword: payload.k, response: payload.r });
    if (type === 'acr') await Acronym.create({ key: payload.k, value: payload.v });
    if (type === 'emo') await EmojiMap.create({ icon: payload.i, text: payload.t });
    res.sendStatus(200);
});

app.delete('/api/:col/:id', async (req, res) => {
    const { col, id } = req.params;
    if (col === 'word') await BannedWord.findByIdAndDelete(id);
    if (col === 'bot') await BotAnswer.findByIdAndDelete(id);
    if (col === 'acr') await Acronym.findByIdAndDelete(id);
    if (col === 'emo') await EmojiMap.findByIdAndDelete(id);
    res.sendStatus(200);
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// --- KẾT NỐI TIKTOK LIVE ---

io.on('connection', (socket) => {
    let tiktok;
    socket.on('set-host', (hostId) => {
        if (tiktok) tiktok.disconnect();
        tiktok = new WebcastPushConnection(hostId);
        tiktok.connect().then(() => socket.emit('status', `🟢 Đã kết nối: ${hostId}`));

        // 1. Xử lý Comment
        tiktok.on('chat', async (data) => {
            const bots = await BotAnswer.find();
            const match = bots.find(b => data.comment.toLowerCase().includes(b.keyword.toLowerCase()));

            if (match) {
                const audio = await getGoogleAudio(`Trả lời ${data.nickname}: ${match.response}`);
                socket.emit('voice-event', { type: 'bot', user: "TRỢ LÝ", msg: match.response, audio });
            } else {
                const clean = await processText(data.comment);
                if (clean) {
                    const audio = await getGoogleAudio(`${data.nickname} nói: ${clean}`);
                    socket.emit('voice-event', { type: 'chat', user: data.nickname, msg: data.comment, audio });
                }
            }
        });

        // 2. Nhắc PK
        tiktok.on('linkMicBattle', async () => {
            const audio = await getGoogleAudio("Trận đấu bắt đầu, mọi người cùng nhấn màn hình nhé");
            socket.emit('voice-event', { type: 'pk', user: "HỆ THỐNG", msg: "BẮT ĐẦU PK", audio });
        });
    });
});

server.listen(process.env.PORT || 3000, () => console.log("Server is running..."));
