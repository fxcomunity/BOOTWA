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
const { getBannedWords, detectViolation, pushViolationCounter } = require("./lib/moderation");
const { createCase } = require("./lib/caseManager");
const { buildViolationPanel } = require("./lib/uiPanel");
const { formatTimeNow, jidToPhone } = require("./lib/helpers");
const { handleAdminDecision, getGroupSettings, setGroupName } = require("./lib/actionHandler");
const { startScheduler } = require("./lib/scheduler");

const AUTH_PATH = process.env.AUTH_PATH || "/app/auth";
const PORT = process.env.PORT || 3000;

// HTTP server (Railway wajib)
const app = express();
app.get("/", (req, res) => res.send("OK - WA Moderation Bot Running"));
app.get("/health", (req, res) => res.json({ ok: true, time: new Date().toISOString() }));
app.listen(PORT, () => console.log("✅ HTTP server running on", PORT));

// Crash guard
process.on("unhandledRejection", (reason) => console.error("❌ unhandledRejection:", reason));
process.on("uncaughtException", (err) => console.error("❌ uncaughtException:", err));

async function safeSend(sock, jid, payload) {
  try { await sock.sendMessage(jid, payload); }
  catch (e) { console.error("sendMessage error:", e?.message || e); }
}

async function safeGroupMetadata(sock, groupId) {
  try { return await sock.groupMetadata(groupId); }
  catch (e) { console.error("groupMetadata error:", e?.message || e); return null; }
}

let schedulerStarted = false;

async function startBot() {
  fs.mkdirSync(AUTH_PATH, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_PATH);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    logger: P({ level: "silent" }),
    auth: state,
    printQRInTerminal: true,
    markOnlineOnConnect: false,
    syncFullHistory: false
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) qrcode.generate(qr, { small: true });

    if (connection === "open") {
      console.log("✅ Bot connected!");

      if (!schedulerStarted) {
        schedulerStarted = true;
        startScheduler(sock, config, getGroupSettings);
        console.log("✅ Scheduler started once");
      }
    }

    if (connection === "close") {
      const code = lastDisconnect?.error?.output?.statusCode;
      console.log("⚠️ Connection closed:", code);

      if (code === DisconnectReason.loggedOut) {
        console.log("❌ Logged out. Delete /app/auth and scan QR again.");
        return;
      }

      console.log("🔁 Reconnecting in 5 sec...");
      setTimeout(() => startBot().catch(console.error), 5000);
    }
  });

  sock.ev.on("messages.upsert", async ({ messages }) => {
    try {
      const msg = messages?.[0];
      if (!msg?.message) return;

      const from = msg.key.remoteJid;

      // DM admin (button decision)
      if (!from.endsWith("@g.us")) {
        await handleAdminDecision(sock, msg).catch(() => {});
        return;
      }

      const sender = msg.key.participant;
      if (!sender) return;

      if (config.admins.includes(sender)) return;

      const text =
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        msg.message?.imageMessage?.caption ||
        msg.message?.videoMessage?.caption ||
        "";

      const bannedWords = getBannedWords();
      let violation = detectViolation({
        text,
        allowedGroupLink: config.allowedGroupLink,
        bannedWords
      });

      const isSticker = !!msg.message?.stickerMessage;
      const isImage = !!msg.message?.imageMessage;
      const isVideo = !!msg.message?.videoMessage;
      const isDoc = !!msg.message?.documentMessage;

      if (!violation.isViolation && (isSticker || isImage || isVideo || isDoc)) {
        const found = bannedWords.find(w => text.toLowerCase().includes(w.toLowerCase()));
        if (found) violation = { isViolation: true, type: "Media/Stiker Vulgar", evidence: found };
      }

      if (!violation.isViolation) return;

      pushViolationCounter(from, config.violationWindowMinutes);

      let groupName = from;
      const meta = await safeGroupMetadata(sock, from);
      if (meta?.subject) {
        groupName = meta.subject;
        setGroupName(from, groupName);
      }

      const tz = getGroupSettings()[from]?.timezone || config.defaultTimezone;
      const timeStr = formatTimeNow(tz);

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
      console.error("messages.upsert error:", e?.message || e);
    }
  });
}

startBot().catch(console.error);
