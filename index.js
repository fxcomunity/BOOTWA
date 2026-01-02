// ✅ FIX Baileys: "crypto is not defined" (Railway / Node)
const nodeCrypto = require("crypto");
if (!globalThis.crypto) {
  globalThis.crypto = nodeCrypto.webcrypto;
}

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

// ✅ Railway
const PORT = process.env.PORT || 3000;

// ✅ Auth path bisa diganti untuk reset session
// contoh: AUTH_PATH=/app/auth2
const AUTH_PATH = process.env.AUTH_PATH || "/app/auth";

// ✅ HTTP server (Railway wajib listen PORT)
const app = express();
app.get("/", (req, res) => res.send("OK - WA Moderation Bot Running (Railway)"));
app.get("/health", (req, res) =>
  res.json({ ok: true, time: new Date().toISOString() })
);
app.listen(PORT, () => console.log("✅ HTTP server running on", PORT));

// ✅ Anti crash global
process.on("unhandledRejection", (reason) => {
  console.error("❌ Unhandled Rejection:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("❌ Uncaught Exception:", err);
});

// ✅ Safe send wrapper
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

let schedulerStarted = false;
let isConnecting = false;

async function startBot() {
  if (isConnecting) return;
  isConnecting = true;

  // ✅ Ensure auth path exists
  try {
    fs.mkdirSync(AUTH_PATH, { recursive: true });
  } catch (e) {
    console.error("❌ AUTH mkdir error:", e?.message || e);
  }

  console.log("✅ Using AUTH_PATH:", AUTH_PATH);
  console.log("✅ Using PORT:", PORT);

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_PATH);
  const { version } = await fetchLatestBaileysVersion();

  console.log("✅ Baileys version:", version);

  const sock = makeWASocket({
    version,
    logger: P({ level: "silent" }),
    auth: state,
    printQRInTerminal: true,
    markOnlineOnConnect: false,
    syncFullHistory: false,
  });

  sock.ev.on("creds.update", saveCreds);

  // ✅ Connection update handler
  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log("📌 Scan QR to login:");
      qrcode.generate(qr, { small: true });
    }

    if (connection === "open") {
      console.log("✅ Connected!");

      // ✅ scheduler start once
      if (!schedulerStarted) {
        schedulerStarted = true;
        try {
          startScheduler(sock, config, getGroupSettings);
          console.log("✅ Scheduler started once");
        } catch (e) {
          console.error("❌ Scheduler error:", e?.message || e);
        }
      }

      isConnecting = false;
    }

    if (connection === "close") {
      const code = lastDisconnect?.error?.output?.statusCode;
      const reason = lastDisconnect?.error?.message || lastDisconnect?.error?.toString();

      console.log("⚠️ Connection closed:", code);
      console.log("📌 Close reason:", reason);
      console.log("📌 Full error object:", lastDisconnect?.error);

      // ✅ logged out
      if (code === DisconnectReason.loggedOut) {
        console.log("❌ Logged out. Delete auth folder and scan QR again.");
        console.log("👉 Cara cepat reset session:");
        console.log("   Railway Variables: set AUTH_PATH=/app/auth2 lalu buat volume /app/auth2");
        return;
      }

      isConnecting = false;

      // ✅ reconnect delay
      console.log("🔁 Reconnecting in 5 seconds...");
      setTimeout(() => startBot().catch(console.error), 5000);
    }
  });

  // ✅ Single messages handler
  sock.ev.on("messages.upsert", async ({ messages }) => {
    try {
      const msg = messages?.[0];
      if (!msg?.message) return;

      const from = msg.key.remoteJid;

      // ✅ DM admin handler (button decisions)
      if (!from.endsWith("@g.us")) {
        try {
          await handleAdminDecision(sock, msg);
        } catch (e) {
          console.error("handleAdminDecision error:", e?.message || e);
        }
        return;
      }

      // ✅ group message
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

      // ✅ moderation detect
      const bannedWords = getBannedWords();
      let violation = detectViolation({
        text,
        allowedGroupLink: config.allowedGroupLink,
        bannedWords,
      });

      // ✅ media/sticker detection (caption contains banned word)
      const isSticker = !!msg.message?.stickerMessage;
      const isImage = !!msg.message?.imageMessage;
      const isVideo = !!msg.message?.videoMessage;
      const isDoc = !!msg.message?.documentMessage;

      if (!violation.isViolation && (isSticker || isImage || isVideo || isDoc)) {
        const found = bannedWords.find((w) => text.toLowerCase().includes(w.toLowerCase()));
        if (found) violation = { isViolation: true, type: "Media/Stiker Vulgar", evidence: found };
      }

      if (!violation.isViolation) return;

      // ✅ counter
      const count = pushViolationCounter(from, config.violationWindowMinutes);

      // ✅ group name cache
      let groupName = from;
      const meta = await safeGroupMetadata(sock, from);
      if (meta?.subject) {
        groupName = meta.subject;
        setGroupName(from, groupName);
      }

      // ✅ timezone
      const tz = getGroupSettings()[from]?.timezone || config.defaultTimezone;
      const timeStr = formatTimeNow(tz);

      // ✅ create case for admin approval
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
        { buttonId: `KICK_NO|${caseId}`, buttonText: { displayText: "❌ TIDAK" }, type: 1 },
      ];

      // ✅ send alert to all admins (private DM)
      for (const admin of config.admins) {
        await safeSend(sock, admin, { text: panel, buttons, headerType: 1 });
      }

      // ✅ risk alert
      if (count >= config.riskAlertThreshold) {
        for (const admin of config.admins) {
          await safeSend(sock, admin, {
            text:
              `⚠️ *RISK ALERT*\n` +
              `Grup: ${groupName}\n` +
              `Sudah ${count} pelanggaran dalam ${config.violationWindowMinutes} menit.\n` +
              `Saran: admin mute/tutup grup sementara.`,
          });
        }
      }

    } catch (e) {
      console.error("messages.upsert error:", e?.message || e);
    }
  });

  isConnecting = false;
}

// ✅ start bot
startBot().catch((e) => {
  console.error("❌ startBot fatal error:", e?.message || e);
  isConnecting = false;
  setTimeout(() => startBot().catch(console.error), 5000);
});
