require("dotenv").config();
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const pino = require("pino");
const {
    default: makeWASocket,
    fetchLatestBaileysVersion,
    DisconnectReason,
    jidNormalizedUser,
    Browsers,
    proto,
    generateWAMessageFromContent,
} = require("@whiskeysockets/baileys");
const { useMongoAuthState } = require("./mongoAuthState");
const config = require("./config");

// Config
const MONGO_URL = config.MONGO_URL;
const BOT_PHONE_NUMBER = config.BOT_PHONE_NUMBER;
const GROUP_JID = config.GROUP_JID ? config.GROUP_JID.trim() : "";
const TRIGGER = config.TRIGGER;
const ADMIN_NUMBERS = config.ADMIN_NUMBERS;
const MAX_SUB_BOTS = config.MAX_SUB_BOTS;
const MAX_WARNINGS = config.MAX_WARNINGS;
const ANTICOMMAND_LIMIT = config.ANTICOMMAND_LIMIT;
const ANTICOMMAND_WINDOW_MS = config.ANTICOMMAND_WINDOW_MS;
const OTP_TTL_MS = config.OTP_TTL_MS;
const POLL_INTERVAL_MS = config.POLL_INTERVAL_MS;
const LOOKUP_COOLDOWN_MS = config.LOOKUP_COOLDOWN_MS;

if (!MONGO_URL) {
    console.error("❌ MONGO_URL is not set.");
    process.exit(1);
}
if (!BOT_PHONE_NUMBER) {
    console.error("❌ BOT_PHONE_NUMBER is not set.");
    process.exit(1);
}

// Schemas & Models
const pendingOtpSchema = new mongoose.Schema({
    whatsapp: { type: String, required: true, unique: true, trim: true },
    code: { type: String, required: true },
    attempts: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now, expires: 60 * 60 },
    notifiedCode: { type: String, default: "" },
});
const PendingOtp = mongoose.models.PendingOtp || mongoose.model("PendingOtp", pendingOtpSchema);

const userSchema = new mongoose.Schema({
    whatsapp: { type: String, required: true, unique: true, trim: true },
    banned: { type: Boolean, default: false },
    banReason: { type: String, default: "" },
    bannedAt: { type: Date },
    coins: { type: Number, default: 200 },
});
const User = mongoose.models.User || mongoose.model("User", userSchema);

const warningSchema = new mongoose.Schema({
    whatsapp: { type: String, required: true, unique: true, trim: true },
    count: { type: Number, default: 0 },
    reasons: { type: [String], default: [] },
});
const Warning = mongoose.models.Warning || mongoose.model("Warning", warningSchema);

const groupSettingsSchema = new mongoose.Schema({
    groupJid: { type: String, required: true, unique: true, trim: true },
    anticommandEnabled: { type: Boolean, default: false },
    antilinkEnabled: { type: Boolean, default: false },
    slowModeSecs: { type: Number, default: 0 },
});
const GroupSettings = mongoose.models.GroupSettings || mongoose.model("GroupSettings", groupSettingsSchema);

const muteSchema = new mongoose.Schema({
    groupJid: { type: String, required: true, trim: true },
    whatsapp: { type: String, required: true, trim: true },
    mutedUntil: { type: Date, required: true },
});
muteSchema.index({ groupJid: 1, whatsapp: 1 }, { unique: true });
const Mute = mongoose.models.Mute || mongoose.model("Mute", muteSchema);

// In-Memory Caches
const anticommandCache = new Map();
const antilinkCache = new Map();
const slowModeCache = new Map();
const muteCache = new Map();
const lastMessageAt = new Map();
const commandSpamLog = new Map();
const subBots = new Map();
const commands = new Map();
const lastLookup = {};

const LINK_REGEX = /(https?:\/\/|www\.|chat\.whatsapp\.com\/)\S+/i;

// Plugin Loader
function loadPlugins() {
    commands.clear();
    const pluginsDir = path.join(__dirname, "plugins");
    if (!fs.existsSync(pluginsDir)) fs.mkdirSync(pluginsDir);

    const files = fs.readdirSync(pluginsDir).filter((file) => file.endsWith(".js"));
    for (const file of files) {
        try {
            const pluginPath = path.join(pluginsDir, file);
            delete require.cache[require.resolve(pluginPath)];
            const plugin = require(pluginPath);
            if (plugin.name && plugin.execute) {
                commands.set(plugin.name.toLowerCase(), plugin);
                if (plugin.alias && Array.isArray(plugin.alias)) {
                    plugin.alias.forEach((a) => commands.set(a.toLowerCase(), plugin));
                }
            }
        } catch (e) {
            console.error(`❌ Error loading plugin ${file}:`, e.message);
        }
    }
    console.log(`🔌 Loaded ${commands.size} plugin command registration(s).`);
}

// Helpers
function normalizeWhatsapp(whatsapp) {
    return (whatsapp || "").replace(/[^0-9]/g, "");
}

function resolveTargetParticipant(m, body) {
    const ctx = m.message?.extendedTextMessage?.contextInfo;
    const mentioned = ctx?.mentionedJid?.[0];
    if (mentioned) return { number: normalizeWhatsapp(mentioned.split("@")[0]), jid: mentioned };
    const quotedParticipant = ctx?.participant;
    if (quotedParticipant) return { number: normalizeWhatsapp(quotedParticipant.split("@")[0]), jid: quotedParticipant };
    const typedNumber = normalizeWhatsapp(body.split(/\s+/)[1] || "");
    if (typedNumber) return { number: typedNumber, jid: `${typedNumber}@s.whatsapp.net` };
    return null;
}

function maskNumber(number) {
    if (number.length <= 5) return number;
    return number.slice(0, 4) + "*".repeat(number.length - 6) + number.slice(-2);
}

function toBoldSans(str) {
    const upperStart = 0x1d5d4, lowerStart = 0x1d5ee, digitStart = 0x1d7ec;
    return str.split("").map((ch) => {
        const code = ch.charCodeAt(0);
        if (code >= 65 && code <= 90) return String.fromCodePoint(upperStart + (code - 65));
        if (code >= 97 && code <= 122) return String.fromCodePoint(lowerStart + (code - 97));
        if (code >= 48 && code <= 57) return String.fromCodePoint(digitStart + (code - 48));
        return ch;
    }).join("");
}

function formatDuration(totalSecs) {
    const h = Math.floor(totalSecs / 3600);
    const mn = Math.floor((totalSecs % 3600) / 60);
    const s = Math.floor(totalSecs % 60);
    return `${h}h ${mn}m ${s}s`;
}

function buildBanner(uptimeSecs) {
    const gradient = "▓▓▒▒░░ ✦ ░░▒▒▓▓ ✦ ▓▓▒▒░░ ✦ ░░▒▒▓▓";
    return (
        `${gradient}\n` +
        `${toBoldSans("HASHU OTP BOT")}\n` +
        `${gradient}\n\n` +
        `⏱️ ${toBoldSans("Uptime")}: ${formatDuration(uptimeSecs)}\n` +
        `🛰️ ${toBoldSans("Status")}: Online & verifying\n` +
        `🔖 ${toBoldSans("Linked to")}: Hashu-APIs`
    );
}

function buildMenuCategories() {
    return [
        {
            id: "general",
            emoji: "🧩",
            title: "General",
            commands: [
                { cmd: ".ping", desc: "check if the bot is alive" },
                { cmd: ".menu", desc: "open this menu" },
                { cmd: ".uptime", desc: "bot uptime" },
                { cmd: ".myid", desc: "show your resolved WhatsApp number" },
                { cmd: ".rules", desc: "group rules" },
            ],
        },
        {
            id: "verify",
            emoji: "🔑",
            title: "Verification",
            commands: [
                { cmd: ".code 947XXXXXXXX", desc: "get a pending signup code directly in the group" },
                { cmd: `${TRIGGER} [947XXXXXXXX]`, desc: "self-request your own pending code" },
            ],
        },
        {
            id: "pairing",
            emoji: "🔗",
            title: "Pairing",
            commands: [
                { cmd: ".pair [947XXXXXXXX]", desc: `link a number as its own bot (defaults to your number; max ${MAX_SUB_BOTS} at once)` },
                { cmd: ".unpair 947XXXXXXXX", desc: "disconnect a paired bot and free its slot" },
                { cmd: ".unpairall", desc: "disconnect every paired bot at once" },
                { cmd: ".pairstatus", desc: "list currently paired bots" },
            ],
        },
        {
            id: "self",
            emoji: "🙋",
            title: "Self-Service",
            commands: [
                { cmd: ".balance / .coins", desc: "check your coin balance" },
                { cmd: ".status", desc: "check your account/ban status" },
            ],
        },
        {
            id: "owner_codes",
            emoji: "🔐",
            title: "Owner — Codes",
            commands: [{ cmd: ".getcode 947XXXXXXXX", desc: "look up any number's code" }],
        },
        {
            id: "owner_users",
            emoji: "👤",
            title: "Owner — Users",
            commands: [
                { cmd: ".ban 947XXXXXXXX <reason>", desc: "ban a user" },
                { cmd: ".unban 947XXXXXXXX", desc: "unban a user" },
                { cmd: ".addcoins 947XXXXXXXX <amount>", desc: "add/remove coins" },
                { cmd: ".setcoins 947XXXXXXXX <amount>", desc: "set exact coin balance" },
                { cmd: ".search <partial digits>", desc: "find accounts by partial number" },
            ],
        },
        {
            id: "owner_insights",
            emoji: "📊",
            title: "Owner — Insights",
            commands: [
                { cmd: ".stats", desc: "platform-wide stats" },
                { cmd: ".top", desc: "top 10 coin holders" },
                { cmd: ".banned", desc: "list currently banned users" },
            ],
        },
        {
            id: "owner_group",
            emoji: "📢",
            title: "Owner — Group",
            commands: [
                { cmd: ".broadcast <message>", desc: "announce to this group" },
                { cmd: ".anticommand on|off", desc: `warn (then auto-kick) spammers who fire ${ANTICOMMAND_LIMIT}+ commands within ${ANTICOMMAND_WINDOW_MS / 1000}s` },
                { cmd: ".antilink on|off", desc: "delete links/invites from non-owners (warn, then auto-kick)" },
                { cmd: ".slowmode <secs>", desc: "limit non-owners to one message every N seconds (0 = off)" },
                { cmd: ".mute 947XXXXXXXX <minutes>", desc: "silence a member for N minutes (or reply/mention them)" },
                { cmd: ".unmute 947XXXXXXXX", desc: "lift a mute early (or reply/mention them)" },
                { cmd: ".tagall", desc: "mention every member in the group" },
                { cmd: ".groupinfo", desc: "group name, member/admin count, lock status" },
                { cmd: ".kick 947XXXXXXXX", desc: "remove a member (or reply/mention them)" },
                { cmd: ".promote 947XXXXXXXX", desc: "make a member a group admin" },
                { cmd: ".demote 947XXXXXXXX", desc: "remove a member's group admin status" },
                { cmd: ".lock / .unlock", desc: "restrict the group to admins-only messaging" },
                { cmd: ".setname <name>", desc: "rename the group" },
                { cmd: ".setdesc <text>", desc: "update the group description" },
                { cmd: ".warn 947XXXXXXXX <reason>", desc: `warn a member (auto-kicks at ${MAX_WARNINGS})` },
                { cmd: ".warnings [947XXXXXXXX]", desc: "view warning count/reasons" },
                { cmd: ".resetwarn 947XXXXXXXX", desc: "clear a member's warnings" },
            ],
        },
    ];
}

function categoryDetailText(cat) {
    const header = `${cat.emoji}  ${toBoldSans(cat.title)}`;
    const divider = "┈".repeat(24);
    const body = cat.commands.map((c) => `▸ *${c.cmd}*\n   ↳ ${c.desc}`).join("\n\n");
    return `${header}\n${divider}\n\n${body}\n\n${divider}\n_Type *.menu* to go back to categories._`;
}

function fullMenuFallbackText(uptimeSecs) {
    const sections = buildMenuCategories()
        .map((cat) => categoryDetailText(cat).replace(/\n_Type \*\.menu\*.*$/, ""))
        .join("\n\n");
    return (
        `${buildBanner(uptimeSecs)}\n\n${sections}\n\n` +
        '_(Owner-only commands will reply "You are not owner" if used by anyone else.\n' +
        "Kick/promote/demote/lock/unlock/setname/setdesc require the BOT ACCOUNT itself to be a group admin.)_"
    );
}

async function sendInteractive(sock, jid, { text, footer, title, buttons, quoted }) {
    const generated = generateWAMessageFromContent(
        jid,
        {
            viewOnceMessage: {
                message: {
                    messageContextInfo: { deviceListMetadataVersion: 2, deviceListMetadata: {} },
                    interactiveMessage: proto.Message.InteractiveMessage.create({
                        body: proto.Message.InteractiveMessage.Body.create({ text }),
                        footer: proto.Message.InteractiveMessage.Footer.create({ text: footer || "" }),
                        header: proto.Message.InteractiveMessage.Header.create({ title: title || "", hasMediaAttachment: false }),
                        nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({ buttons }),
                    }),
                },
            },
        },
        { userJid: sock.user?.id, quoted }
    );
    await sock.relayMessage(jid, generated.message, { messageId: generated.key.id });
    return generated;
}

async function lookupCode(whatsapp) {
    const now = Date.now();
    if (lastLookup[whatsapp] && now - lastLookup[whatsapp] < LOOKUP_COOLDOWN_MS) return { status: "cooldown" };
    lastLookup[whatsapp] = now;
    const doc = await PendingOtp.findOne({ whatsapp }).lean();
    if (!doc) return { status: "none" };
    if (Date.now() - new Date(doc.createdAt).getTime() > OTP_TTL_MS) return { status: "expired" };
    return { status: "ok", code: doc.code };
}

async function pollForNewCodes(sock) {
    try {
        const docs = await PendingOtp.find({ $expr: { $ne: ["$code", "$notifiedCode"] } });
        for (const doc of docs) {
            const number = normalizeWhatsapp(doc.whatsapp);
            if (GROUP_JID) {
                await sock.sendMessage(GROUP_JID, { text: `🔔 New verification code issued for *${number}*:\n\n*${doc.code}*` });
            }
            doc.notifiedCode = doc.code;
            await doc.save();
        }
    } catch (e) {
        console.error("Poll error:", e.message);
    }
}

// Sub-Bots
async function startSubBot(number, requesterJid, mainSock) {
    const existing = subBots.get(number);
    if (existing && existing.status !== "logged_out") {
        await mainSock.sendMessage(requesterJid, { text: `⚠️ *${number}* is already paired or connecting.` });
        return;
    }
    if (subBots.size >= MAX_SUB_BOTS && !existing) {
        await mainSock.sendMessage(requesterJid, { text: `🚫 Max ${MAX_SUB_BOTS} paired bots already active.` });
        return;
    }

    subBots.set(number, { status: "connecting", sock: null });
    try {
        const { state, saveCreds } = await useMongoAuthState(`sub-${number}`);
        const { version } = await fetchLatestBaileysVersion();

        const sock = makeWASocket({
            version,
            auth: state,
            logger: pino({ level: config.LOG_LEVEL }),
            printQRInTerminal: false,
            browser: Browsers.ubuntu("Chrome"),
        });

        if (!sock.authState.creds.registered) {
            setTimeout(async () => {
                try {
                    const code = await sock.requestPairingCode(number);
                    await mainSock.sendMessage(requesterJid, {
                        text: `🔗 *Pairing code for ${number}:*\n\n*${code}*\n\nWhatsApp > Linked Devices > Link a Device > Link with phone number instead.`,
                    });
                } catch (e) {
                    subBots.delete(number);
                    await mainSock.sendMessage(requesterJid, { text: `❌ Couldn't generate pairing code for *${number}*: ${e.message}` });
                }
            }, 3000);
        }

        sock.ev.on("creds.update", saveCreds);
        sock.ev.on("connection.update", (update) => {
            const { connection, lastDisconnect } = update;
            if (connection === "close") {
                const loggedOut = lastDisconnect?.error?.output?.statusCode === DisconnectReason.loggedOut;
                if (loggedOut) {
                    subBots.set(number, { status: "logged_out", sock: null });
                } else {
                    startSubBot(number, requesterJid, mainSock).catch(console.error);
                }
            } else if (connection === "open") {
                subBots.set(number, { status: "connected", sock });
            }
        });

        sock.ev.on("messages.upsert", async ({ messages, type }) => {
            if (type !== "notify") return;
            for (const m of messages) await handleMessage(sock, m);
        });
    } catch (e) {
        subBots.delete(number);
        await mainSock.sendMessage(requesterJid, { text: `❌ Failed to start pairing for *${number}*.` });
    }
}

// Bot Connection
const logger = pino({ level: config.LOG_LEVEL });
let pollIntervalHandle = null;

async function startBot() {
    loadPlugins();

    try {
        const activeMutes = await Mute.find({ mutedUntil: { $gt: new Date() } }).lean();
        for (const mu of activeMutes) muteCache.set(`${mu.groupJid}:${mu.whatsapp}`, new Date(mu.mutedUntil).getTime());
        console.log(`🔇 Preloaded ${activeMutes.length} active mute(s).`);
    } catch (e) {
        console.error("Mute preload error:", e.message);
    }

    const { state, saveCreds } = await useMongoAuthState(BOT_PHONE_NUMBER);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        logger,
        printQRInTerminal: false,
        browser: Browsers.ubuntu("Chrome"),
    });

    if (!sock.authState.creds.registered) {
        setTimeout(async () => {
            try {
                const code = await sock.requestPairingCode(BOT_PHONE_NUMBER);
                console.log("\n=================================");
                console.log("  PAIRING CODE:", code);
                console.log("=================================\n");
            } catch (e) {
                console.error("Failed to request pairing code:", e);
            }
        }, 3000);
    }

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === "close") {
            const loggedOut = lastDisconnect?.error?.output?.statusCode === DisconnectReason.loggedOut;
            if (!loggedOut) startBot();
        } else if (connection === "open") {
            console.log("✅ Bot connected to WhatsApp.");
            if (GROUP_JID) {
                sock.sendMessage(GROUP_JID, { text: "🤖 Hashu-OTP-Bot is online and monitoring for new signups." }).catch(() => {});
            }
            if (pollIntervalHandle) clearInterval(pollIntervalHandle);
            pollIntervalHandle = setInterval(() => pollForNewCodes(sock), POLL_INTERVAL_MS);
        }
    });

    sock.ev.on("group-participants.update", async (update) => {
        try {
            if (!GROUP_JID || update.id !== GROUP_JID || update.action !== "add") return;
            for (const participantJid of update.participants) {
                await sock.sendMessage(GROUP_JID, {
                    text: `👋 Welcome @${participantJid.split("@")[0]}! This group is for *Hashu-APIs* signup verification.\n\nType *.menu* to see what I can do, or *.code 947XXXXXXXX* to get your signup code.`,
                    mentions: [participantJid],
                });
            }
        } catch (e) {
            console.error("Welcome message error:", e.message);
        }
    });

    sock.ev.on("messages.upsert", async ({ messages, type }) => {
        if (type !== "notify") return;
        for (const m of messages) await handleMessage(sock, m);
    });
}

// Message Dispatcher
async function handleMessage(sock, m) {
    if (!m.message || m.key.fromMe) return;

    let msgContent = m.message;
    if (msgContent.ephemeralMessage) msgContent = msgContent.ephemeralMessage.message;
    if (msgContent.viewOnceMessage) msgContent = msgContent.viewOnceMessage.message;
    if (msgContent.viewOnceMessageV2) msgContent = msgContent.viewOnceMessageV2.message;

    const remoteJid = m.key.remoteJid;
    const isGroup = remoteJid.endsWith("@g.us");
    if (!isGroup) return;

    const rawSenderJid = m.key.participant || m.key.remoteJid;
    const pnJid = m.key.participantPn || m.key.participantAlt || null;
    const isUnresolvedLid = rawSenderJid.endsWith("@lid") && !pnJid;
    const senderJid = isUnresolvedLid ? rawSenderJid : (pnJid || rawSenderJid);
    const senderNumber = normalizeWhatsapp(jidNormalizedUser(senderJid).split("@")[0]);
    const body = (msgContent.conversation || msgContent.extendedTextMessage?.text || "").trim();

    // Mute enforcement
    if (!ADMIN_NUMBERS.includes(senderNumber)) {
        const muteKey = `${remoteJid}:${senderNumber}`;
        const mutedUntil = muteCache.get(muteKey);
        if (mutedUntil) {
            if (Date.now() < mutedUntil) {
                await sock.sendMessage(remoteJid, { delete: m.key }).catch(() => {});
                return;
            } else {
                muteCache.delete(muteKey);
                Mute.deleteOne({ groupJid: remoteJid, whatsapp: senderNumber }).catch(() => {});
            }
        }
    }

    // Slowmode enforcement
    if (!ADMIN_NUMBERS.includes(senderNumber)) {
        let slowSecs = slowModeCache.get(remoteJid);
        if (slowSecs === undefined) {
            const doc = await GroupSettings.findOne({ groupJid: remoteJid }).lean();
            slowSecs = doc ? Number(doc.slowModeSecs) || 0 : 0;
            slowModeCache.set(remoteJid, slowSecs);
        }
        if (slowSecs > 0) {
            const key = `${remoteJid}:${senderNumber}`;
            const now = Date.now();
            const last = lastMessageAt.get(key) || 0;
            if (now - last < slowSecs * 1000) {
                await sock.sendMessage(remoteJid, { delete: m.key }).catch(() => {});
                return;
            }
            lastMessageAt.set(key, now);
        }
    }

    // Antilink enforcement
    if (!ADMIN_NUMBERS.includes(senderNumber) && LINK_REGEX.test(body)) {
        let antilinkOn = antilinkCache.get(remoteJid);
        if (antilinkOn === undefined) {
            const doc = await GroupSettings.findOne({ groupJid: remoteJid }).lean();
            antilinkOn = !!doc?.antilinkEnabled;
            antilinkCache.set(remoteJid, antilinkOn);
        }
        if (antilinkOn) {
            await sock.sendMessage(remoteJid, { delete: m.key }).catch(() => {});
            const warning = await Warning.findOneAndUpdate(
                { whatsapp: senderNumber },
                { $inc: { count: 1 }, $push: { reasons: "Anti-link: posted a link/invite" } },
                { new: true, upsert: true }
            );
            if (warning.count >= MAX_WARNINGS) {
                try {
                    await sock.groupParticipantsUpdate(remoteJid, [senderJid], "remove");
                    await sock.sendMessage(remoteJid, { text: `🚫 *${senderNumber}* reached ${warning.count}/${MAX_WARNINGS} warnings (link spam) and was removed.` });
                    await Warning.findOneAndUpdate({ whatsapp: senderNumber }, { count: 0, reasons: [] });
                } catch (e) {
                    await sock.sendMessage(remoteJid, { text: `⚠️ Couldn't remove *${senderNumber}*: ${e.message}` });
                }
            } else {
                await sock.sendMessage(remoteJid, { text: `🔗🚫 *${senderNumber}*'s link was removed (${warning.count}/${MAX_WARNINGS} warnings).` });
            }
            return;
        }
    }

    // Anticommand protection
    const looksLikeCommand = body.startsWith(".");
    if (looksLikeCommand && !ADMIN_NUMBERS.includes(senderNumber)) {
        let anticommandOn = anticommandCache.get(remoteJid);
        if (anticommandOn === undefined) {
            const doc = await GroupSettings.findOne({ groupJid: remoteJid }).lean();
            anticommandOn = !!doc?.anticommandEnabled;
            anticommandCache.set(remoteJid, anticommandOn);
        }
        if (anticommandOn) {
            const now = Date.now();
            const recent = (commandSpamLog.get(senderNumber) || []).filter((t) => now - t < ANTICOMMAND_WINDOW_MS);
            recent.push(now);
            commandSpamLog.set(senderNumber, recent);

            if (recent.length >= ANTICOMMAND_LIMIT) {
                commandSpamLog.delete(senderNumber);
                const warning = await Warning.findOneAndUpdate(
                    { whatsapp: senderNumber },
                    { $inc: { count: 1 },$push: { reasons: "Anti-command spam" } },
                    { new: true, upsert: true }
                );
                if (warning.count >= MAX_WARNINGS) {
                    try {
                        await sock.groupParticipantsUpdate(remoteJid, [senderJid], "remove");
                        await Warning.findOneAndUpdate({ whatsapp: senderNumber }, { count: 0, reasons: [] });
                    } catch (e) {}
                }
                return;
            }
        }
    }

    // Menu Interactive Selection Response
    let menuSelectedId = msgContent.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson
        ? JSON.parse(msgContent.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson)?.id
        : msgContent.listResponseMessage?.singleSelectReply?.selectedRowId;

    if (menuSelectedId && menuSelectedId.startsWith("menu_")) {
        const catId = menuSelectedId.slice("menu_".length);
        const cat = buildMenuCategories().find((c) => c.id === catId);
        if (cat) {
            await sock.sendMessage(remoteJid, { text: categoryDetailText(cat) }, { quoted: m });
        }
        return;
    }

    // Unresolved LID check
    if (isUnresolvedLid && body.startsWith(".")) {
        await sock.sendMessage(remoteJid, {
            text: "⚠️ Couldn't verify your real WhatsApp number for this command. Try sending a DM once to the bot.",
        }, { quoted: m });
        return;
    }

    // Command Parser
    let commandName = "";
    let args = [];

    if (body.toLowerCase().startsWith(TRIGGER)) {
        commandName = TRIGGER;
        args = body.slice(TRIGGER.length).trim().split(/\s+/).filter(Boolean);
    } else if (body.startsWith(".")) {
        const parts = body.slice(1).trim().split(/\s+/);
        commandName = parts[0].toLowerCase();
        args = parts.slice(1);
    } else {
        return;
    }

    const plugin = commands.get(commandName);
    if (plugin) {
        if (plugin.ownerOnly && !ADMIN_NUMBERS.includes(senderNumber)) {
            await sock.sendMessage(remoteJid, { text: "🚫 You are not owner." }, { quoted: m });
            return;
        }

        const ctx = {
            sock, m, body, remoteJid, senderNumber, senderJid, isUnresolvedLid, args, commandName, config,
            models: { PendingOtp, User, Warning, GroupSettings, Mute },
            caches: { anticommandCache, antilinkCache, slowModeCache, muteCache, lastMessageAt, subBots, commands, commandSpamLog },
            helpers: {
                normalizeWhatsapp, resolveTargetParticipant, maskNumber, toBoldSans,
                formatDuration, buildBanner, buildMenuCategories, categoryDetailText,
                fullMenuFallbackText, sendInteractive, lookupCode, startSubBot, loadPlugins
            }
        };

        try {
            await plugin.execute(ctx);
        } catch (e) {
            console.error(`Error executing plugin [${commandName}]:`, e);
            await sock.sendMessage(remoteJid, { text: `❌ Error executing command: ${e.message}` }, { quoted: m });
        }
    }
}

mongoose.connect(MONGO_URL).then(() => {
    console.log("✅ Connected to MongoDB.");
    startBot();
}).catch((e) => {
    console.error("❌ MongoDB connection failed:", e.message);
    process.exit(1);
});
