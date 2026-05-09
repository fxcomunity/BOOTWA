const path = require("path");
const config = require("../config.json");
const { readJSON, writeJSON } = require("./storage");
const { getPrefix, setPrefix, getBotConfig } = require("./botConfig");
const { addGroupBlacklist, removeGroupBlacklist, getBlacklistedGroups } = require("./groupBlacklist");

const BOT_CONFIG_PATH = path.join(__dirname, "..", "data", "botConfig.json");

async function safeSend(sock, jid, payload) {
  try { await sock.sendMessage(jid, payload); } catch(e) { console.error("safeSend:", e?.message); }
}

function getBotJid(sock) {
  try { return sock.user.id.split(":")[0] + "@s.whatsapp.net"; } catch { return null; }
}

async function handleOwnerCommands(sock, msg, { notifyQueue, startTime }) {
  const from = msg.key.remoteJid;
  const sender = msg.key.participant || msg.key.remoteJid;
  const body = msg.message?.conversation || msg.message?.extendedTextMessage?.text || "";
  const prefix = getPrefix();

  if (!body.startsWith(prefix)) return false;

  const args = body.slice(prefix.length).trim().split(/\s+/);
  const cmd = args[0].toLowerCase();
  const rest = args.slice(1).join(" ");

  const ownerCmds = [
    "addadmin","deladmin","listadmin","broadcast","joingroup",
    "leavegroup","leaveall","blacklistgroup","unblacklistgroup",
    "grouplist","restart","clearqueue","status","getconfig",
    "setprefix","eval","shutdown"
  ];
  if (!ownerCmds.includes(cmd)) return false;

  // Only owner
  const ownerJid = config.owner;
  if (sender !== ownerJid) {
    await safeSend(sock, from, { text: "❌ Command ini hanya untuk *OWNER* bot." });
    return true;
  }

  // .addadmin
  if (cmd === "addadmin") {
    const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.participant;
    const target = mentioned[0] || quoted;
    if (!target) {
      await safeSend(sock, from, { text: `❌ Tag/reply member dulu.\nContoh: *${prefix}addadmin @user*` });
      return true;
    }
    const cfg = readJSON(path.join(__dirname, "../config.json"), {});
    if (!cfg.admins.includes(target)) {
      cfg.admins.push(target);
      writeJSON(path.join(__dirname, "../config.json"), cfg);
    }
    const phone = target.split("@")[0];
    await safeSend(sock, from, { text: `✅ *+${phone}* berhasil ditambahkan sebagai *Admin Bot!*` });
    return true;
  }

  // .deladmin
  if (cmd === "deladmin") {
    const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.participant;
    const target = mentioned[0] || quoted;
    if (!target) {
      await safeSend(sock, from, { text: `❌ Tag/reply member dulu.\nContoh: *${prefix}deladmin @user*` });
      return true;
    }
    const cfg = readJSON(path.join(__dirname, "../config.json"), {});
    cfg.admins = cfg.admins.filter(a => a !== target);
    writeJSON(path.join(__dirname, "../config.json"), cfg);
    const phone = target.split("@")[0];
    await safeSend(sock, from, { text: `✅ *+${phone}* dihapus dari daftar *Admin Bot.*` });
    return true;
  }

  // .listadmin
  if (cmd === "listadmin") {
    const list = config.admins.map((a, i) => `${i + 1}. +${a.split("@")[0]}`).join("\n");
    await safeSend(sock, from, {
      text: `👑 *DAFTAR ADMIN BOT*\n━━━━━━━━━━━━━\n${list || "Kosong"}\n━━━━━━━━━━━━━\nTotal: ${config.admins.length} admin`
    });
    return true;
  }

  // .broadcast
  if (cmd === "broadcast") {
    if (!rest) { await safeSend(sock, from, { text: `❌ Isi pesan broadcast.\nContoh: *${prefix}broadcast Halo semua!*` }); return true; }
    try {
      const groups = await sock.groupFetchAllParticipating();
      const ids = Object.keys(groups);
      await safeSend(sock, from, { text: `📡 Mengirim broadcast ke *${ids.length} grup*...` });
      let ok = 0;
      for (const id of ids) {
        try {
          await sock.sendMessage(id, { text: `📢 *BROADCAST*\n━━━━━━━━━━━━━\n${rest}` });
          ok++;
          await new Promise(r => setTimeout(r, 1500));
        } catch {}
      }
      await safeSend(sock, from, { text: `✅ Broadcast selesai: *${ok}/${ids.length}* grup berhasil.` });
    } catch(e) {
      await safeSend(sock, from, { text: `❌ Broadcast gagal: ${e?.message}` });
    }
    return true;
  }

  // .joingroup
  if (cmd === "joingroup") {
    if (!rest) { await safeSend(sock, from, { text: `❌ Sertakan link grup.\nContoh: *${prefix}joingroup https://chat.whatsapp.com/xxx*` }); return true; }
    try {
      const code = rest.split("chat.whatsapp.com/")[1]?.split("?")[0]?.trim();
      if (!code) throw new Error("Link tidak valid");
      await sock.groupAcceptInvite(code);
      await safeSend(sock, from, { text: `✅ Bot berhasil join grup!` });
    } catch(e) {
      await safeSend(sock, from, { text: `❌ Gagal join: ${e?.message}` });
    }
    return true;
  }

  // .leavegroup
  if (cmd === "leavegroup") {
    if (!from.endsWith("@g.us")) { await safeSend(sock, from, { text: "❌ Harus di dalam grup." }); return true; }
    await safeSend(sock, from, { text: "👋 Bot akan keluar dari grup ini..." });
    setTimeout(() => sock.groupLeave(from).catch(() => {}), 2000);
    return true;
  }

  // .leaveall
  if (cmd === "leaveall") {
    try {
      const groups = await sock.groupFetchAllParticipating();
      const ids = Object.keys(groups);
      await safeSend(sock, from, { text: `⚠️ Bot akan keluar dari *${ids.length} grup*...` });
      for (const id of ids) {
        try { await sock.groupLeave(id); await new Promise(r => setTimeout(r, 1000)); } catch {}
      }
    } catch(e) {
      await safeSend(sock, from, { text: `❌ Error: ${e?.message}` });
    }
    return true;
  }

  // .blacklistgroup / .unblacklistgroup
  if (cmd === "blacklistgroup") {
    const targetGroup = rest || from;
    addGroupBlacklist(targetGroup);
    await safeSend(sock, from, { text: `🚫 Grup *${targetGroup}* berhasil di-blacklist.` });
    return true;
  }

  if (cmd === "unblacklistgroup") {
    const targetGroup = rest || from;
    removeGroupBlacklist(targetGroup);
    await safeSend(sock, from, { text: `✅ Grup *${targetGroup}* dihapus dari blacklist.` });
    return true;
  }

  // .grouplist
  if (cmd === "grouplist") {
    try {
      const groups = await sock.groupFetchAllParticipating();
      const blacklisted = getBlacklistedGroups();
      const list = Object.entries(groups).map(([id, g], i) => {
        const bl = blacklisted.includes(id) ? "🚫" : "✅";
        return `${i + 1}. ${bl} ${g.subject || "Unnamed"} (${g.participants?.length || 0} member)`;
      }).join("\n");
      await safeSend(sock, from, {
        text: `📋 *GRUP LIST BOT*\n━━━━━━━━━━━━━\n${list || "Tidak ada grup"}\n━━━━━━━━━━━━━\nTotal: ${Object.keys(groups).length} grup`
      });
    } catch(e) {
      await safeSend(sock, from, { text: `❌ Error: ${e?.message}` });
    }
    return true;
  }

  // .clearqueue
  if (cmd === "clearqueue") {
    const len = notifyQueue.length;
    notifyQueue.splice(0, notifyQueue.length);
    await safeSend(sock, from, { text: `🗑️ Queue dibersihkan! *${len}* item dihapus.` });
    return true;
  }

  // .status
  if (cmd === "status") {
    const uptime = Math.floor((Date.now() - startTime) / 1000);
    const h = Math.floor(uptime / 3600);
    const m = Math.floor((uptime % 3600) / 60);
    const s = uptime % 60;
    const botJid = getBotJid(sock);
    await safeSend(sock, from, {
      text: `📊 *STATUS SISTEM*\n━━━━━━━━━━━━━\n` +
        `📡 Koneksi: ✅ Online\n` +
        `⏱️ Uptime: ${h}j ${m}m ${s}d\n` +
        `📬 Queue: ${notifyQueue.length} item\n` +
        `🆔 Bot JID: ${botJid || "unknown"}\n` +
        `👑 Owner: +${(config.owner || "").split("@")[0]}\n` +
        `🛡️ Admin: ${config.admins.length} orang\n` +
        `🔧 Prefix: ${getPrefix()}\n` +
        `━━━━━━━━━━━━━`
    });
    return true;
  }

  // .getconfig
  if (cmd === "getconfig") {
    const safe = { ...config };
    delete safe.nsfwDetection;
    await safeSend(sock, from, {
      text: `⚙️ *CONFIG BOT*\n━━━━━━━━━━━━━\n${JSON.stringify(safe, null, 2)}\n━━━━━━━━━━━━━`
    });
    return true;
  }

  // .setprefix
  if (cmd === "setprefix") {
    if (!rest || rest.length > 2) { await safeSend(sock, from, { text: `❌ Prefix harus 1-2 karakter.\nContoh: *${prefix}setprefix !*` }); return true; }
    setPrefix(rest.trim());
    await safeSend(sock, from, { text: `✅ Prefix berhasil diganti ke *"${rest.trim()}"*` });
    return true;
  }

  // .eval
  if (cmd === "eval") {
    if (!rest) { await safeSend(sock, from, { text: `❌ Masukkan kode JS.\nContoh: *${prefix}eval 1+1*` }); return true; }
    try {
      // eslint-disable-next-line no-eval
      let result = eval(rest);
      if (typeof result !== "string") result = JSON.stringify(result, null, 2);
      await safeSend(sock, from, { text: `🔧 *EVAL RESULT*\n\`\`\`\n${result}\n\`\`\`` });
    } catch(e) {
      await safeSend(sock, from, { text: `❌ Error: ${e?.message}` });
    }
    return true;
  }

  // .restart
  if (cmd === "restart") {
    await safeSend(sock, from, { text: "♻️ Bot sedang restart..." });
    setTimeout(() => process.exit(0), 2000);
    return true;
  }

  // .shutdown
  if (cmd === "shutdown") {
    await safeSend(sock, from, { text: "🔴 Bot dimatikan oleh owner." });
    setTimeout(() => process.exit(1), 2000);
    return true;
  }

  return false;
}

module.exports = { handleOwnerCommands };
