const config = require('../config');
const { cmd } = require('../inconnuboy');
const { getUserConfigFromMongoDB } = require('../lib/database');
const { generateWAMessageFromContent, proto } = require('@whiskeysockets/baileys');

cmd({
    pattern: "menu",
    alias: ["allmenu", "fullmenu"],
    desc: "Show interactive bot menu",
    category: "main",
    react: "📜",
    filename: __filename
},
async (conn, mek, m, { from, sender, reply }) => {
    try {
        const number = sender.split('@')[0];
        const userConfig = await getUserConfigFromMongoDB(number).catch(() => ({}));

        const uptime = process.uptime();
        const hours = Math.floor(uptime / 3600);
        const minutes = Math.floor((uptime % 3600) / 60);
        const seconds = Math.floor(uptime % 60);

        // Frame header setup
        const headerText = `
╭━━━〔 🥷 *ʜᴀsɪɴᴅᴜ-ᴍᴅ* 〕━━━╮
┃
┃ 👋 *Hey @${number}!*
┃ 📊 *Total Commands:* 250+
┃ 📌 *Prefix:* ${config.PREFIX || '.'}
┃ ⌛ *Uptime:* ${hours}h ${minutes}m ${seconds}s
┃ ⚙️ *Mode:* ${config.WORK_TYPE || 'PUBLIC'}
┃
╰━━━━━━━━━━━━━━━━━━━━━━━╯

👇 *Tap "Open Menu" below and pick a category — tapping any command runs it instantly.*

> *© 🥷 HASINDU-MD 2026*`;

        // Interactive List Sections Structure
        const sections = [
            {
                title: "🍱 DOWNLOAD MENU",
                rows: [
                    { title: ".fb", description: "Download Facebook Videos", id: ".fb" },
                    { title: ".song", description: "Search and download audio from YouTube", id: ".song" },
                    { title: ".tiktok", description: "Download TikTok video without watermark", id: ".tiktok" },
                    { title: ".video", description: "Download YouTube Video", id: ".video" },
                    { title: ".mediafire", description: "Download Mediafire Files", id: ".mediafire" },
                    { title: ".insta", description: "Download Instagram Media", id: ".insta" }
                ]
            },
            {
                title: "🏠 MAIN & BOT MENU",
                rows: [
                    { title: ".menu2", description: "Show the bot's command list text", id: ".menu2" },
                    { title: ".owner", description: "Get owner details", id: ".owner" },
                    { title: ".alive", description: "Check bot is online or not", id: ".alive" },
                    { title: ".ping", description: "Check bot speed", id: ".ping" },
                    { title: ".repo", description: "Get bot source code link", id: ".repo" }
                ]
            },
            {
                title: "⚙️ SETTINGS & GROUP",
                rows: [
                    { title: ".settings", description: "Bot Configuration Settings", id: ".settings" },
                    { title: ".tagall", description: "Tag all group members", id: ".tagall" },
                    { title: ".mute", description: "Mute group chat", id: ".mute" },
                    { title: ".unmute", description: "Unmute group chat", id: ".unmute" }
                ]
            },
            {
                title: "🤖 AI & CONVERT MENU",
                rows: [
                    { title: ".ai", description: "Ask ChatGPT AI", id: ".ai" },
                    { title: ".sticker", description: "Convert Image/Video to Sticker", id: ".sticker" },
                    { title: ".fancy", description: "Create stylish fonts", id: ".fancy" }
                ]
            }
        ];

        // Construct Baileys Native Interactive Message
        const msg = generateWAMessageFromContent(from, {
            viewOnceMessage: {
                message: {
                    messageContextInfo: {
                        deviceListMetadata: {},
                        deviceListMetadataVersion: 2
                    },
                    interactiveMessage: proto.Message.InteractiveMessage.create({
                        body: proto.Message.InteractiveMessage.Body.create({ text: headerText }),
                        header: proto.Message.InteractiveMessage.Header.create({
                            title: "",
                            hasMediaAttachment: true,
                            ...(config.IMAGE_PATH ? {
                                imageMessage: (await conn.sendMessage(from, { image: { url: config.IMAGE_PATH } }, { upload: conn.waUploadToServer })).message.imageMessage
                            } : {})
                        }),
                        nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
                            buttons: [
                                {
                                    name: "single_select",
                                    buttonParamsJson: JSON.stringify({
                                        title: "📜 Open Menu",
                                        sections: sections
                                    })
                                }
                            ]
                        }),
                        contextInfo: {
                            mentionedJid: [sender],
                            forwardingScore: 999,
                            isForwarded: true,
                            forwardedNewsletterMessageInfo: {
                                newsletterJid: '120363401706347293@newsletter',
                                newsletterName: '🥷 HASINDU-MD',
                                serverMessageId: 1
                            }
                        }
                    })
                }
            }
        }, { quoted: mek });

        await conn.relayMessage(from, msg.message, { messageId: msg.key.id });

    } catch (e) {
        console.error("Menu Error:", e);
        reply("⚠️ Error displaying menu: " + e.message);
    }
});
