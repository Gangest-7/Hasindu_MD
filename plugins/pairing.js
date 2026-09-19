module.exports = {
    name: "pair",
    alias: ["pairstatus", "unpair", "unpairall"],
    description: "Sub-bot pairing tools",
    async execute(ctx) {
        const { sock, remoteJid, m, commandName, senderNumber, args, config, caches, helpers } = ctx;
        const subBots = caches.subBots;

        if (commandName === "pair") {
            const typedNumber = helpers.normalizeWhatsapp(args[0] || "");
            const targetNumber = typedNumber || senderNumber;

            if (!targetNumber) {
                await sock.sendMessage(remoteJid, { text: "Usage: .pair 947XXXXXXXX" }, { quoted: m });
                return;
            }
            if (!config.ADMIN_NUMBERS.includes(senderNumber) && targetNumber !== senderNumber) {
                await sock.sendMessage(remoteJid, { text: "🚫 You can only pair your own number. Owners can pair any number." }, { quoted: m });
                return;
            }
            if (targetNumber === config.BOT_PHONE_NUMBER) {
                await sock.sendMessage(remoteJid, { text: "That's the main bot's own number already." }, { quoted: m });
                return;
            }

            await sock.sendMessage(remoteJid, { text: `⏳ Requesting a pairing code for *${targetNumber}*...` }, { quoted: m });
            helpers.startSubBot(targetNumber, remoteJid, sock).catch((e) => console.error("startSubBot error:", e));
        } else if (commandName === "pairstatus") {
            if (!config.ADMIN_NUMBERS.includes(senderNumber)) {
                await sock.sendMessage(remoteJid, { text: "🚫 You are not owner." }, { quoted: m });
                return;
            }
            if (!subBots.size) {
                await sock.sendMessage(remoteJid, { text: "No paired bots right now." }, { quoted: m });
                return;
            }
            const list = [...subBots.entries()].map(([num, info]) => `• ${num} — ${info.status}`).join("\n");
            await sock.sendMessage(remoteJid, { text: `*🔗 Paired Bots (${subBots.size}/${config.MAX_SUB_BOTS})*\n\n${list}` }, { quoted: m });
        } else if (commandName === "unpair") {
            if (!config.ADMIN_NUMBERS.includes(senderNumber)) {
                await sock.sendMessage(remoteJid, { text: "🚫 You are not owner." }, { quoted: m });
                return;
            }
            const targetNumber = helpers.normalizeWhatsapp(args[0] || "");
            const info = subBots.get(targetNumber);
            if (!info) {
                await sock.sendMessage(remoteJid, { text: `No paired bot found for ${targetNumber}.` }, { quoted: m });
                return;
            }
            try { if (info.sock) await info.sock.logout(); } catch (e) {}
            subBots.delete(targetNumber);
            await sock.sendMessage(remoteJid, { text: `🔌 Unpaired *${targetNumber}*. Slot is free.` }, { quoted: m });
        } else if (commandName === "unpairall") {
            if (!config.ADMIN_NUMBERS.includes(senderNumber)) {
                await sock.sendMessage(remoteJid, { text: "🚫 You are not owner." }, { quoted: m });
                return;
            }
            if (!subBots.size) {
                await sock.sendMessage(remoteJid, { text: "No paired bots to remove." }, { quoted: m });
                return;
            }
            const numbers = [...subBots.keys()];
            for (const num of numbers) {
                const info = subBots.get(num);
                try { if (info.sock) await info.sock.logout(); } catch (e) {}
                subBots.delete(num);
            }
            await sock.sendMessage(remoteJid, { text: `🔌 Unpaired all ${numbers.length} bot(s). All slots are free.` }, { quoted: m });
        }
    }
};
