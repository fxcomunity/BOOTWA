const path = require("path");
const { readJSON, writeJSON } = require("./storage");
const { getCase, closeCase } = require("./caseManager");
const { closeGroup } = require("./grubcloser");

const SETTINGS_PATH = path.join(__dirname, "..", "data", "groupSettings.json");

function getGroupSettings() {
  return readJSON(SETTINGS_PATH, {});
}

function saveGroupSettings(settings) {
  writeJSON(SETTINGS_PATH, settings);
}

function setGroupTimezone(groupId, tzShort) {
  const settings = getGroupSettings();
  settings[groupId] = settings[groupId] || {};
  settings[groupId].timezone = tzShort;
  saveGroupSettings(settings);
}

function setGroupName(groupId, groupName) {
  const settings = getGroupSettings();
  settings[groupId] = settings[groupId] || {};
  settings[groupId].groupName = groupName;
  saveGroupSettings(settings);
}

async function handleAdminDecision(sock, msg) {
  const from = msg.key.remoteJid;

  const buttonId =
    msg.message?.buttonsResponseMessage?.selectedButtonId ||
    msg.message?.templateButtonReplyMessage?.selectedId;

  if (!buttonId || !buttonId.includes("|")) return false;

  const [action, caseId] = buttonId.split("|");
  const data = getCase(caseId);

  if (!data) {
    await sock.sendMessage(from, { text: "⏳ Case expired / tidak ditemukan." });
    return true;
  }

  if (data.status !== "open") {
    await sock.sendMessage(from, { text: "✅ Case sudah ditutup." });
    return true;
  }

  if (action === "KICK_YA") {
    try {
      await sock.groupParticipantsUpdate(data.groupId, [data.userJid], "remove");
      closeCase(caseId);
      await sock.sendMessage(from, { text: `✅ Pelanggar berhasil di-kick dari grup *${data.groupName}*.` });
    } catch (e) {
      closeCase(caseId);
      await sock.sendMessage(from, { text: `❌ Gagal kick (bot harus admin grup).` });
    }
    return true;
  }

  if (action === "KICK_NO") {
    closeCase(caseId);
    await sock.sendMessage(from, { text: "✅ Diabaikan." });
    return true;
  }

  if (action === "CLOSE_YA") {
    const ok = await closeGroup(sock, data.groupId);
    closeCase(caseId);
    await sock.sendMessage(from, { text: ok ? `✅ Grup *${data.groupName}* berhasil ditutup.` : "❌ Gagal tutup grup (bot harus admin)." });
    return true;
  }

  if (action === "CLOSE_NO") {
    closeCase(caseId);
    await sock.sendMessage(from, { text: "✅ Oke, tidak ditutup." });
    return true;
  }

  return false;
}

module.exports = { handleAdminDecision, setGroupTimezone, getGroupSettings, setGroupName };
