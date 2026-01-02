const makeWASocket = require("@whiskeysockets/baileys").default;
const {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} = require("@whiskeysockets/baileys");
const P = require("pino");
const qrcode = require("qrcode-terminal");
const express = require("express");
const fs = require("fs");

const config = require("./config.json");

const {
  getBannedWords,
  detectViolation,
  pushViolationCounter,
  addBannedWord,
  removeBannedWord,
  resetCounter,
} = require("./lib/moderation");

const { createCase } = require("./lib/caseManager");
const { buildViolationPanel } = require("./lib/uiPanel");
const { formatTimeNow, jidToPhone } = require("./lib/helpers");

const {
  handleAdminDecision,
  setGroupTimezone,
  getGroupSettings,
  setGroupName,
} = require("./lib/actionHandler");

const { startScheduler } = require("./lib/scheduler");

// =====================
// ✅ Railway requirements
// =====================
const AUTH_PATH = process.env.AUTH_PATH || "/app/auth"; // mount volume to /app/auth
const PORT = process.env.PORT || 3000;

// =====================
// ✅ HTTP server - Railway wajib listen PORT
// =====================
const app = express();
app.get("/", (req, res) => res.send("OK - WA Moderation Bot Running (Railway)"));
app.get("/health", (req, res) =>
  res.json({ ok: true, time: new Date().toISOString() })
);
app.listen(PORT, () => console.log(`✅ HTTP server running on ${PORT}`));

// =====================
// ✅ Global crash guard
// =====================
process.on("unhandledRejection", (reason) => {
  console.error("❌ Unhandled Rejection:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("❌ Uncaught Exception:", err);
});

// =====================
// ✅ Safe wrappers
// =====================
async function safeSend(sock, jid, payload) {
  try {
    await sock.sendMessage(jid, payload);
  } catch (e) {
    console.error("sendMessage error:", e?.message || e);
  }
}

async function safeGroupMetadata(sock, groupId) {
  try {
    return await sock.groupMetadata(groupId);
  } catch (e) {
    console.error("groupMetadata error:", e?.message || e);
    return null;
  }
}

// =====================
// ✅ Anti start loop
// =====================
let isStarting = false;

async function startBot() {
  if (isStarting) return;
  isStarting = true;

  // ensure auth folder exists
  try {
    fs.mkdirSync(AUTH_PATH, { recursive: true });
  } catch (e) {
    console.error("❌ AUTH_PATH mkdir error:", e);
  }

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_PATH);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    logger: P({ level: "silent" }),
    auth: state,
    printQRInTerminal: true,
    markOnlineOnConnect: false,
    syncFullHistory: false,
  });

  sock.ev.on("creds.update", saveCreds);

  // ✅ scheduler start (once)
  startScheduler(sock, config, getGroupSettings);

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log("📌 Scan QR untuk login:");
      qrcode.generate(qr, { small: true });
    }

    if (connection === "open") {
      console.log("✅ Bot connected!");
    }

    if (connection === "close") {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      console.log("⚠️ Connection closed. Code:", statusCode);

      if (statusCode === DisconnectReason.loggedOut) {
        console.log("❌ Logged out. Hapus /app/auth lalu scan QR ulang.");
        return;
      }

      // ✅ reconnect delay to prevent crash loop
      console.log("🔁 Reconnecting in 5 seconds...");
      setTimeout(() => {
        isStarting = false;
        startBot().catch(console.error);
      }, 5000);
    }
  });

  // =====================
  // ✅ SINGLE messages handler (FIX CRASH)
  // =====================
  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages?.[0];
    if (!msg?.message) return;

    const from = msg.key.remoteJid;

    // ✅ DM admin handler (buttons decision)
    if (!from.endsWith("@g.us")) {
      await handleAdminDecision(sock, msg);
      return;
    }

    // ✅ group messages only
    const sender = msg.key.participant;
    if (!sender) return;

    // ✅ bypass admin whitelist
    if (config.admins.includes(sender)) return;

    // ✅ text extraction
    const text =
      msg.message?.conversation ||
      msg.message?.extendedTextMessage?.text ||
      msg.message?.imageMessage?.caption ||
      msg.message?.videoMessage?.caption ||
      "";

    // =====================
    // ✅ ADMIN COMMANDS (only from whitelist)
    // =====================
    if (text.startsWith("!")) {
      if (!config.admins.includes(sender)) return;

      const args = text.trim().split(/\s+/);
      const cmd = args[0].toLowerCase();
      const value = args.slice(1).join(" ");

      if (cmd === "!help") {
        return safeSend(sock, from, {
          text:
            `📌 *Admin Commands*\n` +
            `!addword <kata> - tambah blacklist\n` +
            `!removeword <kata> - hapus blacklist\n` +
            `!listwords - lihat blacklist\n` +
            `!resetcounter - reset counter grup\n` +
            `!settimezone WIB|WITA|WIT\n` +
            `!groupstatus`,
        });
      }

      if (cmd === "!addword" && value) {
        addBannedWord(value);
        return safeSend(sock, from, { text: `✅ Ditambah blacklist: ${value}` });
      }

      if (cmd === "!removeword" && value) {
        removeBannedWord(value);
        return safeSend(sock, from, { text: `✅ Dihapus blacklist: ${value}` });
      }

      if (cmd === "!listwords") {
        const list = getBannedWords();
        return safeSend(sock, from, {
          text: `📌 Blacklist:\n- ${list.join("\n- ")}`,
        });
      }

      if (cmd === "!resetcounter") {
        resetCounter(from);
        return safeSend(sock, from, { text: "✅ Counter grup direset." });
      }

      if (cmd === "!settimezone") {
        const tz = (args[1] || "").toUpperCase();
        if (!["WIB", "WITA", "WIT"].includes(tz)) {
          return safeSend(sock, from, {
            text: "❌ Format salah. !settimezone WIB|WITA|WIT",
          });
        }
        setGroupTimezone(from, tz);
        return safeSend(sock, from, { text: `✅ Timezone grup diset ke ${tz}` });
      }

      if (cmd === "!groupstatus") {
        const st = getGroupSettings()[from] || {};
        return safeSend(sock, from, {
          text:
            `📌 *Group Status*\n` +
            `Nama: ${st.groupName || from}\n` +
            `Timezone: ${st.timezone || config.defaultTimezone}`,
        });
      }

      return;
    }

    // =====================
    // ✅ MODERATION DETECTION
    // =====================
    const bannedWords = getBannedWords();

    let violation = detectViolation({
      text,
      allowedGroupLink: config.allowedGroupLink,
      bannedWords,
    });

    // media/sticker check (caption contains banned word)
    const isSticker = !!msg.message?.stickerMessage;
    const isImage = !!msg.message?.imageMessage;
    const isVideo = !!msg.message?.videoMessage;
    const isDoc = !!msg.message?.documentMessage;

    if (!violation.isViolation && (isSticker || isImage || isVideo || isDoc)) {
      const found = bannedWords.find((w) =>
        text.toLowerCase().includes(w.toLowerCase())
      );
      if (found) violation = { isViolation: true, type: "Media/Stiker Vulgar", evidence: found };
    }

    if (!violation.isViolation) return;

    // =====================
    // ✅ COUNTER + RISK ALERT
    // =====================
    const count = pushViolationCounter(from, config.violationWindowMinutes);

    if (count >= config.riskAlertThreshold) {
      for (const admin of config.admins) {
        await safeSend(sock, admin, {
          text:
            `⚠️ *RISK ALERT*\n` +
            `Grup: ${from}\n` +
            `Sudah ${count} pelanggaran dalam ${config.violationWindowMinutes} menit.\n` +
            `Disarankan admin mute/tutup grup sementara.`,
        });
      }
    }

    // =====================
    // ✅ group name cache
    // =====================
    let groupName = from;
    const meta = await safeGroupMetadata(sock, from);
    if (meta?.subject) {
      groupName = meta.subject;
      setGroupName(from, groupName);
    }

    const tz = getGroupSettings()[from]?.timezone || config.defaultTimezone;
    const timeStr = formatTimeNow(tz);

    // =====================
    // ✅ create case for admin approval
    // =====================
    const caseId = createCase(
      {
        groupId: from,
        groupName,
        userJid: sender,
        violatorPhone: jidToPhone(sender),
        violationType: violation.type,
        evidence: violation.evidence,
        timeStr,
      },
      config.caseExpireMinutes
    );

    const panel = buildViolationPanel({
      groupName,
      violatorPhone: jidToPhone(sender),
      violationType: violation.type,
      evidence: violation.evidence,
      timeStr,
    });

    const buttons = [
      { buttonId: `KICK_YA|${caseId}`, buttonText: { displayText: "✅ YA (KICK)" }, type: 1 },
      { buttonId: `KICK_NO|${caseId}`, buttonText: { displayText: "❌ TIDAK" }, type: 1 }
    ];

    for (const admin of config.admins) {
      await safeSend(sock, admin, { text: panel, buttons, headerType: 1 });
    }
  });

  isStarting = false;
}

startBot().catch((e) => {
  console.error("❌ startBot fatal error:", e);
  isStarting = false;
  setTimeout(() => startBot().catch(console.error), 5000);
});
