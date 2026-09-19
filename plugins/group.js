module.exports = {
    name: "anticommand",
    alias: ["antilink", "slowmode", "mute", "unmute", "tagall", "groupinfo", "kick", "promote", "demote", "lock", "unlock", "setname", "setdesc", "warn", "warnings", "resetwarn"],
    description: "Group moderation and admin tools",
    async execute(ctx) {
        const { sock, remoteJid, m, body, commandName, senderNumber, args, config, models, caches, helpers } = ctx;

        // Owner only guard for administrative group settings
        const adminOnlyCmds = ["anticommand", "antilink", "slowmode", "mute", "unmute", "tagall", "kick", "promote", "demote", "lock", "unlock", "setname", "setdesc", "warn", "resetwarn"];
        if (adminOnlyCmds.includes(commandName) && !config.ADMIN_NUMBERS.includes(senderNumber)) {
            await sock.sendMessage(remoteJid, { text: "🚫 You are not owner." }, { quoted: m });
            return;
        }

        if (commandName === "anticommand") {
            const arg = (args[0] || "").toLowerCase();
            if (arg !== "on" && arg !== "off") return sock.sendMessage(remoteJid, { text: "Usage: .anticommand on | .anticommand off" }, { quoted: m });
            const enabled = arg === "on";
            await models.GroupSettings.findOneAndUpdate({ groupJid: remoteJid }, { anticommandEnabled: enabled }, { upsert: true });
            caches.anticommandCache.set(remoteJid, enabled);
            caches.commandSpamLog.clear();
            await sock.sendMessage(remoteJid, { text: enabled ? `🛡️ *.anticommand* is now *ON*.` : "🛡️ *.anticommand* is now *OFF*." }, { quoted: m });

        } else if (commandName === "antilink") {
            const arg = (args[0] || "").toLowerCase();
            if (arg !== "on" && arg !== "off") return sock.sendMessage(remoteJid, { text: "Usage: .antilink on | .antilink off" }, { quoted: m });
            const enabled = arg === "on";
            await models.GroupSettings.findOneAndUpdate({ groupJid: remoteJid }, { antilinkEnabled: enabled }, { upsert: true });
            caches.antilinkCache.set(remoteJid, enabled);
            await sock.sendMessage(remoteJid, { text: enabled ? `🔗🛡️ *.antilink* is now *ON*.` : "🔗🛡️ *.antilink* is now *OFF*." }, { quoted: m });

        } else if (commandName === "slowmode") {
            const secs = Number(args[0]);
            if (args[0] === undefined || !Number.isFinite(secs) || secs < 0) return sock.sendMessage(remoteJid, { text: "Usage: .slowmode <seconds> (0 to turn off)" }, { quoted: m });
            await models.GroupSettings.findOneAndUpdate({ groupJid: remoteJid }, { slowModeSecs: secs }, { upsert: true });
            caches.slowModeCache.set(remoteJid, secs);
            await sock.sendMessage(remoteJid, { text: secs > 0 ? `🐢 Slowmode is now *ON* (${secs}s).` : "🐢 Slowmode is now *OFF*." }, { quoted: m });

        } else if (commandName === "mute") {
            const ctxInfo = m.message?.extendedTextMessage?.contextInfo;
            const mentioned = ctxInfo?.mentionedJid?.[0];
            const quotedParticipant = ctxInfo?.participant;
            let targetNumber, mins;

            if (mentioned) {
                targetNumber = helpers.normalizeWhatsapp(mentioned.split("@")[0]);
                mins = Number(args[args.length - 1]);
            } else if (quotedParticipant) {
                targetNumber = helpers.normalizeWhatsapp(quotedParticipant.split("@")[0]);
                mins = Number(args[0]);
            } else {
                targetNumber = helpers.normalizeWhatsapp(args[0] || "");
                mins = Number(args[1]);
            }

            if (!targetNumber || !Number.isFinite(mins) || mins <= 0) {
                return sock.sendMessage(remoteJid, { text: "Usage: .mute 947XXXXXXXX <minutes>" }, { quoted: m });
            }
            const mutedUntil = Date.now() + mins * 60 * 1000;
            await models.Mute.findOneAndUpdate({ groupJid: remoteJid, whatsapp: targetNumber }, { mutedUntil: new Date(mutedUntil) }, { upsert: true });
            caches.muteCache.set(`${remoteJid}:${targetNumber}`, mutedUntil);
            await sock.sendMessage(remoteJid, { text: `🔇 *${targetNumber}* muted for *${mins} min*.` }, { quoted: m });

        } else if (commandName === "unmute") {
            const target = helpers.resolveTargetParticipant(m, body);
            if (!target) return sock.sendMessage(remoteJid, { text: "Usage: .unmute 947XXXXXXXX" }, { quoted: m });
            caches.muteCache.delete(`${remoteJid}:${target.number}`);
            await models.Mute.deleteOne({ groupJid: remoteJid, whatsapp: target.number });
            await sock.sendMessage(remoteJid, { text: `🔊 *${target.number}* unmuted.` }, { quoted: m });

        } else if (commandName === "tagall") {
            try {
                const metadata = await sock.groupMetadata(remoteJid);
                const mentions = metadata.participants.map((p) => p.id);
                const text = metadata.participants.map((p) => `@${p.id.split("@")[0]}`).join(" ");
                await sock.sendMessage(remoteJid, { text: `📣 *Tagging everyone:*\n\n${text}`, mentions }, { quoted: m });
            } catch (e) { await sock.sendMessage(remoteJid, { text: `❌ Error: ${e.message}` }, { quoted: m }); }

        } else if (commandName === "groupinfo") {
            try {
                const metadata = await sock.groupMetadata(remoteJid);
                const admins = metadata.participants.filter((p) => p.admin).length;
                await sock.sendMessage(remoteJid, {
                    text: `*ℹ️ Group Info*\n\n📛 Name: ${metadata.subject}\n👥 Members: ${metadata.participants.length}\n👮 Admins: ${admins}\n📝 Description: ${metadata.desc || "(none)"}\n🔒 Locked: ${metadata.announce ? "Yes" : "No"}`,
                }, { quoted: m });
            } catch (e) { await sock.sendMessage(remoteJid, { text: `❌ Error: ${e.message}` }, { quoted: m }); }

        } else if (commandName === "kick") {
            const target = helpers.resolveTargetParticipant(m, body);
            if (!target) return sock.sendMessage(remoteJid, { text: "Usage: .kick 947XXXXXXXX" }, { quoted: m });
            try {
                await sock.groupParticipantsUpdate(remoteJid, [target.jid], "remove");
                await sock.sendMessage(remoteJid, { text: `👢 Removed *${target.number}*.` }, { quoted: m });
            } catch (e) { await sock.sendMessage(remoteJid, { text: `❌ Error: ${e.message}` }, { quoted: m }); }

        } else if (commandName === "promote") {
            const target = helpers.resolveTargetParticipant(m, body);
            if (!target) return sock.sendMessage(remoteJid, { text: "Usage: .promote 947XXXXXXXX" }, { quoted: m });
            try {
                await sock.groupParticipantsUpdate(remoteJid, [target.jid], "promote");
                await sock.sendMessage(remoteJid, { text: `⬆️ Promoted *${target.number}*.` }, { quoted: m });
            } catch (e) { await sock.sendMessage(remoteJid, { text: `❌ Error: ${e.message}` }, { quoted: m }); }

        } else if (commandName === "demote") {
            const target = helpers.resolveTargetParticipant(m, body);
            if (!target) return sock.sendMessage(remoteJid, { text: "Usage: .demote 947XXXXXXXX" }, { quoted: m });
            try {
                await sock.groupParticipantsUpdate(remoteJid, [target.jid], "demote");
                await sock.sendMessage(remoteJid, { text: `⬇️ Demoted *${target.number}*.` }, { quoted: m });
            } catch (e) { await sock.sendMessage(remoteJid, { text: `❌ Error: ${e.message}` }, { quoted: m }); }

        } else if (commandName === "lock") {
            try {
                await sock.groupSettingUpdate(remoteJid, "announcement");
                await sock.sendMessage(remoteJid, { text: "🔒 Group locked." }, { quoted: m });
            } catch (e) { await sock.sendMessage(remoteJid, { text: `❌ Error: ${e.message}` }, { quoted: m }); }

        } else if (commandName === "unlock") {
            try {
                await sock.groupSettingUpdate(remoteJid, "not_announcement");
                await sock.sendMessage(remoteJid, { text: "🔓 Group unlocked." }, { quoted: m });
            } catch (e) { await sock.sendMessage(remoteJid, { text: `❌ Error: ${e.message}` }, { quoted: m }); }

        } else if (commandName === "setname") {
            const newName = body.slice(".setname".length).trim();
            if (!newName) return sock.sendMessage(remoteJid, { text: "Usage: .setname <new name>" }, { quoted: m });
            try {
                await sock.groupUpdateSubject(remoteJid, newName);
                await sock.sendMessage(remoteJid, { text: `📛 Group name updated.` }, { quoted: m });
            } catch (e) { await sock.sendMessage(remoteJid, { text: `❌ Error: ${e.message}` }, { quoted: m }); }

        } else if (commandName === "setdesc") {
            const newDesc = body.slice(".setdesc".length).trim();
            if (!newDesc) return sock.sendMessage(remoteJid, { text: "Usage: .setdesc <new desc>" }, { quoted: m });
            try {
                await sock.groupUpdateDescription(remoteJid, newDesc);
                await sock.sendMessage(remoteJid, { text: "📝 Description updated." }, { quoted: m });
            } catch (e) { await sock.sendMessage(remoteJid, { text: `❌ Error: ${e.message}` }, { quoted: m }); }

        } else if (commandName === "warn") {
            const target = helpers.resolveTargetParticipant(m, body);
            if (!target) return sock.sendMessage(remoteJid, { text: "Usage: .warn 947XXXXXXXX <reason>" }, { quoted: m });
            const reason = args.slice(1).join(" ") || "No reason given";
            const warning = await models.Warning.findOneAndUpdate({ whatsapp: target.number }, { $inc: { count: 1 },$push: { reasons: reason } }, { new: true, upsert: true });

            if (warning.count >= config.MAX_WARNINGS) {
                try {
                    await sock.groupParticipantsUpdate(remoteJid, [target.jid], "remove");
                    await sock.sendMessage(remoteJid, { text: `⚠️ *${target.number}* reached ${warning.count}/${config.MAX_WARNINGS} warnings and was removed.` }, { quoted: m });
                    await models.Warning.findOneAndUpdate({ whatsapp: target.number }, { count: 0, reasons: [] });
                } catch (e) { await sock.sendMessage(remoteJid, { text: `⚠️ Couldn't auto-remove: ${e.message}` }, { quoted: m }); }
            } else {
                await sock.sendMessage(remoteJid, { text: `⚠️ Warned *${target.number}* (${warning.count}/${config.MAX_WARNINGS}). Reason: ${reason}` }, { quoted: m });
            }

        } else if (commandName === "warnings") {
            const target = helpers.resolveTargetParticipant(m, body) || { number: senderNumber };
            if (!config.ADMIN_NUMBERS.includes(senderNumber) && target.number !== senderNumber) {
                return sock.sendMessage(remoteJid, { text: "🚫 You can only check your own warnings." }, { quoted: m });
            }
            const warning = await models.Warning.findOne({ whatsapp: target.number }).lean();
            if (!warning || warning.count === 0) return sock.sendMessage(remoteJid, { text: `✅ *${target.number}* has no warnings.` }, { quoted: m });
            const list = warning.reasons.map((r, i) => `${i + 1}. ${r}`).join("\n");
            await sock.sendMessage(remoteJid, { text: `*⚠️ Warnings for ${target.number} (${warning.count}/${config.MAX_WARNINGS})*\n\n${list}` }, { quoted: m });

        } else if (commandName === "resetwarn") {
            const target = helpers.resolveTargetParticipant(m, body);
            if (!target) return sock.sendMessage(remoteJid, { text: "Usage: .resetwarn 947XXXXXXXX" }, { quoted: m });
            await models.Warning.findOneAndUpdate({ whatsapp: target.number }, { count: 0, reasons: [] }, { upsert: true });
            await sock.sendMessage(remoteJid, { text: `✅ Cleared warnings for *${target.number}*.` }, { quoted: m });
        }
    }
};
