const path = require("path");
const fs = require("fs");
const { readJSON, writeJSON } = require("./storage");
const { getCase, closeCase } = require("./caseManager");
const { closeGroup } = require("./groupCloser");

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

  if (!buttonId) return false;
  if (!buttonId.includes("|")) return false;

  const [action, caseId] = buttonId.split("|");
  const data = getCase(caseId);

  if (!data) {
    await sock.sendMessage(from, { text: "⏳ Case sudah expired atau tidak ditemukan." });
    return true;
  }

  if (data.status !== "open") {
    await sock.sendMessage(from, { text: "✅ Case sudah ditutup sebelumnya." });
    return true;
  }

  if (action === "KICK_YA") {
    try {
      await sock.groupParticipantsUpdate(data.groupId, [data.userJid], "remove");
      closeCase(caseId);
      await sock.sendMessage(from, { text: `✅ Pelanggar berhasil di-kick dari grup *${data.groupName}*.` });
    } catch (e) {
      console.error("Kick error:", e);
      await sock.sendMessage(from, { text: `❌ Gagal kick. Pastikan bot adalah admin grup.` });
    }
    return true;
  }

  if (action === "KICK_NO") {
    closeCase(caseId);
    await sock.sendMessage(from, { text: "✅ Kasus diabaikan. Tidak ada tindakan." });
    return true;
  }

  if (action === "CLOSE_YA") {
    try {
      const ok = await closeGroup(sock, data.groupId);
      closeCase(caseId);
      await sock.sendMessage(from, { text: ok ? `✅ Grup *${data.groupName}* berhasil ditutup.` : "❌ Gagal menutup grup. Pastikan bot admin." });
    } catch (e) {
      console.error("Close error:", e);
      await sock.sendMessage(from, { text: "❌ Gagal menutup grup. Pastikan bot admin." });
    }
    return true;
  }

  if (action === "CLOSE_NO") {
    closeCase(caseId);
    await sock.sendMessage(from, { text: "✅ Oke. Grup tidak ditutup sekarang." });
    return true;
  }

  return false;
}

module.exports = {
  handleAdminDecision,
  setGroupTimezone,
  getGroupSettings,
  setGroupName
};
