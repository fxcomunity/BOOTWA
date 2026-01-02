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
  downloadMediaMessage,
} = require("@whiskeysockets/baileys");

const P = require("pino");
const qrcodeTerminal = require("qrcode-terminal");
const QRCode = require("qrcode");
const express = require("express");
const fs = require("fs");

const config = require("./config.json");

const { getBannedWords, detectViolation, pushViolationCounter } = require("./lib/moderation");
const { createCase } = require("./lib/caseManager");
const { buildViolationPanel } = require("./lib/uiPanel");
const { formatTimeNow, jidToPhone } = require("./lib/helpers");
const { handleAdminDecision, getGroupSettings, setGroupName } = require("./lib/actionHandler");
const { startScheduler } = require("./lib/scheduler");

// ✅ NSFW Sightengine
const { checkNSFW } = require("./lib/nsfwDetector");
const { canCheck } = require("./lib/nsfwLimiter");

// ✅ Railway
const PORT = process.env.PORT || 3000;
const AUTH_PATH = process.env.AUTH_PATH || "/app/auth";

// ✅ QR storage (in-memory)
let latestQR = null;
let latestQRDataURL = null;
let lastQRTime = null;

// ✅ HTTP server
const app = express();

// ✅ ======================================
// ✅ QUEUE SYSTEM (anti spam)
// ✅ ======================================
const notifyQueue = [];
let queueRunning = false;

let adminIndex = 0;
function pickOneAdmin() {
  if (!config.admins || config.admins.length === 0) return null;
  const admin = config.admins[adminIndex % config.admins.length];
  adminIndex++;
  return admin;
}

function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

function randomDelay(min = 3000, max = 8000) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function enqueueNotify(job) {
  if (!job?.sock || !job?.toJid || !job?.payload) return;

  notifyQueue.push(job);

  // ✅ optional: limit queue
  const MAX_QUEUE = 50;
  if (notifyQueue.length > MAX_QUEUE) {
    notifyQueue.splice(0, notifyQueue.length - MAX_QUEUE);
  }

  runQueue().catch(console.error);
}

async function runQueue() {
  if (queueRunning) return;
  queueRunning = true;

  while (notifyQueue.length > 0) {
    const job = notifyQueue.shift();
    try {
      await sleep(randomDelay(3000, 8000));
      await job.sock.sendMessage(job.toJid, job.payload);
    } catch (e) {
      console.error("QUEUE sendMessage error:", e?.message || e);
    }
  }

  queueRunning = false;
}

// ✅ throttle per grup
const lastNotifyByGroup = {};
const GROUP_THROTTLE_MS = 20000;

// ✅ Home
app.get("/", (req, res) => {
  res.send(
    "OK - WA Moderation Bot Running ✅\n\n" +
      "Open /qr-view to scan QR (recommended)\n" +
      "Open /qr for png QR\n" +
      "Open /qr-text for QR string\n"
  );
});

// ✅ Health
app.get("/health", (req, res) => {
  res.json({
    ok: true,
    time: new Date().toISOString(),
    queueLength: notifyQueue.length,
    queueRunning,
  });
});

// ✅ QR image endpoint
app.get("/qr", async (req, res) => {
  try {
    if (!latestQR) return res.status(404).send("QR belum tersedia.");

    const pngBuffer = await QRCode.toBuffer(latestQR, {
      type: "png",
      width: 800,
      margin: 6,
      errorCorrectionLevel: "H",
    });

    res.setHeader("Content-Type", "image/png");
    res.send(pngBuffer);
  } catch (e) {
    console.error("QR endpoint error:", e?.message || e);
    res.status(500).send("QR endpoint error");
  }
});

// ✅ QR string endpoint
app.get("/qr-text", (req, res) => {
  if (!latestQR) return res.status(404).send("QR belum tersedia.");
  res.send(`QR STRING:\n\n${latestQR}\n\nGenerated: ${lastQRTime}`);
});

// ✅ QR VIEW
app.get("/qr-view", async (req, res) => {
  if (!latestQRDataURL) return res.status(404).send("QR belum tersedia.");

  res.send(`
    <html>
      <head>
        <title>Scan QR WhatsApp</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <style>
          body {font-family: Arial; display:flex; align-items:center; justify-content:center; height:100vh; margin:0; background:#0f172a; color:white;}
          .card {background:#111827; padding:24px; border-radius:16px; text-align:center; box-shadow:0 10px 25px rgba(0,0,0,.3); width:90%; max-width:520px;}
          img {width:100%; max-width:420px; border-radius:12px; background:white; padding:14px;}
          .btns {display:flex; gap:10px; justify-content:center; margin-top:16px; flex-wrap:wrap;}
          a, button {border:0; cursor:pointer; text-decoration:none; color:white; background:#2563eb; padding:10px 14px; border-radius:10px; font-size:14px;}
          a.secondary, button.secondary {background:#334155;}
          code {background:#0b1220; padding:4px 8px; border-radius:8px;}
        </style>
      </head>
      <body>
        <div class="card">
          <h2>Scan QR WhatsApp</h2>
          <img src="/qr?t=${Date.now()}" />
          <div class="btns">
            <button onclick="location.reload()">🔄 Reload</button>
            <a class="secondary" href="/qr" target="_blank">📥 PNG HD</a>
            <a class="secondary" href="/qr-text" target="_blank">📌 QR Text</a>
          </div>
          <p>Generated: <code>${lastQRTime}</code></p>
          <p>Queue: <code>${notifyQueue.length}</code></p>
        </div>
      </body>
    </html>
  `);
});

app.listen(PORT, () => console.log("✅ HTTP server running on", PORT));

process.on("unhandledRejection", (reason) => console.error("❌ Unhandled Rejection:", reason));
process.on("uncaughtException", (err) => console.error("❌ Uncaught Exception:", err));

async function safeGroupMetadata(sock, groupId) {
  try {
    return await sock.groupMetadata(groupId);
  } catch {
    return null;
  }
}

async function safeDeleteMessage(sock, groupId, key) {
  try {
    if (!key) return false;
    await sock.sendMessage(groupId, { delete: key });
    return true;
  } catch {
    return false;
  }
}

let schedulerStarted = false;
let isConnecting = false;

async function startBot() {
  if (isConnecting) return;
  isConnecting = true;

  fs.mkdirSync(AUTH_PATH, { recursive: true });

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
      latestQR = qr;
      lastQRTime = new Date().toISOString();
      qrcodeTerminal.generate(qr, { small: false });

      try {
        latestQRDataURL = await QRCode.toDataURL(qr, { width: 520, margin: 4, errorCorrectionLevel: "H" });
      } catch {}
    }

    if (connection === "open") {
      console.log("✅ Connected!");
      latestQR = null;
      latestQRDataURL = null;

      if (!schedulerStarted) {
        schedulerStarted = true;
        startScheduler(sock, config, getGroupSettings);
      }
      isConnecting = false;
    }

    if (connection === "close") {
      const code = lastDisconnect?.error?.output?.statusCode;
      console.log("⚠️ Connection closed:", code);

      if (code === DisconnectReason.loggedOut) return;

      isConnecting = false;
      setTimeout(() => startBot().catch(console.error), 5000);
    }
  });

  sock.ev.on("messages.upsert", async ({ messages }) => {
    try {
      const msg = messages?.[0];
      if (!msg?.message) return;

      const from = msg.key.remoteJid;

      // ✅ Admin DM decisions
      if (!from.endsWith("@g.us")) {
        await handleAdminDecision(sock, msg).catch(() => {});
        return;
      }

      const sender = msg.key.participant;
      if (!sender) return;

      // ✅ bypass admin sender
      if (config.admins.includes(sender)) return;

      const text =
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        msg.message?.imageMessage?.caption ||
        msg.message?.videoMessage?.caption ||
        "";

      const bannedWords = getBannedWords();

      // ✅ Step 1: text/link check
      let violation = detectViolation({
        text,
        allowedGroupLink: config.allowedGroupLink,
        bannedWords,
      });

      // ✅ Step 2: media/sticker caption check
      const isSticker = !!msg.message?.stickerMessage;
      const isImage = !!msg.message?.imageMessage;
      const isVideo = !!msg.message?.videoMessage;

      if (!violation.isViolation && (isSticker || isImage || isVideo)) {
        const found = bannedWords.find((w) => text.toLowerCase().includes(w.toLowerCase()));
        if (found) violation = { isViolation: true, type: "Media/Stiker Vulgar", evidence: found };
      }

      // ✅ Step 3: NSFW Sightengine check (sticker/image/video TANPA caption)
      if (!violation.isViolation && config.nsfwDetection?.enabled && (isSticker || isImage || isVideo)) {
        const maxPerMinute = config.nsfwDetection.maxChecksPerMinute || 8;

        if (canCheck(maxPerMinute)) {
          try {
            const buffer = await downloadMediaMessage(msg, "buffer", {});
            const result = await checkNSFW(buffer, config.nsfwDetection);

            if (result.isNSFW) {
              violation = {
                isViolation: true,
                type: "Stiker/Media NSFW",
                evidence: `NSFW Score: ${(result.score * 100).toFixed(1)}%`,
              };
            }
          } catch (e) {
            console.log("NSFW detect error:", e?.message || e);
          }
        }
      }

      if (!violation.isViolation) return;

      // ✅ throttle per grup
      const now = Date.now();
      if (lastNotifyByGroup[from] && now - lastNotifyByGroup[from] < GROUP_THROTTLE_MS) return;
      lastNotifyByGroup[from] = now;

      // ✅ auto delete message (if bot admin)
      if (config.autoDeleteViolationMessage) {
        await safeDeleteMessage(sock, from, msg.key);
      }

      const count = pushViolationCounter(from, config.violationWindowMinutes);

      // ✅ group meta
      let groupName = from;
      const meta = await safeGroupMetadata(sock, from);
      if (meta?.subject) {
        groupName = meta.subject;
        setGroupName(from, groupName);
      }

      const tz = getGroupSettings()[from]?.timezone || config.defaultTimezone;
      const timeStr = formatTimeNow(tz);

      // ✅ create case
      const caseId = createCase(
        {
          groupId: from,
          groupName,
          userJid: sender,
          violatorPhone: jidToPhone(sender),
          violationType: violation.type,
          evidence: violation.evidence,
          timeStr,
          violationMsgKey: msg.key,
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

      // ✅ send to ONE admin only via queue
      const oneAdmin = pickOneAdmin();
      if (oneAdmin) {
        enqueueNotify({
          sock,
          toJid: oneAdmin,
          payload: { text: panel, buttons, headerType: 1 },
        });
      }

      // ✅ risk alert (1 admin)
      if (count >= config.riskAlertThreshold) {
        const oneAdmin2 = pickOneAdmin();
        if (oneAdmin2) {
          enqueueNotify({
            sock,
            toJid: oneAdmin2,
            payload: {
              text:
                `⚠️ *RISK ALERT*\n` +
                `Grup: ${groupName}\n` +
                `Sudah ${count} pelanggaran dalam ${config.violationWindowMinutes} menit.\n` +
                `Saran: admin mute/tutup grup sementara.`,
            },
          });
        }
      }
    } catch (e) {
      console.error("messages.upsert error:", e?.message || e);
    }
  });

  isConnecting = false;
}

startBot().catch((e) => {
  console.error("❌ startBot fatal error:", e?.message || e);
  isConnecting = false;
  setTimeout(() => startBot().catch(console.error), 5000);
});
