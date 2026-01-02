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
const path = require("path");

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
const PORT = process.env.PORT || 3000;

// ✅ Auth path: try /app/auth (Railway volume), fallback to ./auth
const PRIMARY_AUTH = process.env.AUTH_PATH || "/app/auth";
const FALLBACK_AUTH = path.join(__dirname, "auth");
let AUTH_PATH = PRIMARY_AUTH;

// =====================
// ✅ HTTP server for Railway
// =====================
const app = express();
app.get("/", (req, res) => res.send("OK - WA Moderation Bot Running (Railway)"));
app.get("/health", (req, res) =>
  res.json({ ok: true, time: new Date().toISOString() })
);
app.listen(PORT, () => console.log(`✅ HTTP server listening on ${PORT}`));

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

function ensureAuthDir(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.accessSync(dir, fs.constants.W_OK);
    return true;
  } catch (e) {
    console.error(`⚠️ Cannot use auth dir: ${dir} =>`, e?.message || e);
    return false;
  }
}

let schedulerStarted = false;
let isConnecting = false;

// =====================
// ✅ Start Bot (anti loop)
// =====================
async function startBot() {
  if (isConnecting) return;
  isConnecting = true;

  // choose auth dir
  if (!ensureAuthDir(PRIMARY_AUTH)) {
    console.log("⚠️ Using fallback auth dir ./auth (no volume?)");
    AUTH_PATH = FALLBACK_AUTH;
    ensureAuthDir(AUTH_PATH);
  } else {
    AUTH_PATH = PRIMARY_AUTH;
  }

  console.log("✅ AUTH_PATH used:", AUTH_PATH);
  console.log("✅ ENV PORT:", process.env.PORT);

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

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log("📌 Scan QR:");
      qrcode.generate(qr, { small: true });
    }

    if (connection === "open") {
      console.log("✅ Bot connected!");

      // scheduler start once
      if (!schedulerStarted) {
        schedulerStarted = true;
        try {
          startScheduler(sock, config, getGroupSettings);
          console.log("✅ Scheduler started");
        } catch (e) {
          console.error("Scheduler error:", e?.message || e);
        }
      }
    }

    if (connection === "close") {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      console.log("⚠️ Connection closed:", statusCode);

      if (statusCode === DisconnectReason.loggedOut) {
        console.log("❌ Logged out. Delete auth folder and scan QR again.");
        return;
      }

      console.log("🔁 Reconnect in 5 seconds...");
      setTimeout(() => {
        isConnecting = false;
        startBot().catch(console.error);
      }, 5000);
    }
  });

  // SINGLE handler
  sock.ev.on("messages.upsert", async ({ messages }) => {
    try {
      const msg = messages?.[0];
      if (!msg?.message) return;

      const from = msg.key.remoteJid;

      // DM admin action handler
      if (!from.endsWith("@g.us")) {
        try {
          await handleAdminDecision(sock, msg);
        } catch (e) {
          console.error("handleAdminDecision error:", e?.message || e);
        }
        return;
      }

      const sender = msg.key.participant;
      if (!sender) return;

      // bypass admin whitelist
      if (config.admins.includes(sender)) return;

      const text =
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        msg.message?.imageMessage?.caption ||
        msg.message?.videoMessage?.caption ||
        "";

      // admin commands
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
          return safeSend(sock, from, { text: `📌 Blacklist:\n- ${list.join("\n- ")}` });
        }

        if (cmd === "!resetcounter") {
          resetCounter(from);
          return safeSend(sock, from, { text: "✅ Counter grup direset." });
        }

        if (cmd === "!settimezone") {
          const tz = (args[1] || "").toUpperCase();
          if (!["WIB", "WITA", "WIT"].includes(tz)) {
            return safeSend(sock, from, { text: "❌ Format salah. !settimezone WIB|WITA|WIT" });
          }
          setGroupTimezone(from, tz);
          return safeSend(sock, from, { text: `✅ Timezone grup diset ke ${tz}` });
        }

        if (cmd === "!groupstatus") {
          const st = getGroupSettings()[from] || {};
          return safeSend(sock, from, {
            text: `📌 *Group Status*\nNama: ${st.groupName || from}\nTimezone: ${st.timezone || config.defaultTimezone}`
          });
        }

        return;
      }

      // moderation detection
      const bannedWords = getBannedWords();
      let violation = detectViolation({
        text,
        allowedGroupLink: config.allowedGroupLink,
        bannedWords,
      });

      // media/sticker caption contains banned word
      const isSticker = !!msg.message?.stickerMessage;
      const isImage = !!msg.message?.imageMessage;
      const isVideo = !!msg.message?.videoMessage;
      const isDoc = !!msg.message?.documentMessage;

      if (!violation.isViolation && (isSticker || isImage || isVideo || isDoc)) {
        const found = bannedWords.find((w) => text.toLowerCase().includes(w.toLowerCase()));
        if (found) violation = { isViolation: true, type: "Media/Stiker Vulgar", evidence: found };
      }

      if (!violation.isViolation) return;

      // counter + risk alert
      const count = pushViolationCounter(from, config.violationWindowMinutes);
      if (count >= config.riskAlertThreshold) {
        for (const admin of config.admins) {
          await safeSend(sock, admin, {
            text:
              `⚠️ *RISK ALERT*\n` +
              `Grup: ${from}\n` +
              `Sudah ${count} pelanggaran dalam ${config.violationWindowMinutes} menit.\n` +
              `Disarankan admin mute/tutup grup sementara.`
          });
        }
      }

      // group name
      let groupName = from;
      const meta = await safeGroupMetadata(sock, from);
      if (meta?.subject) {
        groupName = meta.subject;
        setGroupName(from, groupName);
      }

      const tz = getGroupSettings()[from]?.timezone || config.defaultTimezone;
      const timeStr = formatTimeNow(tz);

      // create case
      const caseId = createCase({
        groupId: from,
        groupName,
        userJid: sender,
        violatorPhone: jidToPhone(sender),
        violationType: violation.type,
        evidence: violation.evidence,
        timeStr
      }, config.caseExpireMinutes);

      const panel = buildViolationPanel({
        groupName,
        violatorPhone: jidToPhone(sender),
        violationType: violation.type,
        evidence: violation.evidence,
        timeStr
      });

      const buttons = [
        { buttonId: `KICK_YA|${caseId}`, buttonText: { displayText: "✅ YA (KICK)" }, type: 1 },
        { buttonId: `KICK_NO|${caseId}`, buttonText: { displayText: "❌ TIDAK" }, type: 1 }
      ];

      for (const admin of config.admins) {
        await safeSend(sock, admin, { text: panel, buttons, headerType: 1 });
      }

    } catch (e) {
      console.error("messages.upsert fatal error:", e?.message || e);
    }
  });

  isConnecting = false;
}

startBot().catch((e) => {
  console.error("❌ startBot fatal error:", e?.message || e);
  setTimeout(() => startBot().catch(console.error), 5000);
});
