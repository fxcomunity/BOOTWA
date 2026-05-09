// ✅ FIX Baileys: crypto undefined (Node 18+)
const nodeCrypto = require("crypto");
if (!globalThis.crypto) globalThis.crypto = nodeCrypto.webcrypto;
let makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, downloadMediaMessage, Browsers;

async function initBaileys() {
  const baileys = await import("@whiskeysockets/baileys");
  makeWASocket = baileys.default;
  useMultiFileAuthState = baileys.useMultiFileAuthState;
  DisconnectReason = baileys.DisconnectReason;
  fetchLatestBaileysVersion = baileys.fetchLatestBaileysVersion;
  downloadMediaMessage = baileys.downloadMediaMessage;
  Browsers = baileys.Browsers;
}

const P = require("pino");
const QRCode = require("qrcode");
const express = require("express");
const fs = require("fs");

const config = require("./config.json");

// ✅ libs
const { getBannedWords, detectViolation, pushViolationCounter } = require("./lib/moderation");
const { createCase } = require("./lib/caseManager");
const { buildViolationPanel } = require("./lib/uiPanel");
const { formatTimeNow, jidToPhone } = require("./lib/helpers");
const { handleAdminDecision, getGroupSettings, setGroupName } = require("./lib/actionHandler");
const { startScheduler } = require("./lib/scheduler");
const { handleCommands } = require("./lib/commandHandler");
const { isGroupBlacklisted } = require("./lib/groupBlacklist");
const { readJSON } = require("./lib/storage");

// ✅ NSFW
const { checkNSFW } = require("./lib/nsfwDetector");
const { canCheck } = require("./lib/nsfwLimiter");

// ✅ Railway PORT & AUTH PATH
const PORT = Number(process.env.PORT || process.env.SERVER_PORT || 8080);
const AUTH_PATH = process.env.AUTH_PATH || "./auth_session";

// ✅ nomor bot (untuk pairing code optional)
const BOT_NUMBER = process.env.BOT_NUMBER || "6289531526042"; // tanpa +

console.log("✅ Booting index.js...");
console.log("✅ PORT:", PORT);
console.log("✅ AUTH_PATH:", AUTH_PATH);

// Fetch public IP to help user
fetch("https://api.ipify.org?format=json")
  .then(res => res.json())
  .then(data => {
    console.log(`\n🌐 [LINK QR CODE]: http://${data.ip}:${PORT}/qr-view\n`);
  })
  .catch(() => console.log("⚠️ Gagal mengambil IP Publik"));

let latestQR = null;
let latestQRDataURL = null;
let lastQRTime = null;

let lastConnectionState = "init";
let lastDisconnectReason = null;
const startTime = Date.now();

// ✅ queue system
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

const lastNotifyByGroup = {};
const GROUP_THROTTLE_MS = 20000;

// ✅ EXPRESS SERVER
const app = express();

app.get("/", (req, res) => {
  res.send(
    "OK - WA Moderation Bot Running ✅\n\n" +
    "Open /qr-view to scan QR\n" +
    "Open /qr for PNG\n" +
    "Open /qr-text for QR string\n" +
    "Open /health for status\n" +
    "Open /debug for bot debug\n"
  );
});

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    time: new Date().toISOString(),
    queueLength: notifyQueue.length,
    queueRunning,
    AUTH_PATH,
    env: {
      PORT: process.env.PORT || null,
      BOT_NUMBER: BOT_NUMBER || null,
      SIGHTENGINE_USER: process.env.SIGHTENGINE_USER ? "OK" : "EMPTY",
      SIGHTENGINE_SECRET: process.env.SIGHTENGINE_SECRET ? "OK" : "EMPTY",
    },
  });
});

app.get("/debug", (req, res) => {
  res.json({
    qrAvailable: !!latestQR,
    lastQRTime,
    lastConnectionState,
    lastDisconnectReason,
  });
});

// ✅ QR PNG
app.get("/qr", async (req, res) => {
  try {
    if (!latestQR) return res.status(404).send("QR belum tersedia. Tunggu bot generate QR.");

    const pngBuffer = await QRCode.toBuffer(latestQR, {
      type: "png",
      width: 1000,
      margin: 8,
      errorCorrectionLevel: "H",
    });

    res.setHeader("Content-Type", "image/png");
    res.send(pngBuffer);
  } catch (e) {
    res.status(500).send("QR endpoint error");
  }
});

app.get("/qr-text", (req, res) => {
  if (!latestQR) return res.status(404).send("QR belum tersedia.");
  res.send(`QR STRING:\n\n${latestQR}\n\nGenerated: ${lastQRTime}`);
});

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
          a.secondary {background:#334155;}
          code {background:#0b1220; padding:4px 8px; border-radius:8px;}
        </style>
      </head>
      <body>
        <div class="card">
          <h2>Scan QR WhatsApp</h2>
          <img src="${latestQRDataURL}" />
          <div class="btns">
            <button onclick="location.reload()">🔄 Refresh QR</button>
            <a class="secondary" href="/qr" target="_blank">📥 PNG</a>
            <a class="secondary" href="/debug" target="_blank">🧠 Debug</a>
          </div>
          <p>Generated: <code>${lastQRTime}</code></p>
        </div>
      </body>
    </html>
  `);
});

// ✅ listen dulu baru bot
app.listen(PORT, "0.0.0.0", async () => {
  console.log("✅ HTTP server running on", PORT);
  try {
    await initBaileys();
    setTimeout(() => startBot().catch(console.error), 1500);
  } catch (e) {
    console.error("Gagal inisiasi Baileys:", e);
  }
});

// ✅ ======================================
// ✅ BOT SECTION
// ✅ ======================================
function resetAuthFolder() {
  try {
    console.log("🧹 Reset AUTH folder...");
    fs.rmSync(AUTH_PATH, { recursive: true, force: true });
    latestQR = null;
    latestQRDataURL = null;
    lastQRTime = null;
  } catch { }
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
    logger: P({ level: "info" }),
    auth: state,
    browser: Browsers.ubuntu('Chrome'),
    markOnlineOnConnect: false,
    syncFullHistory: false,
  });

  sock.ev.on("creds.update", saveCreds);

  // ✅ Pairing Code (Anti "Perangkat tidak ditemukan")
  if (!state.creds.registered) {
    setTimeout(async () => {
      try {
        console.log("📌 Request pairing code untuk:", BOT_NUMBER);
        const code = await sock.requestPairingCode(BOT_NUMBER);
        console.log("\n=========================================");
        console.log("✅ KODE PAIRING ANDA:", code);
        console.log("👉 Buka WhatsApp > Perangkat Tertaut > Tautkan dengan Nomor Telepon");
        console.log("=========================================\n");
      } catch (e) {
        console.log("⚠️ Pairing code gagal:", e?.message);
      }
    }, 4000);
  }

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    lastConnectionState = connection || lastConnectionState;
    console.log("🔌 connection.update:", { connection, hasQR: !!qr });

    if (qr) {
      latestQR = qr;
      lastQRTime = new Date().toISOString();

      try {
        latestQRDataURL = await QRCode.toDataURL(qr, {
          width: 520,
          margin: 4,
          errorCorrectionLevel: "H",
        });
      } catch { }
    }

    if (connection === "open") {
      console.log("✅ Connected to WhatsApp!");
      latestQR = null;
      latestQRDataURL = null;
      lastDisconnectReason = null;

      if (!schedulerStarted) {
        schedulerStarted = true;
        startScheduler(sock, config, getGroupSettings);
      }
    }

    if (connection === "close") {
      const code = lastDisconnect?.error?.output?.statusCode;
      const reason = lastDisconnect?.error?.message || lastDisconnect?.error?.toString();
      lastDisconnectReason = { code, reason };

      console.log("⚠️ Connection closed:", code, reason);

      if (String(reason || "").toLowerCase().includes("conflict")) {
        resetAuthFolder();
      }
      if (code === DisconnectReason.loggedOut) {
        resetAuthFolder();
      }

      isConnecting = false;
      setTimeout(() => startBot().catch(console.error), 5000);
    }
  });

  // ✅ MESSAGES HANDLER
  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;

    for (const msg of messages) {
      try {
        if (!msg.message || msg.key.fromMe) continue;
        const from = msg.key.remoteJid;
        if (!from) continue;

        // Skip blacklisted groups
        if (from.endsWith("@g.us") && isGroupBlacklisted(from)) continue;

        // ✅ Route commands first
        const cmdHandled = await handleCommands(sock, msg, { notifyQueue, startTime });
        if (cmdHandled) continue;

        // ✅ Handle admin button decisions (DM only)
        if (!from.endsWith("@g.us")) {
          await handleAdminDecision(sock, msg);
          continue;
        }

        // ✅ Group moderation below
        const sender = msg.key.participant;
        if (!sender) continue;

        // Skip bot admins from moderation
        const isAdminBot = config.admins.includes(sender);
        if (isAdminBot) continue;

        const groupSettings = getGroupSettings();
        const grpSettings = groupSettings[from] || {};

        // Update group name
        const groupMeta = await sock.groupMetadata(from).catch(() => null);
        if (groupMeta?.subject) setGroupName(from, groupMeta.subject);
        const groupName = groupMeta?.subject || from;

        const now = Date.now();
        const lastNotify = lastNotifyByGroup[from] || 0;
        const isThrottled = (now - lastNotify) < GROUP_THROTTLE_MS;

        const body =
          msg.message?.conversation ||
          msg.message?.extendedTextMessage?.text ||
          msg.message?.imageMessage?.caption ||
          msg.message?.videoMessage?.caption ||
          "";

        const bannedWords = getBannedWords();
        const antilink = grpSettings.antilink !== false; // default on

        // ✅ Text/link detection
        if (body) {
          const { isViolation, type: vtype, evidence } = detectViolation({
            text: body,
            allowedGroupLink: antilink ? config.allowedGroupLink : null,
            bannedWords,
          });

          if (isViolation) {
            const count = pushViolationCounter(from, config.violationWindowMinutes);
            const timeStr = formatTimeNow(config.defaultTimezone);
            const violatorPhone = jidToPhone(sender);
            const caseId = createCase({ groupId: from, groupName, userJid: sender, violatorPhone, violationType: vtype, evidence, timeStr, violationMsgKey: msg.key });
            const adminJid = pickOneAdmin();

            if (adminJid && !isThrottled) {
              lastNotifyByGroup[from] = now;
              const panel = buildViolationPanel({ caseId, groupName, violatorPhone, vtype, evidence, timeStr, count, riskAlertThreshold: config.riskAlertThreshold, violationWindowMinutes: config.violationWindowMinutes });
              enqueueNotify({ sock, toJid: adminJid, payload: panel });
            }
            continue;
          }
        }

        // ✅ NSFW media detection
        const antinsfw = grpSettings.antinsfw !== false; // default on
        if (!antinsfw) continue;
        if (!config.nsfwDetection?.enabled) continue;

        const hasMedia = msg.message?.imageMessage || msg.message?.stickerMessage || msg.message?.videoMessage;
        if (!hasMedia) continue;
        if (!canCheck()) continue;

        const mediaBuffer = await downloadMediaMessage(msg, "buffer", {}).catch(() => null);
        if (!mediaBuffer) continue;

        const nsfwResult = await checkNSFW(mediaBuffer, config.nsfwDetection).catch(() => null);
        if (!nsfwResult?.isNSFW) continue;

        const timeStr = formatTimeNow(config.defaultTimezone);
        const violatorPhone = jidToPhone(sender);
        const caseId = createCase({ groupId: from, groupName, userJid: sender, violatorPhone, violationType: "Konten NSFW/Vulgar", evidence: `NSFW score: ${nsfwResult.score}`, timeStr, violationMsgKey: msg.key });
        const adminJid = pickOneAdmin();

        if (adminJid && !isThrottled) {
          lastNotifyByGroup[from] = now;
          const panel = buildViolationPanel({ caseId, groupName, violatorPhone, vtype: "Konten NSFW", evidence: `Score: ${nsfwResult.score}`, timeStr, count: 1, riskAlertThreshold: config.riskAlertThreshold, violationWindowMinutes: config.violationWindowMinutes });
          enqueueNotify({ sock, toJid: adminJid, payload: panel });
        }
      } catch (e) {
        console.error("messages.upsert error:", e?.message || e);
      }
    }
  });

  isConnecting = false;
}
