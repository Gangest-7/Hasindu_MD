const { cmd } = require('../inconnuboy');
const config = require('../config');
const { generateWAMessageFromContent, proto } = require('@whiskeysockets/baileys');

// NEW IMAGE URL
const BOT_IMAGE_URL = "https://i.ibb.co/whWWntHf/GOTIHIC.jpg";

// --- COMMAND: PING ---
cmd({
    pattern: "ping",
    desc: "Check bot latency",
    category: "general",
    react: "⚡"
},
async (conn, mek, m, { from, reply }) => {
    try {
        const startTime = Date.now();
        const endTime = Date.now();
        const ping = endTime - startTime;

        const pingText = `
╭━━━〔 🥷 *ʜᴀsɪɴᴅᴜ-ᴍᴅ ᴘɪɴɢ* 〕━━━╮
┃
┃ 🏓 *Pong:* ${ping} ms
┃ ⚡ *Status:* Super Fast Speed!
┃
╰━━━━━━━━━━━━━━━━━━━━━━━╯
> *© ᴘᴏᴡᴇʀᴇᴅ ʙʏ 🥷 ʜᴀsɪɴᴅᴜ-ᴍᴅ*`;

        await conn.sendMessage(from, { text: pingText }, { quoted: mek });
    } catch (e) {
        console.error(e);
        reply(`Error: ${e.message}`);
    }
});

// --- COMMAND: ALIVE ---
cmd({
    pattern: "alive",
    desc: "Check if bot is alive",
    category: "general",
    react: "💫"
},
async (conn, mek, m, { from, sender, reply }) => {
    try {
        const number = sender.split('@')[0];

        const aliveBody = `
╭━━━〔 🥷 *ʜᴀsɪɴᴅᴜ-ᴍᴅ ɪs ᴀʟɪᴠᴇ* 〕━━━╮
┃
┃ 👋 *Hey @${number}!*
┃ 🚀 *Bot Status:* Online & Active
┃ 📌 *Prefix:* [ ${config.PREFIX || '.'} ]
┃ 👤 *Owner:* 🥷 Hasindu MD
┃
╰━━━━━━━━━━━━━━━━━━━━━━━╯
_Pick an option below to control the bot instantly:_

> *© ᴘᴏᴡᴇʀᴇᴅ ʙʏ 🥷 ʜᴀsɪɴᴅᴜ-ᴍᴅ*`;

        // Interactive Buttons Setup (Ping, Alive, Menu)
        const msg = generateWAMessageFromContent(from, {
            viewOnceMessage: {
                message: {
                    messageContextInfo: {
                        deviceListMetadata: {},
                        deviceListMetadataVersion: 2
                    },
                    interactiveMessage: proto.Message.InteractiveMessage.create({
                        body: proto.Message.InteractiveMessage.Body.create({ text: aliveBody }),
                        header: proto.Message.InteractiveMessage.Header.create({
                            title: "",
                            hasMediaAttachment: true,
                            imageMessage: (await conn.sendMessage(from, { image: { url: BOT_IMAGE_URL } }, { upload: conn.waUploadToServer })).message.imageMessage
                        }),
                        nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
                            buttons: [
                                {
                                    name: "quick_reply",
                                    buttonParamsJson: JSON.stringify({
                                        display_text: "⚡ Ping",
                                        id: ".ping"
                                    })
                                },
                                {
                                    name: "quick_reply",
                                    buttonParamsJson: JSON.stringify({
                                        display_text: "💫 Alive",
                                        id: ".alive"
                                    })
                                },
                                {
                                    name: "quick_reply",
                                    buttonParamsJson: JSON.stringify({
                                        display_text: "📜 Open Menu",
                                        id: ".menu"
                                    })
                                }
                            ]
                        }),
                        contextInfo: {
                            mentionedJid: [sender],
                            forwardingScore: 999,
                            isForwarded: true
                        }
                    })
                }
            }
        }, { quoted: mek });

        await conn.relayMessage(from, msg.message, { messageId: msg.key.id });

    } catch (e) {
        console.error("Alive Error:", e);
        reply("⚠️ Error: " + e.message);
    }
});
