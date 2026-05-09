// ✅ PERBAIKAN Baileys: crypto tidak terdefinisi (Node 18+)
const nodeCrypto = require("crypto");
if (!globalThis.crypto) globalThis.crypto = nodeCrypto.webcrypto;

let makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, downloadMediaMessage, Browsers;

async function initBaileys() {
  const baileys = await import("@whiskeysockets/baileys");

  // Coba named export dulu, fallback ke default export
  makeWASocket = baileys.makeWASocket || baileys.default;
  useMultiFileAuthState = baileys.useMultiFileAuthState;
  DisconnectReason = baileys.DisconnectReason;
  fetchLatestBaileysVersion = baileys.fetchLatestBaileysVersion;
  downloadMediaMessage = baileys.downloadMediaMessage;
  Browsers = baileys.Browsers;

  // Validasi export penting
  if (typeof makeWASocket !== "function") {
    console.error("❌ Export Baileys yang tersedia:", Object.keys(baileys));
    throw new Error("makeWASocket tidak ditemukan — periksa versi/export Baileys");
  }
  console.log("✅ Baileys berhasil dimuat, makeWASocket:", typeof makeWASocket);
}

const P = require("pino");
const QRCode = require("qrcode");
const express = require("express");
const fs = require("fs");

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
const { readJSON } = require("./lib/storage");

// ✅ Deteksi NSFW
const { checkNSFW } = require("./lib/nsfwDetector");
const { canCheck } = require("./lib/nsfwLimiter");

// ✅ Port & Path Auth
const PORT = Number(process.env.PORT || process.env.SERVER_PORT || 8080);
const AUTH_PATH = process.env.AUTH_PATH || "./auth_session";

console.log("✅ Memulai index.js...");
console.log("✅ PORT:", PORT);
console.log("✅ AUTH_PATH:", AUTH_PATH);

// Ambil IP publik untuk membantu pengguna
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
let lastDisconnectReason = null;
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
  if (!job?.sock || !job?.toJid || !job?.payload) return;
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
      await job.sock.sendMessage(job.toJid, job.payload);
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
    "Buka /health untuk status bot\n" +
    "Buka /debug untuk info debug\n"
  );
});

// ✅ FIX: hapus referensi BOT_NUMBER yang sudah tidak ada
app.get("/health", (req, res) => {
  res.json({
    ok: true,
    waktu: new Date().toISOString(),
    panjangAntrian: notifyQueue.length,
    antrianBerjalan: queueRunning,
    statusKoneksi: lastConnectionState,
    AUTH_PATH,
    env: {
      PORT: process.env.PORT || null,
      SIGHTENGINE_USER: process.env.SIGHTENGINE_USER ? "OK" : "KOSONG",
      SIGHTENGINE_SECRET: process.env.SIGHTENGINE_SECRET ? "OK" : "KOSONG",
    },
  });
});

app.get("/debug", (req, res) => {
  res.json({
    qrTersedia: !!latestQR,
    waktuQRTerakhir: lastQRTime,
    statusKoneksiTerakhir: lastConnectionState,
    alasanPutusKoneksiTerakhir: lastDisconnectReason,
  });
});

// ✅ QR dalam format PNG
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

// ✅ FIX: halaman /qr-view dengan loading screen & countdown timer
app.get("/qr-view", async (req, res) => {
  // Kalau QR belum siap, tampilkan loading dengan auto-refresh
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
            small {color:#475569; font-size:12px;}
          </style>
        </head>
        <body>
          <div class="card">
            <h2>⏳ Menunggu QR...</h2>
            <div class="spinner"></div>
            <p>Bot sedang mempersiapkan QR code</p>
            <small>Halaman otomatis refresh setiap 5 detik</small>
          </div>
        </body>
      </html>
    `);
  }

  // QR sudah siap, tampilkan
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
          a.secondary {background:#334155;}
          code {background:#0b1220; padding:3px 7px; border-radius:6px; font-size:12px;}
          .timer {font-size:13px; color:#64748b; margin-top:10px;}
          .expired {color:#ef4444 !important;}
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
            <a class="secondary" href="/debug" target="_blank">🧠 Debug</a>
            <a class="secondary" href="/health" target="_blank">❤️ Health</a>
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
            if (sisa > 0) {
              el.textContent = "⏱ QR expired dalam " + sisa + " detik";
            } else {
              el.textContent = "⚠️ QR sudah expired — klik Perbarui QR";
              el.classList.add("expired");
              clearInterval(interval);
            }
          }
          update();
          const interval = setInterval(update, 1000);
        </script>
      </body>
    </html>
  `);
});

// ✅ Jalankan server HTTP dulu, baru bot
app.listen(PORT, "0.0.0.0", async () => {
  console.log("✅ Server HTTP berjalan di port", PORT);
  try {
    await initBaileys();
    setTimeout(() => startBot().catch(console.error), 1500);
  } catch (e) {
    console.error("❌ Gagal inisiasi Baileys:", e);
  }
});

// ✅ ======================================
// ✅ BAGIAN BOT
// ✅ ======================================

function resetAuthFolder() {
  try {
    console.log("🧹 Mereset folder AUTH...");
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
    logger: P({ level: "silent" }),        // ← silent agar log lebih bersih
    auth: state,
    browser: Browsers.ubuntu("Chrome"),
    markOnlineOnConnect: false,
    syncFullHistory: false,
    getMessage: async () => undefined,     // ← skip download riwayat pesan lama
    connectTimeoutMs: 60000,               // ← timeout koneksi 60 detik
    defaultQueryTimeoutMs: 60000,          // ← timeout query 60 detik
    keepAliveIntervalMs: 10000,            // ← ping setiap 10 detik agar tidak putus
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    lastConnectionState = connection || lastConnectionState;
    console.log("🔌 Pembaruan koneksi:", { connection, adaQR: !!qr });

    if (qr) {
      latestQR = qr;
      lastQRTime = new Date().toISOString();
      console.log("\n📱 QR SIAP! Buka browser dan akses:");
      console.log(`👉 http://5.223.85.113:${PORT}/qr-view\n`);

      try {
        latestQRDataURL = await QRCode.toDataURL(qr, {
          width: 520,
          margin: 4,
          errorCorrectionLevel: "H",
        });
      } catch { }
    }

    if (connection === "open") {
      console.log("✅ Berhasil terhubung ke WhatsApp!");
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

      console.log("⚠️ Koneksi terputus:", code, reason);

      // ✅ FIX: jangan reset auth kalau hanya timeout biasa (408)
      if (String(reason || "").toLowerCase().includes("conflict")) {
        console.log("⚠️ Konflik sesi terdeteksi, mereset auth...");
        resetAuthFolder();
      } else if (code === DisconnectReason.loggedOut) {
        console.log("⚠️ Bot logout, mereset auth...");
        resetAuthFolder();
      }

      isConnecting = false;
      // ✅ FIX: tunggu lebih lama kalau timeout (408) biar tidak spam reconnect
      const delay = code === 408 ? 10000 : 5000;
      console.log(`🔄 Mencoba menyambung kembali dalam ${delay / 1000} detik...`);
      setTimeout(() => startBot().catch(console.error), delay);
    }
  });

  // ✅ HANDLER PESAN MASUK
  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;

    for (const msg of messages) {
      try {
        if (!msg.message || msg.key.fromMe) continue;
        const from = msg.key.remoteJid;
        if (!from) continue;

        // Lewati grup yang diblokir (blacklist)
        if (from.endsWith("@g.us") && isGroupBlacklisted(from)) continue;

        // ✅ Proses perintah (command) terlebih dahulu
        const cmdHandled = await handleCommands(sock, msg, { notifyQueue, startTime });
        if (cmdHandled) continue;

        // ✅ Tangani keputusan admin via DM
        if (!from.endsWith("@g.us")) {
          await handleAdminDecision(sock, msg);
          continue;
        }

        // ✅ Moderasi grup di bawah ini
        const sender = msg.key.participant;
        if (!sender) continue;

        // Lewati admin bot dari proses moderasi
        const isAdminBot = config.admins.includes(sender);
        if (isAdminBot) continue;

        const groupSettings = getGroupSettings();
        const grpSettings = groupSettings[from] || {};

        // Perbarui nama grup
        const groupMeta = await sock.groupMetadata(from).catch(() => null);
        if (groupMeta?.subject) setGroupName(from, groupMeta.subject);
        const groupName = groupMeta?.subject || from;

        const now = Date.now();
        const lastNotify = lastNotifyByGroup[from] || 0;
        const isThrottled = now - lastNotify < GROUP_THROTTLE_MS;

        const body =
          msg.message?.conversation ||
          msg.message?.extendedTextMessage?.text ||
          msg.message?.imageMessage?.caption ||
          msg.message?.videoMessage?.caption ||
          "";

        const bannedWords = getBannedWords();
        const antilink = grpSettings.antilink !== false; // default aktif

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
              violationMsgKey: msg.key,
            });
            const adminJid = pickOneAdmin();

            if (adminJid && !isThrottled) {
              lastNotifyByGroup[from] = now;
              const panel = buildViolationPanel({
                caseId,
                groupName,
                violatorPhone,
                vtype,
                evidence,
                timeStr,
                count,
                riskAlertThreshold: config.riskAlertThreshold,
                violationWindowMinutes: config.violationWindowMinutes,
              });
              enqueueNotify({ sock, toJid: adminJid, payload: panel });
            }
            continue;
          }
        }

        // ✅ Deteksi media NSFW
        const antinsfw = grpSettings.antinsfw !== false; // default aktif
        if (!antinsfw) continue;
        if (!config.nsfwDetection?.enabled) continue;

        const hasMedia =
          msg.message?.imageMessage ||
          msg.message?.stickerMessage ||
          msg.message?.videoMessage;
        if (!hasMedia) continue;
        if (!canCheck()) continue;

        const mediaBuffer = await downloadMediaMessage(msg, "buffer", {}).catch(() => null);
        if (!mediaBuffer) continue;

        const nsfwResult = await checkNSFW(mediaBuffer, config.nsfwDetection).catch(() => null);
        if (!nsfwResult?.isNSFW) continue;

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
          violationMsgKey: msg.key,
        });
        const adminJid = pickOneAdmin();

        if (adminJid && !isThrottled) {
          lastNotifyByGroup[from] = now;
          const panel = buildViolationPanel({
            caseId,
            groupName,
            violatorPhone,
            vtype: "Konten NSFW",
            evidence: `Skor: ${nsfwResult.score}`,
            timeStr,
            count: 1,
            riskAlertThreshold: config.riskAlertThreshold,
            violationWindowMinutes: config.violationWindowMinutes,
          });
          enqueueNotify({ sock, toJid: adminJid, payload: panel });
        }
      } catch (e) {
        console.error("❌ Error pada messages.upsert:", e?.message || e);
      }
    }
  });

  isConnecting = false;
}