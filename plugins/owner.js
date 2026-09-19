module.exports = {
    name: "ban",
    alias: ["unban", "addcoins", "setcoins", "broadcast", "getcode", "stats", "top", "banned", "search"],
    ownerOnly: true,
    description: "Owner management and admin utilities",
    async execute(ctx) {
        const { sock, remoteJid, m, body, commandName, args, models, helpers } = ctx;

        if (commandName === "ban") {
            const targetNumber = helpers.normalizeWhatsapp(args[0] || "");
            const reason = args.slice(1).join(" ") || "No reason given";
            if (!targetNumber) return sock.sendMessage(remoteJid, { text: "Usage: .ban 947XXXXXXXX <reason>" }, { quoted: m });
            const user = await models.User.findOneAndUpdate({ whatsapp: targetNumber }, { banned: true, banReason: reason, bannedAt: new Date() }, { new: true });
            await sock.sendMessage(remoteJid, { text: user ? `🚫 Banned ${targetNumber}. Reason: ${reason}` : `No account found for ${targetNumber}.` }, { quoted: m });

        } else if (commandName === "unban") {
            const targetNumber = helpers.normalizeWhatsapp(args[0] || "");
            if (!targetNumber) return sock.sendMessage(remoteJid, { text: "Usage: .unban 947XXXXXXXX" }, { quoted: m });
            const user = await models.User.findOneAndUpdate({ whatsapp: targetNumber }, { banned: false, banReason: "", bannedAt: null }, { new: true });
            await sock.sendMessage(remoteJid, { text: user ? `✅ Unbanned ${targetNumber}.` : `No account found for ${targetNumber}.` }, { quoted: m });

        } else if (commandName === "addcoins") {
            const targetNumber = helpers.normalizeWhatsapp(args[0] || "");
            const amount = Number(args[1]);
            if (!targetNumber || !Number.isFinite(amount)) return sock.sendMessage(remoteJid, { text: "Usage: .addcoins 947XXXXXXXX <amount>" }, { quoted: m });
            const user = await models.User.findOneAndUpdate({ whatsapp: targetNumber }, { $inc: { coins: amount } }, { new: true });
            await sock.sendMessage(remoteJid, { text: user ? `🪙 ${amount >= 0 ? "Added" : "Removed"} ${Math.abs(amount)} coins for ${targetNumber}. New balance: ${user.coins}` : `No account found for ${targetNumber}.` }, { quoted: m });

        } else if (commandName === "setcoins") {
            const targetNumber = helpers.normalizeWhatsapp(args[0] || "");
            const amount = Number(args[1]);
            if (!targetNumber || !Number.isFinite(amount)) return sock.sendMessage(remoteJid, { text: "Usage: .setcoins 947XXXXXXXX <exact amount>" }, { quoted: m });
            const user = await models.User.findOneAndUpdate({ whatsapp: targetNumber }, { coins: amount }, { new: true });
            await sock.sendMessage(remoteJid, { text: user ? `🪙 Set ${targetNumber}'s balance to exactly ${user.coins} coins.` : `No account found for ${targetNumber}.` }, { quoted: m });

        } else if (commandName === "broadcast") {
            const announcement = body.slice(".broadcast".length).trim();
            if (!announcement) return sock.sendMessage(remoteJid, { text: "Usage: .broadcast <message>" }, { quoted: m });
            await sock.sendMessage(remoteJid, { text: `📢 *Announcement*\n\n${announcement}` });

        } else if (commandName === "getcode") {
            const targetNumber = helpers.normalizeWhatsapp(args[0] || "");
            if (!targetNumber) return sock.sendMessage(remoteJid, { text: "Usage: .getcode 947XXXXXXXX" }, { quoted: m });
            const doc = await models.PendingOtp.findOne({ whatsapp: targetNumber }).lean();
            if (!doc) return sock.sendMessage(remoteJid, { text: `No pending code found for ${targetNumber}.` }, { quoted: m });
            const expired = Date.now() - new Date(doc.createdAt).getTime() > ctx.config.OTP_TTL_MS;
            await sock.sendMessage(remoteJid, { text: `🔑 Code for *${targetNumber}*: *${doc.code}*${expired ? " (⚠️ expired)" : ""}` }, { quoted: m });

        } else if (commandName === "stats") {
            const [totalUsers, bannedUsers, pendingOtps, coinAgg] = await Promise.all([
                models.User.countDocuments(),
                models.User.countDocuments({ banned: true }),
                models.PendingOtp.countDocuments(),
                models.User.aggregate([{ $group: { _id: null, total: { $sum: "$coins" } } }]),
            ]);
            await sock.sendMessage(remoteJid, { text: `*📊 Platform Stats*\n\n👤 Total users: ${totalUsers}\n🚫 Banned users: ${bannedUsers}\n🪙 Coins in circulation: ${coinAgg[0]?.total || 0}\n🔑 Pending OTPs: ${pendingOtps}` }, { quoted: m });

        } else if (commandName === "top") {
            const topUsers = await models.User.find().sort({ coins: -1 }).limit(10).lean();
            if (!topUsers.length) return sock.sendMessage(remoteJid, { text: "No users found." }, { quoted: m });
            const list = topUsers.map((u, i) => `${i + 1}. ${helpers.maskNumber(u.whatsapp)} — ${u.coins} coins${u.banned ? " (banned)" : ""}`).join("\n");
            await sock.sendMessage(remoteJid, { text: `*🏆 Top 10 Coin Holders*\n\n${list}` }, { quoted: m });

        } else if (commandName === "banned") {
            const bannedList = await models.User.find({ banned: true }).limit(20).lean();
            if (!bannedList.length) return sock.sendMessage(remoteJid, { text: "✅ No banned users." }, { quoted: m });
            const list = bannedList.map((u) => `• ${helpers.maskNumber(u.whatsapp)} — ${u.banReason || "No reason"}`).join("\n");
            await sock.sendMessage(remoteJid, { text: `*🚫 Banned Users (max 20)*\n\n${list}` }, { quoted: m });

        } else if (commandName === "search") {
            const partial = helpers.normalizeWhatsapp(args[0] || "");
            if (!partial || partial.length < 3) return sock.sendMessage(remoteJid, { text: "Usage: .search <at least 3 digits>" }, { quoted: m });
            const matches = await models.User.find({ whatsapp: { $regex: partial } }).limit(10).lean();
            if (!matches.length) return sock.sendMessage(remoteJid, { text: `No accounts matching *${partial}*.` }, { quoted: m });
            const list = matches.map((u) => `• ${u.whatsapp} — ${u.coins} coins${u.banned ? " (banned)" : ""}`).join("\n");
            await sock.sendMessage(remoteJid, { text: `*🔍 Matches for "${partial}"*\n\n${list}` }, { quoted: m });
        }
    }
};
