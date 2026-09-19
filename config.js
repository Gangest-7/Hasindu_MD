// ================================================================
//  Hasindu-OTP-Bot · config
// ------------------------------------------------------------------
//  Real secrets belong in environment variables, NOT in this file.
//  Set them on your host (Render/Railway/VPS/.env file, etc.) — env
//  vars always win over anything written here. This file only ships
//  safe placeholders so it's safe to keep in your repo.
//
//  Quickest local setup: copy .env.example to .env, fill in real
//  values there (dotenv loads it automatically — see index.js).
// ================================================================

function required(name, placeholder) {
    const val = process.env[name];
    if (!val || val === placeholder) {
        console.warn(`⚠️  ${name} is not set — using a placeholder/dev value. Set a real ${name} env var before deploying publicly.`);
        return placeholder;
    }
    return val;
}

module.exports = {
    // MongoDB connection string — MUST be the exact same one used in
    // the main Hashu-APIs site's config.js, so this bot reads from the
    // SAME PendingOtp collection. MUST be set via env var.
    MONGO_URL: required("MONGO_URL", "mongodb+srv://imajithhasindu2_db_user:9Q3WxklsKkh24gaE@cluster0.yl6bp78.mongodb.net/?appName=Cluster0"),

    // The WhatsApp number THIS BOT ACCOUNT itself uses to log in,
    // digits only, country code first, no "+", no spaces/dashes.
    BOT_PHONE_NUMBER: (process.env.BOT_PHONE_NUMBER || "94786173599").replace(/[^0-9]/g, ""),

    // The official signup-verification group's JID, e.g.
    // "1203630XXXXXXXXX@g.us". Leave blank while testing to see the
    // bot respond in ANY chat (useful to discover the JID the first
    // time); set it once known so replies are restricted to this
    // group only.
    GROUP_JID: process.env.GROUP_JID || "",

    // Must match sawi.js's OTP_TTL_MS on the main site — how long a
    // generated code stays valid after creation, in milliseconds.
    OTP_TTL_MS: Number(process.env.OTP_TTL_MS) || 45 * 60 * 1000,

    // Per-number cooldown so someone spamming ".requested" in the
    // group can't hammer the DB or get DM'd repeatedly within seconds.
    LOOKUP_COOLDOWN_MS: Number(process.env.LOOKUP_COOLDOWN_MS) || 15 * 1000,

    // How often (ms) the bot checks the DB for new/refreshed pending
    // codes to auto-DM, instead of waiting for someone to type .requested.
    POLL_INTERVAL_MS: Number(process.env.POLL_INTERVAL_MS) || 10 * 1000,

    // The exact command members type in the group to get their code.
    TRIGGER: process.env.TRIGGER || ".requested",

    // Numbers allowed to use admin-only commands like .getcode, digits
    // only, comma-separated for multiple. Digits are compared after
    // normalizing (no +/spaces/dashes), same as the main site's admin check.
    ADMIN_NUMBERS: (process.env.ADMIN_NUMBERS || "94786173599")
        .split(",")
        .map((n) => n.replace(/[^0-9]/g, ""))
        .filter(Boolean),

    // "silent" | "info" | "debug" — passed straight to pino.
    LOG_LEVEL: process.env.LOG_LEVEL || "silent",

    // Max number of OTHER numbers that can be paired in via .pair at the
    // same time (on top of the main bot). Each one runs as its own
    // WhatsApp connection with the full command set, inside this same
    // process.
    MAX_SUB_BOTS: Number(process.env.MAX_SUB_BOTS) || 5,

    // How many .warn strikes a member can accumulate before .warn
    // auto-kicks them from the group (requires the bot to be a group admin).
    MAX_WARNINGS: Number(process.env.MAX_WARNINGS) || 3,

    // .anticommand spam guard: how many commands (non-owners only) within
    // ANTICOMMAND_WINDOW_MS triggers an auto-kick, once toggled on for a group.
    ANTICOMMAND_LIMIT: Number(process.env.ANTICOMMAND_LIMIT) || 3,
    ANTICOMMAND_WINDOW_MS: Number(process.env.ANTICOMMAND_WINDOW_MS) || 60 * 1000,
};
