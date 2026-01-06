// ✅ FIX Baileys: crypto undefined (Node 18+)
const nodeCrypto = require("crypto");
if (!globalThis.crypto) globalThis.crypto = nodeCrypto.webcrypto;

const makeWASocket = require("@whiskeysockets/baileys").default;
const {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  downloadMediaMessage,
} = require("@whiskeysockets/baileys");

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

// ✅ NSFW
const { checkNSFW } = require("./lib/nsfwDetector");
const { canCheck } = require("./lib/nsfwLimiter");

// ✅ Railway PORT & AUTH PATH
const PORT = Number(process.env.PORT || 8080);
const AUTH_PATH = process.env.AUTH_PATH || "/tmp/auth";

// ✅ nomor bot (untuk pairing code optional)
const BOT_NUMBER = process.env.BOT_NUMBER || "6289531526042"; // tanpa +

console.log("✅ Booting index.js...");
console.log("✅ PORT:", PORT);
console.log("✅ AUTH_PATH:", AUTH_PATH);

let latestQR = null;
let latestQRDataURL = null;
let lastQRTime = null;

let lastConnectionState = "init";
let lastDisconnectReason = null;

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
            <button onclick="location.reload()">🔄 Reload</button>
            <a class="secondary" href="/qr" target="_blank">📥 PNG</a>
            <a class="secondary" href="/debug" target="_blank">🧠 Debug</a>
          </div>
          <p>Generated: <code>${lastQRTime}</code></p>
        </div>
        <script>
          setTimeout(()=>location.reload(), 5000);
        </script>
      </body>
    </html>
  `);
});

// ✅ listen dulu baru bot
app.listen(PORT, "0.0.0.0", () => {
  console.log("✅ HTTP server running on", PORT);
  setTimeout(() => startBot().catch(console.error), 1500);
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
  } catch {}
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
    markOnlineOnConnect: false,
    syncFullHistory: false,
  });

  sock.ev.on("creds.update", saveCreds);

  // ✅ Pairing code optional (kalau gagal => fallback QR)
  if (!state.creds.registered) {
    try {
      console.log("📌 Request pairing code:", BOT_NUMBER);
      const code = await sock.requestPairingCode(BOT_NUMBER);
      console.log("✅ PAIRING CODE:", code);
    } catch (e) {
      console.log("⚠️ Pairing code gagal, fallback QR...");
    }
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
      } catch {}
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
      isConnecting = false;
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

  isConnecting = false;
}
