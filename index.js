const makeWASocket = require("@whiskeysockets/baileys").default;
const {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion
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
  resetCounter
} = require("./lib/moderation");

const { createCase } = require("./lib/caseManager");
const { buildViolationPanel } = require("./lib/uiPanel");
const { formatTimeNow, jidToPhone } = require("./lib/helpers");
const {
  handleAdminDecision,
  setGroupTimezone,
  getGroupSettings,
  setGroupName
} = require("./lib/actionHandler");
const { startScheduler } = require("./lib/scheduler");

/**
 * ✅ RAILWAY FIX:
 * - Railway wajib listen port
 * - Auth state harus ke Volume agar tidak hilang pas redeploy
 */
const AUTH_PATH = process.env.AUTH_PATH || "/app/auth"; // mount volume to /app/auth

// ✅ HTTP server supaya Railway anggap service hidup
const app = express();
app.get("/", (req, res) => res.send("OK - WA Moderation Bot Running (Railway)"));
app.get("/health", (req, res) => res.json({ ok: true, time: new Date().toISOString() }));
app.listen(process.env.PORT || 3000, () => console.log("✅ Railway HTTP server running"));

async function startBot() {
  // Pastikan folder auth ada
  fs.mkdirSync(AUTH_PATH, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_PATH);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    logger: P({ level: "silent" }),
    auth: state,
    printQRInTerminal: true
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) qrcode.generate(qr, { small: true });

    if (connection === "close") {
      const reason = lastDisconnect?.error?.output?.statusCode;
      if (reason !== DisconnectReason.loggedOut) {
        console.log("🔁 Reconnecting...");
        startBot();
      } else {
        console.log("❌ Logged out. Delete /app/auth and re-scan QR.");
      }
    } else if (connection === "open") {
      console.log("✅ Bot connected!");
    }
  });

  // scheduler close group
  startScheduler(sock, config, getGroupSettings);

  // 1) DM admin handler (button)
  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages?.[0];
    if (!msg?.message) return;

    const from = msg.key.remoteJid;

    // jika pesan DM dari admin → handle button
    if (!from.endsWith("@g.us")) {
      await handleAdminDecision(sock, msg);
    }
  });

  // 2) Group moderation + Commands
  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages?.[0];
    if (!msg?.message) return;

    const from = msg.key.remoteJid;
    if (!from.endsWith("@g.us")) return;

    const sender = msg.key.participant;
    if (!sender) return;

    // admin whitelist bypass
    if (config.admins.includes(sender)) return;

    // get text
    const text =
      msg.message?.conversation ||
      msg.message?.extendedTextMessage?.text ||
      msg.message?.imageMessage?.caption ||
      msg.message?.videoMessage?.caption ||
      "";

    // ✅ Commands admin (hanya dari whitelist)
    if (text.startsWith("!")) {
      if (!config.admins.includes(sender)) return;

      const args = text.trim().split(/\s+/);
      const cmd = args[0].toLowerCase();
      const value = args.slice(1).join(" ");

      if (cmd === "!help") {
        return sock.sendMessage(from, {
          text:
`📌 *Admin Commands*
!addword <kata> - tambah blacklist
!removeword <kata> - hapus blacklist
!listwords - lihat blacklist
!resetcounter - reset counter grup
!settimezone WIB|WITA|WIT - set zona waktu grup
!groupstatus - status grup`
        });
      }

      if (cmd === "!addword" && value) {
        addBannedWord(value);
        return sock.sendMessage(from, { text: `✅ Ditambah blacklist: ${value}` });
      }

      if (cmd === "!removeword" && value) {
        removeBannedWord(value);
        return sock.sendMessage(from, { text: `✅ Dihapus blacklist: ${value}` });
      }

      if (cmd === "!listwords") {
        const list = getBannedWords();
        return sock.sendMessage(from, { text: `📌 Blacklist:\n- ${list.join("\n- ")}` });
      }

      if (cmd === "!resetcounter") {
        resetCounter(from);
        return sock.sendMessage(from, { text: "✅ Counter grup direset." });
      }

      if (cmd === "!settimezone") {
        const tz = (args[1] || "").toUpperCase();
        if (!["WIB", "WITA", "WIT"].includes(tz)) {
          return sock.sendMessage(from, { text: "❌ Format salah. !settimezone WIB|WITA|WIT" });
        }
        setGroupTimezone(from, tz);
        return sock.sendMessage(from, { text: `✅ Timezone grup diset ke ${tz}` });
      }

      if (cmd === "!groupstatus") {
        const st = getGroupSettings()[from] || {};
        return sock.sendMessage(from, {
          text: `📌 *Group Status*\nNama: ${st.groupName || from}\nTimezone: ${st.timezone || config.defaultTimezone}`
        });
      }

      return;
    }

    // Moderation detection
    const bannedWords = getBannedWords();
    let violation = detectViolation({
      text,
      allowedGroupLink: config.allowedGroupLink,
      bannedWords
    });

    // media check
    const isSticker = !!msg.message?.stickerMessage;
    const isImage = !!msg.message?.imageMessage;
    const isVideo = !!msg.message?.videoMessage;
    const isDoc = !!msg.message?.documentMessage;

    if (!violation.isViolation && (isSticker || isImage || isVideo || isDoc)) {
      const found = bannedWords.find((w) => text.toLowerCase().includes(w.toLowerCase()));
      if (found) violation = { isViolation: true, type: "Media/Stiker Vulgar", evidence: found };
    }

    if (!violation.isViolation) return;

    // Counter
    const count = pushViolationCounter(from, config.violationWindowMinutes);

    if (count >= config.riskAlertThreshold) {
      for (const admin of config.admins) {
        await sock.sendMessage(admin, {
          text:
`⚠️ *RISK ALERT*
Grup: ${from}
Sudah ${count} pelanggaran dalam ${config.violationWindowMinutes} menit.
Disarankan admin mute/tutup grup sementara.`
        });
      }
    }

    // Group name
    let groupName = from;
    try {
      const meta = await sock.groupMetadata(from);
      groupName = meta.subject || from;
      setGroupName(from, groupName);
    } catch {}

    const tz = getGroupSettings()[from]?.timezone || config.defaultTimezone;
    const timeStr = formatTimeNow(tz);

    const caseId = createCase(
      {
        groupId: from,
        groupName,
        userJid: sender,
        violatorPhone: jidToPhone(sender),
        violationType: violation.type,
        evidence: violation.evidence,
        timeStr
      },
      config.caseExpireMinutes
    );

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
      await sock.sendMessage(admin, { text: panel, buttons, headerType: 1 });
    }
  });
}

startBot();
