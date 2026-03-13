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

// Kết nối MongoDB (Giữ nguyên thông tin của bạn)
const MONGODB_URI = "mongodb+srv://baoboi97:baoboi97@cluster0.skkajlz.mongodb.net/tiktok_tts?retryWrites=true&w=majority&appName=Cluster0";
mongoose.connect(MONGODB_URI).then(() => console.log("✅ MongoDB Connected"));

const BannedWord = mongoose.model('BannedWord', { word: String });
const Acronym = mongoose.model('Acronym', { key: String, value: String });
const EmojiMap = mongoose.model('EmojiMap', { icon: String, text: String });
const BotAnswer = mongoose.model('BotAnswer', { keyword: String, response: String });

// Hàm lấy âm thanh từ Google
async function getGoogleAudio(text) {
    try {
        const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text.substring(0, 200))}&tl=vi&client=tw-ob`;
        const res = await axios.get(url, { responseType: 'arraybuffer', headers: { 'User-Agent': 'Mozilla/5.0' } });
        return `data:audio/mp3;base64,${Buffer.from(res.data, 'binary').toString('base64')}`;
    } catch (e) { return null; }
}

// Hàm xử lý văn bản (Bỏ từ cấm, thay từ viết tắt, emoji)
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
    let pkTimer = null; // Bộ đếm PK độc lập cho mỗi user

    socket.on('set-username', (username) => {
        if (tiktok) tiktok.disconnect();
        tiktok = new WebcastPushConnection(username, { processInitialData: false });
        
        tiktok.connect().then(() => {
            socket.emit('status', `✅ Kết nối thành công: ${username}`);
        }).catch(e => {
            socket.emit('status', `❌ Lỗi kết nối: ${e.message}`);
        });

        // --- LOGIC NHẮC PK 5 PHÚT (300 GIÂY) ---
        tiktok.on('linkMicBattle', async (data) => {
            // battleStatus === 1 là trận đấu bắt đầu
            if (data.battleStatus === 1) { 
                console.log(`🔥 PK Bắt đầu cho ${username} - Đếm ngược 280s...`);
                if (pkTimer) clearTimeout(pkTimer);

                // Chờ 280 giây (5 phút - 20 giây cuối)
                pkTimer = setTimeout(async () => {
                    const textRemind = "Bèo ơi, 20 giây cuối rồi, mọi người thả bông lấy găng nào";
                    const audio = await getGoogleAudio(textRemind);
                    io.emit('audio-data', { 
                        type: 'pk_reminder', 
                        user: 'Hệ thống', 
                        comment: textRemind, 
                        audio: audio 
                    });
                }, 280000); 
            }
            // battleStatus === 0 hoặc 3 là trận đấu kết thúc hoặc bị hủy
            if (data.battleStatus === 0 || data.battleStatus === 3) {
                if (pkTimer) {
                    clearTimeout(pkTimer);
                    pkTimer = null;
                    console.log(`🛑 PK kết thúc - Đã hủy bộ đếm cho ${username}`);
                }
            }
        });

        // --- CHÀO KHÁCH ---
        tiktok.on('member', async (data) => {
            const safeNickname = await processText(data.nickname);
            if (safeNickname) {
                const audio = await getGoogleAudio(`Bèo chào anh ${safeNickname} đã ghé chơi nha`);
                socket.emit('audio-data', { type: 'welcome', user: data.nickname, comment: "vừa vào phòng", audio });
            }
        });

        // --- TẶNG QUÀ ---
        tiktok.on('gift', async (data) => {
            if (data.repeatEnd) {
                const safeNickname = await processText(data.nickname);
                const audio = await getGoogleAudio(`Em cảm ơn ${safeNickname} đã tặng ${data.giftName} nha`);
                socket.emit('audio-data', { type: 'gift', user: data.nickname, comment: `đã tặng ${data.giftName}`, audio });
            }
        });

        // --- CHAT & BOT ĐÁP ---
        tiktok.on('chat', async (data) => {
            const botRules = await BotAnswer.find();
            const match = botRules.find(r => data.comment.toLowerCase().includes(r.keyword));
            
            if (match) {
                const audio = await getGoogleAudio(`Anh ${data.nickname} ơi, ${match.response}`);
                socket.emit('audio-data', { type: 'bot', user: data.nickname, comment: match.response, audio });
            } else {
                const cleanComment = await processText(data.comment);
                if (cleanComment) {
                    const audio = await getGoogleAudio(`${data.nickname} nói là: ${cleanComment}`);
                    socket.emit('audio-data', { type: 'chat', user: data.nickname, comment: data.comment, audio });
                }
            }
        });
    });
});

server.listen(process.env.PORT || 3000, () => console.log('🚀 Server is running!'));
