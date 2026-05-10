const fs = require("fs");
const path = require("path");
const express = require("express");
const QRCode = require("qrcode");
const { Client, LocalAuth } = require("whatsapp-web.js");

const config = require("./config.json");

// ✅ Library pendukung
const { getBannedWords, detectViolation, pushViolationCounter } = require("./lib/moderation");
const { createCase } = require("./lib/caseManager");
const { buildViolationPanel } = require("./lib/uiPanel");
const { formatTimeNow, jidToPhone } = require("./lib/helpers");
const { handleAdminDecision, getGroupSettings, setGroupName } = require("./lib/actionHandler");
const { startScheduler } = require("./lib/scheduler");
const { handleCommands } = require("./lib/commandHandler");
const { isGroupBlacklisted } = require("./lib/groupBlacklist");

// ✅ Deteksi NSFW
const { checkNSFW } = require("./lib/nsfwDetector");
const { canCheck } = require("./lib/nsfwLimiter");

// ✅ Port & Path Auth
const PORT = Number(process.env.PORT || process.env.SERVER_PORT || 8080);
const AUTH_PATH = process.env.AUTH_PATH || "./auth_session";

console.log("✅ Memulai index.js (whatsapp-web.js)...");
console.log("✅ PORT:", PORT);
console.log("✅ AUTH_PATH:", AUTH_PATH);

// Ambil IP publik
fetch("https://api.ipify.org?format=json")
  .then((res) => res.json())
  .then((data) => {
    console.log(`\n🌐 [LINK QR CODE]: http://${data.ip}:${PORT}/qr-view\n`);
  })
  .catch(() => console.log("⚠️ Gagal mengambil IP Publik"));

let latestQR = null;
let latestQRDataURL = null;
let lastQRTime = null;
let lastConnectionState = "init";
const startTime = Date.now();

// ✅ Sistem antrian pengiriman pesan
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
  if (!job?.client || !job?.toJid || !job?.payload) return;
  notifyQueue.push(job);

  const MAX_ANTRIAN = 50;
  if (notifyQueue.length > MAX_ANTRIAN) {
    notifyQueue.splice(0, notifyQueue.length - MAX_ANTRIAN);
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
      await job.client.sendMessage(job.toJid, job.payload);
    } catch (e) {
      console.error("❌ Error kirim pesan antrian:", e?.message || e);
    }
  }

  queueRunning = false;
}

const lastNotifyByGroup = {};
const GROUP_THROTTLE_MS = 20000;

// ✅ SERVER EXPRESS
const app = express();

app.get("/", (req, res) => {
  res.send(
    "OK - Bot Moderasi WA Berjalan ✅\n\n" +
    "Buka /qr-view untuk scan QR\n" +
    "Buka /qr untuk gambar PNG\n" +
    "Buka /qr-text untuk string QR\n" +
    "Buka /health untuk status bot\n"
  );
});

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    waktu: new Date().toISOString(),
    panjangAntrian: notifyQueue.length,
    antrianBerjalan: queueRunning,
    statusKoneksi: lastConnectionState,
    AUTH_PATH
  });
});

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
    res.status(500).send("Error pada endpoint QR");
  }
});

app.get("/qr-text", (req, res) => {
  if (!latestQR) return res.status(404).send("QR belum tersedia.");
  res.send(`STRING QR:\n\n${latestQR}\n\nDibuat pada: ${lastQRTime}`);
});

app.get("/qr-view", async (req, res) => {
  if (!latestQRDataURL) {
    return res.send(`
      <html>
        <head>
          <title>Menunggu QR WhatsApp</title>
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <meta http-equiv="refresh" content="5" />
          <style>
            body {font-family: Arial; display:flex; align-items:center; justify-content:center; height:100vh; margin:0; background:#0f172a; color:white;}
            .card {background:#111827; padding:32px 24px; border-radius:16px; text-align:center; box-shadow:0 10px 25px rgba(0,0,0,.3); width:90%; max-width:420px;}
            .spinner {width:52px; height:52px; border:5px solid #1e293b; border-top-color:#2563eb; border-radius:50%; animation:spin 1s linear infinite; margin:20px auto;}
            @keyframes spin {to{transform:rotate(360deg)}}
            p {color:#94a3b8; font-size:14px;}
          </style>
        </head>
        <body>
          <div class="card">
            <h2>⏳ Menunggu QR...</h2>
            <div class="spinner"></div>
            <p>Bot sedang mempersiapkan browser internal...</p>
          </div>
        </body>
      </html>
    `);
  }

  res.send(`
    <html>
      <head>
        <title>Scan QR WhatsApp</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <style>
          body {font-family: Arial; display:flex; align-items:center; justify-content:center; min-height:100vh; margin:0; background:#0f172a; color:white;}
          .card {background:#111827; padding:24px; border-radius:16px; text-align:center; box-shadow:0 10px 25px rgba(0,0,0,.3); width:90%; max-width:520px;}
          h2 {margin-top:0;}
          .subtitle {color:#94a3b8; font-size:14px; margin-top:-8px; margin-bottom:16px;}
          img {width:100%; max-width:400px; border-radius:12px; background:white; padding:14px; box-sizing:border-box;}
          .btns {display:flex; gap:10px; justify-content:center; margin-top:16px; flex-wrap:wrap;}
          a, button {border:0; cursor:pointer; text-decoration:none; color:white; background:#2563eb; padding:10px 16px; border-radius:10px; font-size:14px;}
          .timer {font-size:13px; color:#64748b; margin-top:10px;}
        </style>
      </head>
      <body>
        <div class="card">
          <h2>📱 Scan QR WhatsApp</h2>
          <p class="subtitle">Buka WhatsApp → Perangkat Tertaut → Tautkan Perangkat</p>
          <img src="${latestQRDataURL}" alt="QR Code WhatsApp" />
          <div class="btns">
            <button onclick="location.reload()">🔄 Perbarui QR</button>
            <a class="secondary" href="/qr" target="_blank">📥 Unduh PNG</a>
          </div>
          <p class="timer">Dibuat: <code>${lastQRTime}</code></p>
          <p class="timer" id="countdown">Menghitung waktu expired...</p>
        </div>
        <script>
          const buatPada = new Date("${lastQRTime}").getTime();
          const expired = buatPada + 60000;
          const el = document.getElementById("countdown");
          function update() {
            const sisa = Math.max(0, Math.ceil((expired - Date.now()) / 1000));
            if (sisa > 0) el.textContent = "⏱ QR expired dalam " + sisa + " detik";
            else { el.textContent = "⚠️ QR expired — refresh halaman"; clearInterval(interval); }
          }
          update();
          const interval = setInterval(update, 1000);
        </script>
      </body>
    </html>
  `);
});

// ✅ Jalankan HTTP Server
app.listen(PORT, "0.0.0.0", () => {
  console.log("✅ Server HTTP berjalan di port", PORT);
  startBot();
});

// ✅ ======================================
// ✅ BAGIAN BOT (whatsapp-web.js)
// ✅ ======================================

function startBot() {
  const puppeteerArgs = {
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  };

  const executablePaths = [
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome'
  ];
  for (const ep of executablePaths) {
    if (fs.existsSync(ep)) {
      puppeteerArgs.executablePath = ep;
      console.log("✅ Ditemukan system browser:", ep);
      break;
    }
  }

  // ✅ Fix EACCES error pada Pterodactyl untuk binary Puppeteer yang diunduh
  try {
    const { execSync } = require('child_process');
    const cacheDir = path.join(process.cwd(), '.puppeteer_cache');
    if (fs.existsSync(cacheDir)) {
      execSync(`chmod -R 755 "${cacheDir}"`);
      console.log("✅ Permissions .puppeteer_cache berhasil diupdate (Fix EACCES)");
    }
  } catch (err) {
    console.log("⚠️ Gagal mengupdate permission .puppeteer_cache:", err.message);
  }

  const client = new Client({
    authStrategy: new LocalAuth({ dataPath: AUTH_PATH }),
    puppeteer: puppeteerArgs
  });

  client.on('qr', async (qr) => {
    latestQR = qr;
    lastQRTime = new Date().toISOString();
    console.log("\n📱 QR SIAP! Buka browser dan akses:");
    console.log(`👉 http://5.223.85.113:${PORT}/qr-view\n`);
    try {
      latestQRDataURL = await QRCode.toDataURL(qr, { width: 520, margin: 4, errorCorrectionLevel: "H" });
    } catch { }
  });

  client.on('ready', () => {
    lastConnectionState = "open";
    console.log("✅ Berhasil terhubung ke WhatsApp!");
    latestQR = null;
    latestQRDataURL = null;
    startScheduler(client, config, getGroupSettings);
  });

  client.on('disconnected', (reason) => {
    console.log("⚠️ Koneksi terputus:", reason);
    lastConnectionState = "close";
    setTimeout(() => {
      console.log("🔄 Mereset bot...");
      client.initialize();
    }, 5000);
  });

  client.on('message_create', async (msg) => {
    try {
      // Abaikan pesan broadcast status
      if (msg.from === 'status@broadcast') return;

      const from = msg.from; // JID chat (grup/personal)
      const isGroup = from.endsWith('@g.us');
      const sender = isGroup ? msg.author : msg.from; // JID pengirim

      if (msg.fromMe) {
        // Tetap izinkan owner command dari nomor sendiri, skip moderasi
        await handleCommands(client, msg, { notifyQueue, startTime });
        return;
      }

      // Lewati grup yang diblokir
      if (isGroup && isGroupBlacklisted(from)) return;

      // ✅ Proses perintah (command) terlebih dahulu
      const cmdHandled = await handleCommands(client, msg, { notifyQueue, startTime });
      if (cmdHandled) return;

      // ✅ Tangani keputusan admin via DM
      if (!isGroup) {
        await handleAdminDecision(client, msg);
        return;
      }

      // ✅ Moderasi grup di bawah ini
      if (!sender) return;

      // Lewati admin bot dari proses moderasi
      const isAdminBot = config.admins.includes(sender);
      if (isAdminBot) return;

      const groupSettings = getGroupSettings();
      const grpSettings = groupSettings[from] || {};

      const chat = await msg.getChat();
      const groupName = chat.name || from;
      setGroupName(from, groupName);

      const now = Date.now();
      const lastNotify = lastNotifyByGroup[from] || 0;
      const isThrottled = now - lastNotify < GROUP_THROTTLE_MS;

      const body = msg.body || "";
      const bannedWords = getBannedWords();
      const antilink = grpSettings.antilink !== false;

      // ✅ Deteksi teks/link
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
          const caseId = createCase({
            groupId: from,
            groupName,
            userJid: sender,
            violatorPhone,
            violationType: vtype,
            evidence,
            timeStr,
            violationMsgId: msg.id._serialized,
          });
          const adminJid = pickOneAdmin();

          if (adminJid && !isThrottled) {
            lastNotifyByGroup[from] = now;
            const panel = buildViolationPanel({
              caseId, groupName, violatorPhone, vtype, evidence, timeStr, count,
              riskAlertThreshold: config.riskAlertThreshold,
              violationWindowMinutes: config.violationWindowMinutes,
            });
            enqueueNotify({ client, toJid: adminJid, payload: panel });
          }
          return;
        }
      }

      // ✅ Deteksi media NSFW
      const antinsfw = grpSettings.antinsfw !== false;
      if (!antinsfw) return;
      if (!config.nsfwDetection?.enabled) return;

      if (msg.hasMedia && canCheck()) {
        const media = await msg.downloadMedia().catch(() => null);
        if (!media) return;

        const mediaBuffer = Buffer.from(media.data, 'base64');
        const nsfwResult = await checkNSFW(mediaBuffer, config.nsfwDetection).catch(() => null);
        if (!nsfwResult?.isNSFW) return;

        const timeStr = formatTimeNow(config.defaultTimezone);
        const violatorPhone = jidToPhone(sender);
        const caseId = createCase({
          groupId: from,
          groupName,
          userJid: sender,
          violatorPhone,
          violationType: "Konten NSFW/Vulgar",
          evidence: `Skor NSFW: ${nsfwResult.score}`,
          timeStr,
          violationMsgId: msg.id._serialized,
        });
        const adminJid = pickOneAdmin();

        if (adminJid && !isThrottled) {
          lastNotifyByGroup[from] = now;
          const panel = buildViolationPanel({
            caseId, groupName, violatorPhone, vtype: "Konten NSFW",
            evidence: `Skor: ${nsfwResult.score}`, timeStr, count: 1,
            riskAlertThreshold: config.riskAlertThreshold,
            violationWindowMinutes: config.violationWindowMinutes,
          });
          enqueueNotify({ client, toJid: adminJid, payload: panel });
        }
      }

    } catch (e) {
      console.error("❌ Error pada message_create:", e?.message || e);
    }
  });

  client.initialize();
}