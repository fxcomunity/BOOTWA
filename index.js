const express = require('express');
const cron = require('node-cron');
const moment = require('moment-timezone');
const pino = require('pino');

const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, makeInMemoryStore } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');

const { loadJSON, saveJSON } = require('./lib/storage');
const { isAdminOrOwner, getPhoneFromJid, nowForTZ, formatTs } = require('./lib/helpers');
const { detectViolation } = require('./lib/moderation');
const { createCase, getCase, closeCase, purgeExpiredCases } = require('./lib/caseManager');
const { sendViolationPanel, sendCloseReminderPanel, sendInfo } = require('./lib/uiPanel');
const { handleButtonAction, handleAdminCommands } = require('./lib/actionHandler');
const { scheduleJobs } = require('./lib/scheduler');

const logger = pino({ level: 'info' });

async function start() {
  // --- tiny web server for Render keep-alive ---
  const app = express();
  app.get('/', (req, res) => res.status(200).send('OK'));
  const port = process.env.PORT || 3000;
  app.listen(port, () => logger.info(`HTTP server listening on :${port}`));

  // --- load configs/data ---
  const config = loadJSON('./config.json', {});
  const banwordsPath = './data/banwords.json';
  const countersPath = './data/groupCounters.json';
  const casesPath = './data/cases.json';
  const settingsPath = './data/groupSettings.json';

  const banwords = loadJSON(banwordsPath, []);
  const counters = loadJSON(countersPath, {});
  const caseStore = loadJSON(casesPath, {});
  const groupSettings = loadJSON(settingsPath, {});

  // --- baileys auth ---
  const { state, saveCreds } = await useMultiFileAuthState('auth');
  const { version } = await fetchLatestBaileysVersion();

  const store = makeInMemoryStore({ logger });
  store.readFromFile('./data/baileys_store.json');
  setInterval(() => store.writeToFile('./data/baileys_store.json'), 10_000);

  const sock = makeWASocket({
    version,
    logger,
    printQRInTerminal: true,
    auth: state,
    browser: ['WA Moderation Bot', 'Chrome', '1.0.0']
  });

  store.bind(sock.ev);

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === 'close') {
      const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
      logger.warn(`connection closed: ${reason}`);
      if (reason !== DisconnectReason.loggedOut) {
        start().catch(console.error);
      } else {
        logger.error('Logged out. Delete auth folder and re-scan QR.');
      }
    } else if (connection === 'open') {
      logger.info('✅ WhatsApp connected');
    }
  });

  // --- schedule jobs: reminders + auto close ---
  scheduleJobs({
    sock,
    config,
    groupSettings,
    settingsPath
  });

  // --- main message handler ---
  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages?.[0];
    if (!msg || msg.key.fromMe) return;

    // handle button responses from admin
    if (msg.message?.buttonsResponseMessage || msg.message?.templateButtonReplyMessage || msg.message?.interactiveResponseMessage) {
      await handleButtonAction({ sock, msg, config, caseStore, casesPath, groupSettings, settingsPath });
      return;
    }

    const remoteJid = msg.key.remoteJid;
    if (!remoteJid || !remoteJid.endsWith('@g.us')) {
      // handle admin commands in DM (optional) - we keep commands in group only by design
      return;
    }

    // admin commands in group (only admins)
    const handled = await handleAdminCommands({
      sock,
      msg,
      config,
      banwords,
      banwordsPath,
      counters,
      countersPath,
      groupSettings,
      settingsPath
    });
    if (handled) return;

    // moderation detection
    const sender = msg.key.participant || msg.key.remoteJid;
    const isBypass = await isAdminOrOwner(sock, remoteJid, sender, config);
    if (isBypass) return;

    const v = detectViolation({ msg, config, banwords });
    if (!v) return;

    // update counters
    const now = Date.now();
    const winMs = (config.violationWindowMinutes || 10) * 60_000;
    counters[remoteJid] = (counters[remoteJid] || []).filter(ts => (now - ts) <= winMs);
    counters[remoteJid].push(now);
    saveJSON(countersPath, counters);

    // create case
    const caseId = createCase(caseStore, {
      groupId: remoteJid,
      userJid: sender,
      violation: v.type,
      evidence: v.evidence,
      ts: now
    }, config.caseExpireMinutes || 10);
    saveJSON(casesPath, caseStore);

    // group name (best effort)
    let groupName = remoteJid;
    try {
      const meta = await sock.groupMetadata(remoteJid);
      groupName = meta?.subject || remoteJid;
    } catch (e) {}

    // timezone for this group
    const tz = groupSettings[remoteJid]?.timezone || config.defaultTimezone || 'WIB';
    const tsStr = formatTs(now, tz);

    // send panel to admins
    await sendViolationPanel({
      sock,
      config,
      groupId: remoteJid,
      groupName,
      offenderJid: sender,
      offenderPhone: getPhoneFromJid(sender),
      violation: v.type,
      evidence: v.evidence,
      timeStr: tsStr,
      caseId
    });

    // risk alert
    const threshold = config.riskThreshold || 3;
    if (counters[remoteJid].length >= threshold) {
      await sendInfo(sock, config.admins, `⚠️ *RISK ALERT*
Grup: *${groupName}*
Sudah *${counters[remoteJid].length}* pelanggaran dalam ${config.violationWindowMinutes || 10} menit.
Disarankan admin mute/tutup grup sementara.`);
    }
  });

  // purge expired cases periodically
  setInterval(() => {
    const changed = purgeExpiredCases(caseStore);
    if (changed) saveJSON(casesPath, caseStore);
  }, 30_000);
}

start().catch(err => console.error(err));
