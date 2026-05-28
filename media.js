console.log('--- 🏁 INITIALIZING OSI-MINI MEDIATOOL ---');

// Keep Back4App happy with a dummy HTTP server 💀
const http = require('http');
http.createServer((req, res) => res.end('OSI-MINI MEDIATOOL ONLINE')).listen(3000);

const { default: makeWASocket, useMultiFileAuthState, delay, DisconnectReason, downloadContentFromMessage } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const yts = require('yt-search');
const ytDlp = require('yt-dlp-exec');
const path = require('path');
const https = require('https');

const OWNER_NUMBER = "237689744669";
const OWNER_JID = `${OWNER_NUMBER}@s.whatsapp.net`;

function downloadThumbnail(url, destPath) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(destPath);
        https.get(url, (response) => {
            response.pipe(file);
            file.on('finish', () => { file.close(resolve); });
        }).on('error', (err) => {
            fs.unlink(destPath, () => reject(err));
        });
    });
}

async function startMediaBot() {
    const { state, saveCreds } = await useMultiFileAuthState('media_session');

    const sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: ["Windows", "Chrome", "122.0.0.0"],
        syncFullHistory: false,
        markOnlineOnConnect: true,
        connectTimeoutMs: 90000,
        defaultQueryTimeoutMs: 0,
        keepAliveIntervalMs: 30000
    });

    sock.ev.on('creds.update', saveCreds);

    if (!sock.authState.creds.registered) {
        console.log(`📱 OPENING RAPID CONNECT TUNNEL...`);
        await delay(5000);
        try {
            console.log(`📱 REQUESTING PAIRING CODE FOR: ${OWNER_NUMBER}`);
            const code = await sock.requestPairingCode(OWNER_NUMBER);
            console.log(`\n========================================`);
            console.log(`🔑 YOUR WHATSAPP PAIRING CODE IS: ${code}`);
            console.log(`========================================\n`);
        } catch (error) {
            console.log(`❌ Initial request missed. Restarting.`);
        }
    }

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
            console.log(`❌ Connection closed. Reconnecting in 5s:`, shouldReconnect);
            if (shouldReconnect) {
                await delay(5000);
                startMediaBot();
            }
        } else if (connection === 'open') {
            console.log('✅ OSI-MINI MEDIATOOL ONLINE');

            // 🟢 ALWAYS ONLINE — keeps presence active forever
            setInterval(async () => {
                try {
                    await sock.sendPresenceUpdate('available');
                } catch (e) {}
            }, 10000);

            // 👻 GHOST MODE — auto marks presence as unavailable after every update
            sock.ev.on('presence.update', async (update) => {
                try {
                    await sock.sendPresenceUpdate('unavailable', update.id);
                } catch (e) {}
            });
        }
    });

    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message) return;

        const remoteId = msg.key.remoteJid;
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || "";

        // 👻 GHOST MODE — appear offline to anyone who messages
        try {
            await sock.sendPresenceUpdate('unavailable', remoteId);
        } catch (e) {}

        if (!text.startsWith('.')) return;
        const args = text.slice(1).trim().split(/ +/);
        const command = args.shift().toLowerCase();

        // ─── BEAUTIFIED RESPONSE LAYOUT ───
        async function sendBeautifiedResponse(targetJid, mainContent, customImageBuffer = null, forceShowDp = false) {
            const uiLayout =
                `🎛️ ⚡ [ *𝕆𝕊𝕀-𝕄𝕀ℕ𝕀 𝕄𝔼𝔻𝕀𝔸𝕋𝕆𝕆𝕃* ] ⚡ 🎛️\n` +
                `📊 *STATS:* Core v5.1  •  Operational  •  B_026.x\n` +
                `─── ─── ─── ─── ─── ─── ─── ───\n\n` +
                `${mainContent}`;

            try {
                if (customImageBuffer) {
                    await sock.sendMessage(targetJid, { image: customImageBuffer, caption: uiLayout });
                } else if (forceShowDp && fs.existsSync('./dp.jpg')) {
                    const imageBuffer = fs.readFileSync('./dp.jpg');
                    await sock.sendMessage(targetJid, { image: imageBuffer, caption: uiLayout });
                } else {
                    await sock.sendMessage(targetJid, { text: uiLayout });
                }
            } catch (e) {
                try { await sock.sendMessage(targetJid, { text: uiLayout }); } catch (err) { console.error(err); }
            }
        }

        // ─── MENU COMMAND ───
        if (command === 'menu' || command === 'help') {
            const menuContent =
                `✨ *SYSTEM MENU*\n\n` +
                `🎵 \`\`\`.play [song title]\`\`\` — Download & send audio\n` +
                `👁️ \`\`\`.vv\`\`\` — Open view once here in chat\n` +
                `👻 \`\`\`.vv2\`\`\` — Send view once to my private DM`;

            await sendBeautifiedResponse(remoteId, menuContent, null, true);
        }

        // ─── VIEW ONCE OPENER (.vv) — opens in same chat ───
        if (command === 'vv') {
            const quoted = msg.message.extendedTextMessage?.contextInfo?.quotedMessage;
            if (!quoted) {
                return await sock.sendMessage(remoteId, { text: `❌ *Reply to a view once message first fam!*` });
            }

            const viewOnceMsg =
                quoted?.viewOnceMessage?.message ||
                quoted?.viewOnceMessageV2?.message ||
                quoted?.viewOnceMessageV2Extension?.message ||
                quoted;

            const mediaType = viewOnceMsg.imageMessage ? 'imageMessage'
                : viewOnceMsg.videoMessage ? 'videoMessage'
                : viewOnceMsg.audioMessage ? 'audioMessage'
                : null;

            if (!mediaType) {
                return await sock.sendMessage(remoteId, { text: `❌ *No view once media found in that message!*` });
            }

            try {
                const stream = await downloadContentFromMessage(viewOnceMsg[mediaType], mediaType.replace('Message', ''));
                let buffer = Buffer.from([]);
                for await (const chunk of stream) {
                    buffer = Buffer.concat([buffer, chunk]);
                }

                if (mediaType === 'imageMessage') {
                    await sock.sendMessage(remoteId, { image: buffer, caption: '👁️ *View Once Opened*' });
                } else if (mediaType === 'videoMessage') {
                    await sock.sendMessage(remoteId, { video: buffer, caption: '👁️ *View Once Opened*' });
                } else if (mediaType === 'audioMessage') {
                    await sock.sendMessage(remoteId, { audio: buffer, mimetype: 'audio/mp4', ptt: true });
                }

            } catch (err) {
                console.error("vv error:", err);
                await sock.sendMessage(remoteId, { text: `❌ *Failed to open view once. Try again fam!*` });
            }
        }

        // ─── VIEW ONCE STEALER (.vv2) — sends to owner DM only ───
        if (command === 'vv2') {
            const quoted = msg.message.extendedTextMessage?.contextInfo?.quotedMessage;
            if (!quoted) {
                return await sock.sendMessage(remoteId, { text: `❌ *Reply to a view once message first fam!*` });
            }

            const viewOnceMsg =
                quoted?.viewOnceMessage?.message ||
                quoted?.viewOnceMessageV2?.message ||
                quoted?.viewOnceMessageV2Extension?.message ||
                quoted;

            const mediaType = viewOnceMsg.imageMessage ? 'imageMessage'
                : viewOnceMsg.videoMessage ? 'videoMessage'
                : viewOnceMsg.audioMessage ? 'audioMessage'
                : null;

            if (!mediaType) {
                return await sock.sendMessage(remoteId, { text: `❌ *No view once media found in that message!*` });
            }

            try {
                const stream = await downloadContentFromMessage(viewOnceMsg[mediaType], mediaType.replace('Message', ''));
                let buffer = Buffer.from([]);
                for await (const chunk of stream) {
                    buffer = Buffer.concat([buffer, chunk]);
                }

                // Send to owner's personal DM only 👻
                if (mediaType === 'imageMessage') {
                    await sock.sendMessage(OWNER_JID, { image: buffer, caption: '👁️ *View Once — Sent to your DM only*' });
                } else if (mediaType === 'videoMessage') {
                    await sock.sendMessage(OWNER_JID, { video: buffer, caption: '👁️ *View Once — Sent to your DM only*' });
                } else if (mediaType === 'audioMessage') {
                    await sock.sendMessage(OWNER_JID, { audio: buffer, mimetype: 'audio/mp4', ptt: true });
                }

                // Send a subtle confirmation in the chat
                await sock.sendMessage(remoteId, { text: `✅ *Done. Sent to DM 👻*` });

            } catch (err) {
                console.error("vv2 error:", err);
                await sock.sendMessage(remoteId, { text: `❌ *Failed to grab view once. Try again fam!*` });
            }
        }

        // ─── PLAY COMMAND ───
        if (command === 'play') {
            const songQuery = args.join(" ");
            if (!songQuery) {
                return await sock.sendMessage(remoteId, { text: `❌ *Error:* Please type a song name.` });
            }

            await sock.sendMessage(remoteId, { text: `🔍 Searching for "${songQuery}"...` });

            try {
                const searchResults = await yts(songQuery);
                const video = searchResults.videos[0];

                if (!video) {
                    return await sock.sendMessage(remoteId, { text: `❌ *Error:* Song not found.` });
                }

                console.log(`🎵 Found Track: ${video.title}`);

                // Format views nicely
                const formatViews = (num) => {
                    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
                    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
                    return num?.toString() || 'N/A';
                };

                const uploadYear = video.ago || 'N/A';
                const genre = video.genre || 'Music';
                const views = formatViews(video.views);
                const likes = video.likes ? formatViews(video.likes) : 'N/A';

                const outputFilename = path.join(__dirname, `track_${Date.now()}.mp3`);
                const tempThumbPath = path.join(__dirname, `thumb_${Date.now()}.jpg`);

                // Download thumbnail
                let imageBufferToSend = null;
                try {
                    if (video.image) {
                        await downloadThumbnail(video.image, tempThumbPath);
                        if (fs.existsSync(tempThumbPath)) {
                            imageBufferToSend = fs.readFileSync(tempThumbPath);
                        }
                    }
                } catch (imgErr) {
                    console.error("Thumbnail download failed:", imgErr);
                }

                // Download audio
                await ytDlp(video.url, {
                    extractAudio: true,
                    audioFormat: 'mp3',
                    output: outputFilename,
                    noCheckCertificates: true,
                    noWarnings: true,
                    preferFreeFormats: true,
                });

                if (fs.existsSync(outputFilename)) {
                    const audioBuffer = fs.readFileSync(outputFilename);

                    // 🎵 Rich music card caption
                    const musicCard =
                        `🎛️ ⚡ [ *𝕆𝕊𝕀-𝕄𝕀ℕ𝕀 𝕄𝔼𝔻𝕀𝔸𝕋𝕆𝕆𝕃* ] ⚡ 🎛️\n` +
                        `─── ─── ─── ─── ─── ─── ─── ───\n\n` +
                        `🎵 *${video.title}*\n\n` +
                        `⏱️ *Duration:* ${video.timestamp}\n` +
                        `📅 *Uploaded:* ${uploadYear}\n` +
                        `🎭 *Genre:* ${genre}\n` +
                        `👁️ *Views:* ${views}\n` +
                        `❤️ *Likes:* ${likes}\n\n` +
                        `─── ─── ─── ─── ─── ─── ─── ───\n` +
                        `📥 _Audio payload below_ 👇`;

                    // Send cover image with music card info
                    if (imageBufferToSend) {
                        await sock.sendMessage(remoteId, { image: imageBufferToSend, caption: musicCard });
                    } else {
                        await sock.sendMessage(remoteId, { text: musicCard });
                    }

                    // Send the actual audio file
                    await sock.sendMessage(remoteId, {
                        audio: audioBuffer,
                        mimetype: 'audio/mp4',
                        ptt: false
                    });

                    // Cleanup temp files
                    fs.unlinkSync(outputFilename);
                    if (fs.existsSync(tempThumbPath)) fs.unlinkSync(tempThumbPath);
                }

            } catch (err) {
                console.error(err);
                await sock.sendMessage(remoteId, { text: `❌ *Error:* Audio engine failure. Try another song fam!` });
            }
        }
    });
}

startMediaBot();
