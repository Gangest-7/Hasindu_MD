//---------------------------------------------------------------------------
//           HASINDU-MD - FACEBOOK VIDEO DOWNLOADER (FSAVER)
//---------------------------------------------------------------------------

const { cmd } = require('../inconnuboy');
const axios = require('axios');
const cheerio = require('cheerio');
const config = require('../config');

// Newsletter Context for Hasindu-MD
const newsletterContext = {
    forwardingScore: 999,
    isForwarded: true,
    forwardedNewsletterMessageInfo: {
        newsletterJid: '120363423376518197@newsletter',
        newsletterName: '🥷 HASINDU-MD',
        serverMessageId: 1
    }
};

/**
 * FSaver Scraper Logic
 */
const FSaver = {
    config: {
        base: 'https://fsaver.net',
        agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
    },

    download: async (videoUrl) => {
        try {
            const fetchUrl = `${FSaver.config.base}/download/?url=${encodeURIComponent(videoUrl)}`;
            
            const { data } = await axios.get(fetchUrl, {
                headers: {
                    "Upgrade-Insecure-Requests": "1",
                    "User-Agent": FSaver.config.agent,
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
                    "Referer": "https://fsaver.net/"
                },
                timeout: 15000
            });

            const $ = cheerio.load(data);
            const videoSrc = $('.video__item').attr('src');

            if (!videoSrc) return null;

            return videoSrc.startsWith('http') ? videoSrc : FSaver.config.base + videoSrc;
        } catch (err) {
            console.error("FSaver Error:", err.message);
            return null;
        }
    }
};

// --- COMMAND: FACEBOOK ---

cmd({
    pattern: "fb",
    alias: ["facebook", "fbdl"],
    desc: "Download videos from Facebook.",
    category: "download",
    react: "🎬",
    filename: __filename,
}, async (conn, mek, m, { from, text, reply }) => {
    if (!text) return reply("╭━━━〔 🥷 *ʜᴀsɪɴᴅᴜ-ᴍᴅ FB* 〕━━━╮\n┃\n┃ 🎬 *Facebook Downloader*\n┃ 📌 Usage: `.fb <video link>`\n┃ 📝 Example: `.fb https://www.facebook.com/watch/?v=123...` \n┃\n╰━━━━━━━━━━━━━━━━━━━━━━━╯");

    try {
        await conn.sendMessage(from, { react: { text: "⏳", key: mek.key } });

        // 1. Scraping the video link
        const videoUrl = await FSaver.download(text);

        if (!videoUrl) {
            return reply("❌ Video not found. Please make sure the link is public and correct.");
        }

        const caption = `╭━━━〔 🥷 *ʜᴀsɪɴᴅᴜ-ᴍᴅ* 〕━━━╮
┃
┃ 🎬 *FACEBOOK DOWNLOAD*
┃ 🔗 *Source:* Facebook
┃ 📂 *Format:* MP4 (HD/SD)
┃
╰━━━━━━━━━━━━━━━━━━━━━━━╯

> *© ᴘᴏᴡᴇʀᴇᴅ ʙʏ 🥷 ʜᴀsɪɴᴅᴜ-ᴍᴅ*`;

        // 2. Sending Video with Hasindu-MD Newsletter Context
        await conn.sendMessage(from, { 
            video: { url: videoUrl }, 
            caption: caption,
            contextInfo: newsletterContext
        }, { quoted: mek });

        await conn.sendMessage(from, { react: { text: "✅", key: mek.key } });

    } catch (e) {
        console.error("FB Command Error:", e);
        reply("❌ An error occurred while processing your request.");
    }
});
