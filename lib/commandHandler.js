const path = require("path");
const config = require("../config.json");
const { readJSON, writeJSON } = require("./storage");
const { getAdminLogGroupId, setAdminLogGroupId } = require("./logStore");
const { addWarn, resetWarn, getWarnList, getWarns, MAX_WARNS } = require("./warnManager");
const { getPrefix } = require("./botConfig");
const { handleOwnerCommands } = require("./ownerCommands");

const BANLIST_PATH = path.join(__dirname, "..", "data", "banlist.json");

// ─── FX Community Rules ───────────────────────────────────────────
const RULES_TEXT =
  `╔═══════════════════════╗
║   🏢 *FX COMMUNITY* 📈   ║
╚═══════════════════════╝
_Tempat sharing trader Forex dari berbagai level, dari pemula sampai pro. Saling belajar, sharing setup, dan jaga vibe positif._

━━━━━━━━━━━━━━━━━━━━
📋 *PERATURAN GRUP*
━━━━━━━━━━━━━━━━━━━━
*1.* 🚫 Dilarang promosi akun, sinyal, atau grup lain tanpa izin admin.
*2.* 🤝 Jaga sopan santun & hindari debat gak penting.
*3.* 📊 Share analisa, edukasi, atau info market yang bermanfaat.
*4.* ⛔ Hoax, spam, dan SARA = kick tanpa peringatan.
*5.* ❓ Boleh tanya apa pun soal trading, tapi usahakan jelas & sopan.
*6.* 💬 Gunakan bahasa mudah dipahami, jangan singkatan berlebihan.
*7.* 👮 Admin berhak menegur atau mengeluarkan anggota jika melanggar.
*8.* 🤖 User *dilarang* memakai BOT Chat di Grup. Tidak ada alasan yang diterima.
*9.* 🔞 Stiker vulgar = *langsung kick tanpa basa-basi.*

━━━━━━━━━━━━━━━━━━━━
📚 *SUMBER BELAJAR*
━━━━━━━━━━━━━━━━━━━━
✅ *Baru di Forex? Tonton ini dulu:*
https://youtu.be/yimrVJdzQLs?si=LgQ1OtubVI_a6eJP

✅ *Belajar Saham:*
https://youtube.com/@theinvestor?si=JSe9yIcJphKEcB37

✅ *Materi & File Pendukung (Drive):*
https://drive.google.com/drive/folders/11HxV2K-ehYiyHFeI4LNjMqmuV7ETG7A3?usp=sharing

━━━━━━━━━━━━━━━━━━━━
🔗 *LINK PENTING*
━━━━━━━━━━━━━━━━━━━━
📡 *Grup Signal 100% FREE:*
https://t.me/+Ng64dWNMACg1ODQ1

🌐 *Website Resmi FX Community:*
https://fxcomunity.vercel.app/

📱 *Aplikasi:*
https://mega.nz/file/DLIzVA5I#AoO4cdFq_GD07MOFBPGEOwu90SCCfoPU7vQpZtDmAYQ

💹 *Broker Rekomendasi:*
Minimal depo 20–30K | Ada akun cent | 100% AMAN
https://fbs.partners?ibl=957159&ibp=37183404

🏠 *Grup Utama:*
https://chat.whatsapp.com/KnkESJgEUKT5PEki4SpDD0?mode=gi_t

━━━━━━━━━━━━━━━━━━━━
💭 *PENUTUP*
━━━━━━━━━━━━━━━━━━━━
_"Jangan iri lihat profit orang, fokuslah pada proses sendiri. Market itu bukan musuh, tapi cermin dari kesabaran dan konsistensi kita."_

🌟 Selamat belajar & konsisten di jalur yang bener!`;

// ─── Helpers ─────────────────────────────────────────────────────
async function safeSend(sock, jid, payload) {
  try { await sock.sendMessage(jid, payload); } catch (e) { console.error("safeSend:", e?.message); }
}

function getBotJid(sock) {
  try { return sock.user.id.split(":")[0] + "@s.whatsapp.net"; } catch { return null; }
}

async function getGroupMeta(sock, groupId) {
  try { return await sock.groupMetadata(groupId); } catch { return null; }
}

async function isBotAdmin(sock, groupId) {
  const meta = await getGroupMeta(sock, groupId);
  if (!meta) return false;
  const botJid = getBotJid(sock);
  const bot = meta.participants.find(p => p.id === botJid);
  return !!bot?.admin;
}

function getTargetJid(msg) {
  const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid;
  const quoted = msg.message?.extendedTextMessage?.contextInfo?.participant;
  if (mentioned?.length) return mentioned[0];
  if (quoted) return quoted;
  return null;
}

function isOwner(jid) { return jid === config.owner; }
function isAdminBot(jid) { return config.admins.includes(jid) || isOwner(jid); }

function getBanList() { return readJSON(BANLIST_PATH, { users: [] }); }
function saveBanList(data) { writeJSON(BANLIST_PATH, data); }

// ─── Menu Text ───────────────────────────────────────────────────
function buildMenu(role, prefix) {
  const p = prefix;
  const userSection =
    `👤 *USER COMMANDS*\n` +
    `┌ ${p}menu / ${p}help - Tampilkan menu\n` +
    `├ ${p}rules / ${p}peraturan - Peraturan grup\n` +
    `├ ${p}dnn / ${p}komunitas - Info FX Community\n` +
    `└ ${p}ping - Cek bot aktif\n`;

  const adminSection =
    `\n🛡️ *ADMIN COMMANDS*\n` +
    `┌ ${p}tagall [pesan] - Tag semua member\n` +
    `├ ${p}hidetag [pesan] - Tag tersembunyi\n` +
    `├ ${p}kick - Kick member (reply/tag)\n` +
    `├ ${p}kickall - Kick semua non-admin\n` +
    `├ ${p}ban / ${p}unban - Ban permanen\n` +
    `├ ${p}banlist - Daftar banned user\n` +
    `├ ${p}warn [alasan] - Beri warning (3x=kick)\n` +
    `├ ${p}warnlist - Lihat semua warning\n` +
    `├ ${p}resetwarn - Reset warning user\n` +
    `├ ${p}promote / ${p}demote - Manage admin WA\n` +
    `├ ${p}mute / ${p}unmute - Kunci/buka grup\n` +
    `├ ${p}settitle [nama] - Ganti nama grup\n` +
    `├ ${p}setdesc [teks] - Ganti deskripsi\n` +
    `├ ${p}antilink on/off - Toggle anti link\n` +
    `├ ${p}antinsfw on/off - Toggle NSFW detection\n` +
    `├ ${p}id - Group ID\n` +
    `├ ${p}jid - JID user (reply)\n` +
    `├ ${p}setlog / ${p}getlog - Manage log grup\n` +
    `└ ${p}setdesc [teks] - Ganti deskripsi\n`;

  const ownerSection =
    `\n👑 *OWNER COMMANDS*\n` +
    `┌ ${p}addadmin / ${p}deladmin / ${p}listadmin\n` +
    `├ ${p}broadcast [pesan] - Blast ke semua grup\n` +
    `├ ${p}joingroup [link] - Bot join grup\n` +
    `├ ${p}leavegroup / ${p}leaveall\n` +
    `├ ${p}blacklistgroup / ${p}unblacklistgroup\n` +
    `├ ${p}grouplist - Semua grup bot\n` +
    `├ ${p}restart / ${p}shutdown\n` +
    `├ ${p}clearqueue / ${p}status\n` +
    `├ ${p}getconfig / ${p}setprefix [char]\n` +
    `└ ${p}eval [js] - Eksekusi kode JS 🔥\n`;

  let text = `🤖 *BOOTWA COMMAND MENU*\n${"━".repeat(22)}\n\n${userSection}`;
  if (role === "admin" || role === "owner") text += adminSection;
  if (role === "owner") text += ownerSection;
  text += `\n${"━".repeat(22)}\n_Prefix: *${p}* | FX Community Bot_`;
  return text;
}

// ─── Main Handler ─────────────────────────────────────────────────
async function handleCommands(sock, msg, state) {
  const from = msg.key.remoteJid;
  const sender = msg.key.participant || msg.key.remoteJid;
  const body = msg.message?.conversation || msg.message?.extendedTextMessage?.text || "";
  const prefix = getPrefix();

  if (!body.startsWith(prefix)) return false;

  const args = body.slice(prefix.length).trim().split(/\s+/);
  const cmd = args[0].toLowerCase();
  const rest = args.slice(1).join(" ");
  const isGroup = from.endsWith("@g.us");

  // Try owner commands first
  const ownerHandled = await handleOwnerCommands(sock, msg, state);
  if (ownerHandled) return true;

  // Determine role
  const role = isOwner(sender) ? "owner" : isAdminBot(sender) ? "admin" : "user";

  // ── USER COMMANDS (everyone) ────────────────────────────────────

  if (cmd === "ping") {
    const t = Date.now();
    await safeSend(sock, from, { text: `🏓 *Pong!* ${Date.now() - t}ms\n✅ Bot aktif & siap!` });
    return true;
  }

  if (cmd === "menu" || cmd === "help") {
    await safeSend(sock, from, { text: buildMenu(role, prefix) });
    return true;
  }

  if (cmd === "rules" || cmd === "peraturan") {
    await safeSend(sock, from, { text: RULES_TEXT });
    return true;
  }

  if (cmd === "dnn" || cmd === "komunitas") {
    await safeSend(sock, from, { text: RULES_TEXT });
    return true;
  }

  // ── ADMIN COMMANDS ──────────────────────────────────────────────
  if (!isAdminBot(sender)) {
    // Not admin, not a known user command → return false so moderation can run
    return false;
  }

  if (!isGroup) {
    await safeSend(sock, from, { text: "❌ Command ini hanya bisa digunakan di dalam *grup*." });
    return true;
  }

  // .id
  if (cmd === "id") {
    await safeSend(sock, from, { text: `✅ *Group ID:*\n\`${from}\`` });
    return true;
  }

  // .jid
  if (cmd === "jid") {
    const target = getTargetJid(msg);
    if (!target) { await safeSend(sock, from, { text: `❌ Reply pesan seseorang lalu ketik *${prefix}jid*` }); return true; }
    await safeSend(sock, from, { text: `✅ *JID User:*\n\`${target}\`` });
    return true;
  }

  // .setlog
  if (cmd === "setlog") {
    const saved = setAdminLogGroupId(from);
    await safeSend(sock, from, { text: `✅ Grup ini dijadikan *ADMIN LOG GROUP*\n📌 ID: \`${from}\`\n🕒 ${saved.updatedAt}` });
    return true;
  }

  // .getlog
  if (cmd === "getlog") {
    const logGroup = getAdminLogGroupId();
    await safeSend(sock, from, { text: `✅ Admin log grup:\n${logGroup || "Belum diset"}` });
    return true;
  }

  // .tagall
  if (cmd === "tagall") {
    const meta = await getGroupMeta(sock, from);
    if (!meta) { await safeSend(sock, from, { text: "❌ Gagal ambil data grup." }); return true; }
    const mentions = meta.participants.map(p => p.id);
    const tags = mentions.map(j => `@${j.split("@")[0]}`).join(" ");
    const pesan = rest || "📢 Perhatian semua member!";
    await safeSend(sock, from, { text: `${pesan}\n\n${tags}`, mentions });
    return true;
  }

  // .hidetag
  if (cmd === "hidetag") {
    const meta = await getGroupMeta(sock, from);
    if (!meta) { await safeSend(sock, from, { text: "❌ Gagal ambil data grup." }); return true; }
    const mentions = meta.participants.map(p => p.id);
    const pesan = rest || "📢";
    await safeSend(sock, from, { text: pesan, mentions });
    return true;
  }

  // .kick
  if (cmd === "kick") {
    const target = getTargetJid(msg);
    if (!target) { await safeSend(sock, from, { text: `❌ Reply/tag member dulu.\nContoh: *${prefix}kick @user*` }); return true; }
    const botAdmin = await isBotAdmin(sock, from);
    if (!botAdmin) { await safeSend(sock, from, { text: "❌ Bot harus jadi *admin grup* dulu!" }); return true; }
    try {
      await sock.groupParticipantsUpdate(from, [target], "remove");
      await safeSend(sock, from, { text: `✅ *+${target.split("@")[0]}* berhasil di-kick!` });
    } catch (e) {
      await safeSend(sock, from, { text: `❌ Gagal kick: ${e?.message}` });
    }
    return true;
  }

  // .kickall
  if (cmd === "kickall") {
    const botAdmin = await isBotAdmin(sock, from);
    if (!botAdmin) { await safeSend(sock, from, { text: "❌ Bot harus jadi *admin grup* dulu!" }); return true; }
    const meta = await getGroupMeta(sock, from);
    if (!meta) { await safeSend(sock, from, { text: "❌ Gagal ambil data grup." }); return true; }
    const botJid = getBotJid(sock);
    const protected_ = [botJid, config.owner, ...config.admins];
    const targets = meta.participants
      .filter(p => !protected_.includes(p.id) && !p.admin)
      .map(p => p.id);
    if (!targets.length) { await safeSend(sock, from, { text: "✅ Tidak ada member yang bisa di-kick." }); return true; }
    await safeSend(sock, from, { text: `⚠️ Kick *${targets.length}* member...` });
    for (const t of targets) {
      try { await sock.groupParticipantsUpdate(from, [t], "remove"); await new Promise(r => setTimeout(r, 800)); } catch { }
    }
    await safeSend(sock, from, { text: `✅ Selesai kick *${targets.length}* member!` });
    return true;
  }

  // .ban
  if (cmd === "ban") {
    const target = getTargetJid(msg);
    if (!target) { await safeSend(sock, from, { text: `❌ Reply/tag member dulu.\nContoh: *${prefix}ban @user*` }); return true; }
    const bl = getBanList();
    if (!bl.users.includes(target)) bl.users.push(target);
    saveBanList(bl);
    const botAdmin = await isBotAdmin(sock, from);
    if (botAdmin) { try { await sock.groupParticipantsUpdate(from, [target], "remove"); } catch { } }
    await safeSend(sock, from, {
      text: `🔨 *+${target.split("@")[0]}* berhasil di-*BAN!*\n📌 User tidak bisa bergabung kembali.\n${botAdmin ? "✅ Auto-kick berhasil." : "⚠️ Bot bukan admin, kick manual diperlukan."}`
    });
    return true;
  }

  // .unban
  if (cmd === "unban") {
    const target = getTargetJid(msg);
    if (!target) { await safeSend(sock, from, { text: `❌ Reply/tag member dulu.` }); return true; }
    const bl = getBanList();
    bl.users = bl.users.filter(u => u !== target);
    saveBanList(bl);
    await safeSend(sock, from, { text: `✅ *+${target.split("@")[0]}* berhasil di-*UNBAN!*` });
    return true;
  }

  // .banlist
  if (cmd === "banlist") {
    const bl = getBanList();
    if (!bl.users.length) { await safeSend(sock, from, { text: "✅ Banlist kosong." }); return true; }
    const list = bl.users.map((u, i) => `${i + 1}. +${u.split("@")[0]}`).join("\n");
    await safeSend(sock, from, { text: `🔨 *BANLIST* (${bl.users.length} user)\n━━━━━━━━━━━━━\n${list}` });
    return true;
  }

  // .warn
  if (cmd === "warn") {
    const target = getTargetJid(msg);
    if (!target) { await safeSend(sock, from, { text: `❌ Reply/tag member dulu.\nContoh: *${prefix}warn @user melanggar rules*` }); return true; }
    const reason = rest || "Pelanggaran peraturan grup";
    const count = addWarn(from, target, reason);
    if (count >= MAX_WARNS) {
      const botAdmin = await isBotAdmin(sock, from);
      await safeSend(sock, from, {
        text: `⚠️ @${target.split("@")[0]} sudah *${count}x* warning!\n🔨 *AUTO-KICK!*\n📌 Alasan: ${reason}`,
        mentions: [target]
      });
      if (botAdmin) { try { await sock.groupParticipantsUpdate(from, [target], "remove"); } catch { } }
      resetWarn(from, target);
    } else {
      await safeSend(sock, from, {
        text: `⚠️ *WARNING* untuk @${target.split("@")[0]}\n📌 Alasan: ${reason}\n🔢 Warning: *${count}/${MAX_WARNS}*\n${count >= 2 ? "🚨 *Sekali lagi = AUTO-KICK!*" : ""}`,
        mentions: [target]
      });
    }
    return true;
  }

  // .warnlist
  if (cmd === "warnlist") {
    const list = getWarnList(from);
    const entries = Object.entries(list);
    if (!entries.length) { await safeSend(sock, from, { text: "✅ Tidak ada warning aktif." }); return true; }
    const text = entries.map(([jid, warns], i) => {
      return `${i + 1}. +${jid.split("@")[0]}: *${warns.length}x* warn`;
    }).join("\n");
    await safeSend(sock, from, { text: `⚠️ *WARN LIST*\n━━━━━━━━━━━━━\n${text}` });
    return true;
  }

  // .resetwarn
  if (cmd === "resetwarn") {
    const target = getTargetJid(msg);
    if (!target) { await safeSend(sock, from, { text: `❌ Reply/tag member dulu.` }); return true; }
    resetWarn(from, target);
    await safeSend(sock, from, { text: `✅ Warning *+${target.split("@")[0]}* berhasil direset!` });
    return true;
  }

  // .promote
  if (cmd === "promote") {
    const target = getTargetJid(msg);
    if (!target) { await safeSend(sock, from, { text: `❌ Reply/tag member dulu.` }); return true; }
    try {
      await sock.groupParticipantsUpdate(from, [target], "promote");
      await safeSend(sock, from, { text: `✅ *+${target.split("@")[0]}* berhasil di-*PROMOTE* jadi admin!`, mentions: [target] });
    } catch (e) { await safeSend(sock, from, { text: `❌ Gagal promote: ${e?.message}` }); }
    return true;
  }

  // .demote
  if (cmd === "demote") {
    const target = getTargetJid(msg);
    if (!target) { await safeSend(sock, from, { text: `❌ Reply/tag member dulu.` }); return true; }
    try {
      await sock.groupParticipantsUpdate(from, [target], "demote");
      await safeSend(sock, from, { text: `✅ *+${target.split("@")[0]}* berhasil di-*DEMOTE!*`, mentions: [target] });
    } catch (e) { await safeSend(sock, from, { text: `❌ Gagal demote: ${e?.message}` }); }
    return true;
  }

  // .mute
  if (cmd === "mute") {
    try {
      await sock.groupSettingUpdate(from, "announcement");
      await safeSend(sock, from, { text: "🔇 Grup berhasil di-*MUTE!*\nHanya admin yang bisa kirim pesan." });
    } catch (e) { await safeSend(sock, from, { text: `❌ Gagal mute: ${e?.message}` }); }
    return true;
  }

  // .unmute
  if (cmd === "unmute") {
    try {
      await sock.groupSettingUpdate(from, "not_announcement");
      await safeSend(sock, from, { text: "🔊 Grup berhasil di-*UNMUTE!*\nSemua member bisa kirim pesan." });
    } catch (e) { await safeSend(sock, from, { text: `❌ Gagal unmute: ${e?.message}` }); }
    return true;
  }

  // .settitle
  if (cmd === "settitle") {
    if (!rest) { await safeSend(sock, from, { text: `❌ Masukkan nama baru.\nContoh: *${prefix}settitle FX Community*` }); return true; }
    try {
      await sock.groupUpdateSubject(from, rest);
      await safeSend(sock, from, { text: `✅ Nama grup diubah jadi *"${rest}"*` });
    } catch (e) { await safeSend(sock, from, { text: `❌ Gagal ganti nama: ${e?.message}` }); }
    return true;
  }

  // .setdesc
  if (cmd === "setdesc") {
    if (!rest) { await safeSend(sock, from, { text: `❌ Masukkan deskripsi baru.` }); return true; }
    try {
      await sock.groupUpdateDescription(from, rest);
      await safeSend(sock, from, { text: `✅ Deskripsi grup berhasil diubah!` });
    } catch (e) { await safeSend(sock, from, { text: `❌ Gagal ganti deskripsi: ${e?.message}` }); }
    return true;
  }

  // .antilink
  if (cmd === "antilink") {
    const val = args[1]?.toLowerCase();
    if (val !== "on" && val !== "off") { await safeSend(sock, from, { text: `❌ Gunakan: *${prefix}antilink on* atau *${prefix}antilink off*` }); return true; }
    const settings = readJSON(path.join(__dirname, "../data/groupSettings.json"), {});
    settings[from] = settings[from] || {};
    settings[from].antilink = val === "on";
    writeJSON(path.join(__dirname, "../data/groupSettings.json"), settings);
    await safeSend(sock, from, { text: `✅ Anti-link *${val.toUpperCase()}* untuk grup ini!` });
    return true;
  }

  // .antinsfw
  if (cmd === "antinsfw") {
    const val = args[1]?.toLowerCase();
    if (val !== "on" && val !== "off") { await safeSend(sock, from, { text: `❌ Gunakan: *${prefix}antinsfw on* atau *${prefix}antinsfw off*` }); return true; }
    const settings = readJSON(path.join(__dirname, "../data/groupSettings.json"), {});
    settings[from] = settings[from] || {};
    settings[from].antinsfw = val === "on";
    writeJSON(path.join(__dirname, "../data/groupSettings.json"), settings);
    await safeSend(sock, from, { text: `✅ Anti-NSFW *${val.toUpperCase()}* untuk grup ini!` });
    return true;
  }

  return false;
}

module.exports = { handleCommands };
