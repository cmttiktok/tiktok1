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
mongoose.connect(MONGODB_URI).then(() => console.log("✅ MongoDB Connected"));

const BannedWord = mongoose.model('BannedWord', { word: String });
const Acronym = mongoose.model('Acronym', { key: String, value: String });
const EmojiMap = mongoose.model('EmojiMap', { icon: String, text: String });
const BotAnswer = mongoose.model('BotAnswer', { keyword: String, response: String });

// --- CÁC HÀM XỬ LÝ TTS VÀ VĂN BẢN ---
async function getGoogleAudio(text) {
    try {
        const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text.substring(0, 200))}&tl=vi&client=tw-ob`;
        const res = await axios.get(url, { responseType: 'arraybuffer', headers: { 'User-Agent': 'Mozilla/5.0' } });
        return `data:audio/mp3;base64,${Buffer.from(res.data, 'binary').toString('base64')}`;
    } catch (e) { return null; }
}

async function processText(text) {
    if (!text) return null;
    const banned = await BannedWord.find();
    if (banned.some(b => text.toLowerCase().includes(b.word))) return null;
    let processed = text;
    const emojis = await EmojiMap.find();
    for (const e of emojis) processed = processed.split(e.icon).join(" " + e.text + " ");
    const acronyms = await Acronym.find();
    acronyms.forEach(a => {
        const regex = new RegExp(`(?<!\\p{L})${a.key}(?!\\p{L})`, 'giu');
        processed = processed.replace(regex, a.value);
    });
    return processed;
}

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

io.on('connection', (socket) => {
    let tiktok;
    let pkTimer = null; // Bộ đếm độc lập cho mỗi kết nối

    socket.on('set-username', (username) => {
        if (tiktok) tiktok.disconnect();
        tiktok = new WebcastPushConnection(username, { processInitialData: false });
        
        tiktok.connect().then(() => socket.emit('status', `✅ Kết nối: ${username}`)).catch(e => socket.emit('status', `❌ Lỗi: ${e.message}`));

        // 1. CHỨC NĂNG NHẮC PK 20S CUỐI (Trận 5 phút)
        tiktok.on('linkMicBattle', (data) => {
            if (data.battleStatus === 1) { 
                console.log("🔥 PK 5 Phút Bắt đầu - Đang đếm ngược 280s...");
                if (pkTimer) clearTimeout(pkTimer);

                // 5 phút = 300 giây. Nhắc ở 20s cuối => Chờ 280 giây (280000ms)
                pkTimer = setTimeout(async () => {
                    const audio = await getGoogleAudio("Bèo ơi, 20 giây cuối thả bông lấy găng nào");
                    io.emit('audio-data', { 
                        type: 'pk_reminder', 
                        user: 'Hệ thống', 
                        comment: '20 giây cuối thả bông lấy găng Bèo ơi',
                        audio: audio
                    });
                }, 280000); 
            }
            if (data.battleStatus === 0 || data.battleStatus === 3) {
                if (pkTimer) { clearTimeout(pkTimer); pkTimer = null; }
            }
        });

        // 2. CHÀO KHÁCH
        tiktok.on('member', async (data) => {
            const safe = await processText(data.nickname);
            if (safe) {
                const audio = await getGoogleAudio(`Bèo ơi, anh ${safe} ghé chơi nè`);
                socket.emit('audio-data', { type: 'welcome', user: safe, comment: "vào phòng", audio });
            }
        });

        // 3. TẶNG QUÀ
        tiktok.on('gift', async (data) => {
            if (data.repeatEnd) {
                const safe = await processText(data.nickname);
                const audio = await getGoogleAudio(`Cảm ơn ${safe} đã tặng ${data.giftName}`);
                socket.emit('audio-data', { type: 'gift', user: safe, comment: `đã tặng ${data.giftName}`, audio });
            }
        });

        // 4. CHAT & BOT ĐÁP
        tiktok.on('chat', async (data) => {
            const botRules = await BotAnswer.find();
            const match = botRules.find(r => data.comment.toLowerCase().includes(r.keyword));
            if (match) {
                const audio = await getGoogleAudio(`Anh ${data.nickname} ơi, ${match.response}`);
                socket.emit('audio-data', { type: 'bot', user: data.nickname, comment: match.response, audio });
            } else {
                const clean = await processText(data.comment);
                if (clean) {
                    const audio = await getGoogleAudio(`${data.nickname} nói: ${clean}`);
                    socket.emit('audio-data', { type: 'chat', user: data.nickname, comment: data.comment, audio });
                }
            }
        });
    });
});

server.listen(process.env.PORT || 3000);
