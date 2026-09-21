//===========================================================================
//               🥷 HASINDU-MD AUTOMATED YOUTUBE DOWNLOADER 🥷
//===========================================================================

const { cmd } = require("../inconnuboy");
const yts = require("yt-search");
const axios = require("axios");

// Simple In-memory cache
const cache = new Map();

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
 * Normalizes YouTube URLs to a standard format
 */
function normalizeYouTubeUrl(url) {
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/shorts\/|youtube\.com\/.*[?&]v=)([a-zA-Z0-9_-]{11})/);
  return match ? `https://youtube.com/watch?v=${match[1]}` : null;
}

/**
 * Core Data Fetching Logic using Jawad-Tech API
 */
async function fetchDownloadData(url, retries = 2) {
  try {
    const apiUrl = `https://jawad-tech.vercel.app/download/ytdl?url=${encodeURIComponent(url)}`;
    const response = await axios.get(apiUrl, { timeout: 20000 });
    const data = response.data;

    if (data.status === true && data.result) {
      return {
        video_url: data.result.mp4,
        title: data.result.title || "YouTube Video",
      };
    }
    throw new Error("API failed to return download link.");
  } catch (error) {
    if (retries > 0) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      return fetchDownloadData(url, retries - 1);
    }
    return null;
  }
}

// --- MAIN COMMAND: VIDEO ---

cmd(
  {
    pattern: "video",
    alias: ["ytmp4", "vdl"],
    react: "🎥",
    desc: "Search and download high-quality videos from YouTube.",
    category: "download",
    filename: __filename,
  },
  async (conn, mek, m, { from, q, reply, prefix, command }) => {
    try {
      if (!q) return reply(`🎥 *🥷 HASINDU-MD VIDEO DOWNLOADER*\n\nUsage: \`${prefix + command} <name or link>\`\nExample: \`${prefix + command} perfect ed sheeran\``);

      await conn.sendMessage(from, { react: { text: "🔍", key: mek.key } });

      // Step 1: Search for the video
      const url = normalizeYouTubeUrl(q);
      let ytdata;

      if (url) {
        const searchResults = await yts({ videoId: q.split('v=')[1]?.split('&')[0] || q.split('/').pop() });
        ytdata = searchResults;
      } else {
        const searchResults = await yts(q);
        if (!searchResults.videos.length) return reply("❌ No videos found for your query!");
        ytdata = searchResults.videos[0];
      }

      // Step 2: Send info message with stylish frame
      const infoText = `
╭━━━〔 🥷 *ʜᴀsɪɴᴅᴜ-ᴍᴅ ᴠɪᴅᴇᴏ* 〕━━━╮
┃
┃ 📌 *Title:* ${ytdata.title}
┃ 🎬 *Channel:* ${ytdata.author?.name || 'Unknown'}
┃ ⏱️ *Duration:* ${ytdata.timestamp}
┃ 👁️ *Views:* ${ytdata.views.toLocaleString()}
┃
╰━━━━━━━━━━━━━━━━━━━━━━━╯
_📥 Processing your video, please wait..._

> *© ᴘᴏᴡᴇʀᴇᴅ ʙʏ 🥷 ʜᴀsɪɴᴅᴜ-ᴍᴅ*`;

      await conn.sendMessage(
        from, 
        { 
          image: { url: ytdata.thumbnail || ytdata.image }, 
          caption: infoText,
          contextInfo: newsletterContext
        }, 
        { quoted: mek }
      );
      
      await conn.sendMessage(from, { react: { text: "⏳", key: mek.key } });

      // Step 3: Fetch download link from API
      const dlData = await fetchDownloadData(ytdata.url);

      if (!dlData || !dlData.video_url) {
        await conn.sendMessage(from, { react: { text: "❌", key: mek.key } });
        return reply("❌ Download link could not be generated. Please try again later.");
      }

      // Step 4: Send the Video file with custom frame caption & newsletter
      const videoCaption = `
╭━━━〔 🎬 *ᴅᴏᴡɴʟᴏᴀᴅ ᴄᴏᴍᴘʟᴇᴛᴇ* 〕━━━╮
┃
┃ 🎵 *Title:* ${dlData.title}
┃ 🚀 *Status:* Successfully Uploaded!
┃
╰━━━━━━━━━━━━━━━━━━━━━━━╯
> *© ᴘᴏᴡᴇʀEᴅ ʙʏ 🥷 ʜᴀsɪɴᴅᴜ-ᴍᴅ*`;

      await conn.sendMessage(
        from,
        {
          video: { url: dlData.video_url },
          mimetype: "video/mp4",
          caption: videoCaption,
          contextInfo: {
            ...newsletterContext,
            externalAdReply: {
              title: "🥷 HASINDU-MD YT DOWNLOADER",
              body: dlData.title,
              thumbnailUrl: ytdata.thumbnail || ytdata.image,
              sourceUrl: ytdata.url,
              mediaType: 2,
              renderLargerThumbnail: false
            }
          }
        },
        { quoted: mek }
      );

      await conn.sendMessage(from, { react: { text: "✅", key: mek.key } });

    } catch (e) {
      console.error("Video DL Error:", e);
      await conn.sendMessage(from, { react: { text: "❌", key: mek.key } });
      reply(`⚠️ *Error:* ${e.message || "Something went wrong."}`);
    }
  }
);
