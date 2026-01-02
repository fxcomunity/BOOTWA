const path = require("path");
const { readJSON, writeJSON } = require("./storage");
const { getCase, closeCase } = require("./caseManager");

// ✅ FIX: pakai huruf kecil semua
const { closeGroup } = require("./grubcloser");

const SETTINGS_PATH = path.join(__dirname, "..", "data", "groupSettings.json");

function getGroupSettings() {
  return readJSON(SETTINGS_PATH, {});
}

function saveGroupSettings(settings) {
  writeJSON(SETTINGS_PATH, settings);
}

function setGroupName(groupId, groupName) {
  const settings = getGroupSettings();
  settings[groupId] = settings[groupId] || {};
  settings[groupId].groupName = groupName;
  saveGroupSettings(settings);
}

// ✅ Helper: cek bot admin / cek target owner/admin
async function getGroupMetaSafe(sock, groupId) {
  try {
    return await sock.groupMetadata(groupId);
  } catch (e) {
    console.error("groupMetadata error:", e?.message || e);
    return null;
  }
}

function getBotJid(sock) {
  try {
    // sock.user.id format: "628xxx@s.whatsapp.net:123"
    return sock.user.id.split(":")[0] + "@s.whatsapp.net";
  } catch {
    return null;
  }
}

async function isBotAdmin(sock, groupId) {
  try {
    const meta = await getGroupMetaSafe(sock, groupId);
    if (!meta?.participants) return false;

    const botJid = getBotJid(sock);
    if (!botJid) return false;

    const bot = meta.participants.find(p => p.id === botJid);
    return !!bot?.admin; // admin / superadmin
  } catch (e) {
    console.error("isBotAdmin error:", e?.message || e);
    return false;
  }
}

async function getTargetRole(sock, groupId, targetJid) {
  try {
    const meta = await getGroupMetaSafe(sock, groupId);
    if (!meta?.participants) return { isAdmin: false, isOwner: false };

    const t = meta.participants.find(p => p.id === targetJid);
    const role = t?.admin || null;

    return {
      isAdmin: role === "admin" || role === "superadmin",
      isOwner: role === "superadmin" // biasanya owner/creator
    };
  } catch (e) {
    console.error("getTargetRole error:", e?.message || e);
    return { isAdmin: false, isOwner: false };
  }
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

  // ✅ KICK ACTION
  if (action === "KICK_YA") {
    try {
      // ✅ cek bot admin dulu
      const botAdmin = await isBotAdmin(sock, data.groupId);
      if (!botAdmin) {
        closeCase(caseId);
        await sock.sendMessage(from, {
          text:
            `❌ *Gagal kick!*\n\n` +
            `📌 Grup: *${data.groupName}*\n` +
            `👤 Target: *${data.violatorPhone || data.userJid}*\n\n` +
            `🚫 Bot belum admin di grup.\n` +
            `➡️ Jadikan bot ADMIN dulu baru bisa kick.`
        });
        return true;
      }

      // ✅ cek role target (owner/admin)
      const role = await getTargetRole(sock, data.groupId, data.userJid);

      // ❌ owner tidak bisa di-kick
      if (role.isOwner) {
        closeCase(caseId);
        await sock.sendMessage(from, {
          text:
            `❌ *Tidak bisa kick OWNER/CREATOR grup!*\n\n` +
            `📌 Grup: *${data.groupName}*\n` +
            `👤 Target: *${data.violatorPhone || data.userJid}*\n\n` +
            `⚠️ WhatsApp tidak mengizinkan remove creator grup.`
        });
        return true;
      }

      // ✅ kick
      await sock.groupParticipantsUpdate(data.groupId, [data.userJid], "remove");

      closeCase(caseId);
      await sock.sendMessage(from, {
        text:
          `✅ *Berhasil kick pelanggar!*\n\n` +
          `📌 Grup: *${data.groupName}*\n` +
          `👤 Target: *${data.violatorPhone || data.userJid}*\n` +
          `🕒 Waktu: ${new Date().toLocaleString()}`
      });

    } catch (e) {
      closeCase(caseId);

      const errMsg = e?.message || e?.toString() || "unknown";
      const lower = errMsg.toLowerCase();

      let reasonText =
        `❌ *Gagal kick pelanggar!*\n\n` +
        `📌 Grup: *${data.groupName}*\n` +
        `👤 Target: *${data.violatorPhone || data.userJid}*\n\n` +
        `🧾 Error: ${errMsg}\n\n`;

      if (lower.includes("not-authorized") || lower.includes("403")) {
        reasonText += "🚫 Bot tidak punya izin.\n➡️ Pastikan bot admin & target bukan OWNER grup.";
      } else if (lower.includes("participant") || lower.includes("not found")) {
        reasonText += "👤 Target tidak ditemukan.\n➡️ Bisa jadi sudah keluar / bukan member.";
      } else {
        reasonText += "➡️ Pastikan bot admin & target bukan OWNER grup.";
      }

      await sock.sendMessage(from, { text: reasonText });
    }
    return true;
  }

  // ✅ KICK NO ACTION
  if (action === "KICK_NO") {
    closeCase(caseId);
    await sock.sendMessage(from, { text: "✅ Diabaikan (tidak di-kick)." });
    return true;
  }

  // ✅ CLOSE GROUP
  if (action === "CLOSE_YA") {
    const ok = await closeGroup(sock, data.groupId);
    closeCase(caseId);
    await sock.sendMessage(from, {
      text: ok ? `✅ Grup berhasil ditutup.` : "❌ Gagal tutup grup (bot harus admin)."
    });
    return true;
  }

  if (action === "CLOSE_NO") {
    closeCase(caseId);
    await sock.sendMessage(from, { text: "✅ Tidak ditutup." });
    return true;
  }

  return false;
}

module.exports = { handleAdminDecision, getGroupSettings, setGroupName };
