const { saveJSON } = require('./storage');
const { getCase, closeCase } = require('./caseManager');
const { getPhoneFromJid, formatTs } = require('./helpers');

async function handleButtonAction({ sock, msg, config, caseStore, casesPath, groupSettings, settingsPath }) {
  const br = msg.message.buttonsResponseMessage;
  const btnId = br?.selectedButtonId || msg.message.templateButtonReplyMessage?.selectedId;
  if (!btnId) return;

  // KICK/IGNORE cases
  if (btnId.startsWith('KICK:') || btnId.startsWith('IGNORE:')) {
    const [action, caseId] = btnId.split(':');
    const c = getCase(caseStore, caseId);
    if (!c || c.status !== 'open') {
      await sock.sendMessage(msg.key.remoteJid, { text: '⏳ Case sudah expired / ditutup.' });
      return;
    }

    if (action === 'IGNORE') {
      closeCase(caseStore, caseId, 'ignored');
      saveJSON(casesPath, caseStore);
      await sock.sendMessage(msg.key.remoteJid, { text: '✅ Kasus diabaikan. Tidak ada tindakan.' });
      return;
    }

    // action KICK
    try {
      await sock.groupParticipantsUpdate(c.groupId, [c.userJid], 'remove');
      closeCase(caseStore, caseId, 'kicked');
      saveJSON(casesPath, caseStore);
      await sock.sendMessage(msg.key.remoteJid, { text: `✅ Berhasil kick +${getPhoneFromJid(c.userJid)} dari grup.` });
    } catch (e) {
      await sock.sendMessage(msg.key.remoteJid, { text: `❌ Gagal kick (bot harus admin).` });
    }
    return;
  }

  // CLOSE group reminders
  if (btnId.startsWith('CLOSE:') || btnId.startsWith('CLOSE_IGNORE:')) {
    const [action, groupId] = btnId.split(':');
    if (action === 'CLOSE_IGNORE') {
      await sock.sendMessage(msg.key.remoteJid, { text: '✅ Oke, tidak ditutup sekarang.' });
      return;
    }
    try {
      await sock.groupSettingUpdate(groupId, 'announcement');
      await sock.sendMessage(msg.key.remoteJid, { text: '✅ Grup berhasil ditutup (hanya admin bisa kirim pesan).' });
    } catch (e) {
      await sock.sendMessage(msg.key.remoteJid, { text: '❌ Gagal menutup grup (bot harus admin).' });
    }
    return;
  }
}

async function handleAdminCommands({ sock, msg, config, banwords, banwordsPath, counters, countersPath, groupSettings, settingsPath }) {
  const remoteJid = msg.key.remoteJid;
  const sender = msg.key.participant;
  if (!remoteJid.endsWith('@g.us')) return false;

  // commands
  const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
  if (!text.startsWith('!')) return false;

  // only admins
  const wl = new Set((config.admins || []).map(x => x.trim()));
  const isWL = wl.has(sender);
  let isGroupAdmin = false;
  try {
    const meta = await sock.groupMetadata(remoteJid);
    const p = meta.participants || [];
    const found = p.find(x => x.id === sender);
    isGroupAdmin = found && (found.admin === 'admin' || found.admin === 'superadmin');
  } catch (e) {}
  if (!(isWL || isGroupAdmin)) return false;

  const [cmd, ...rest] = text.trim().split(/\s+/);
  const arg = rest.join(' ').trim();

  if (cmd === '!help') {
    await sock.sendMessage(remoteJid, { text:
`🤖 *WA Moderation Bot*
!addword <kata/link>
!removeword <kata/link>
!listwords
!resetcounter
!settimezone WIB|WITA|WIT
!groupstatus` });
    return true;
  }

  if (cmd === '!addword' && arg) {
    if (!banwords.includes(arg)) banwords.push(arg);
    saveJSON(banwordsPath, banwords);
    await sock.sendMessage(remoteJid, { text: `✅ Ditambahkan: ${arg}` });
    return true;
  }

  if (cmd === '!removeword' && arg) {
    const idx = banwords.indexOf(arg);
    if (idx >= 0) banwords.splice(idx, 1);
    saveJSON(banwordsPath, banwords);
    await sock.sendMessage(remoteJid, { text: `✅ Dihapus: ${arg}` });
    return true;
  }

  if (cmd === '!listwords') {
    await sock.sendMessage(remoteJid, { text: `📌 Blacklist:
- ${banwords.join('
- ') || '(kosong)'}` });
    return true;
  }

  if (cmd === '!resetcounter') {
    counters[remoteJid] = [];
    saveJSON(countersPath, counters);
    await sock.sendMessage(remoteJid, { text: `✅ Counter reset.` });
    return true;
  }

  if (cmd === '!settimezone' && arg) {
    const up = arg.toUpperCase();
    if (!['WIB','WITA','WIT'].includes(up)) {
      await sock.sendMessage(remoteJid, { text: '❌ Format: !settimezone WIB|WITA|WIT' });
      return true;
    }
    groupSettings[remoteJid] = groupSettings[remoteJid] || {};
    groupSettings[remoteJid].timezone = up;
    saveJSON(settingsPath, groupSettings);
    await sock.sendMessage(remoteJid, { text: `✅ Timezone grup diset ke ${up}` });
    return true;
  }

  if (cmd === '!groupstatus') {
    const tz = groupSettings[remoteJid]?.timezone || config.defaultTimezone || 'WIB';
    await sock.sendMessage(remoteJid, { text: `📍 Timezone grup: *${tz}*
⏰ Auto close WIB jam 22:00 (hanya grup WIB).` });
    return true;
  }

  return false;
}

module.exports = { handleButtonAction, handleAdminCommands };
