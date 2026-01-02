function buildViolationPanel({ groupName, violatorPhone, violationType, evidence, timeStr }) {
  return (
`🚨 *NOTIF PELANGGARAN*
━━━━━━━━━━━━━━━━━━
🏷️ Grup      : ${groupName}
👤 Pelanggar  : ${violatorPhone}
📌 Pelanggaran: ${violationType}
🧾 Bukti     : ${evidence}
🕒 Waktu     : ${timeStr}
━━━━━━━━━━━━━━━━━━
Pilih tindakan:
✅ YA = Kick pelanggar
❌ TIDAK = Abaikan`
  );
}

function buildCloseReminderPanel({ groupName, timeStr, tzShort }) {
  return (
`⏰ *REMINDER TUTUP GRUP*
━━━━━━━━━━━━━━━━━━
🏷️ Grup : ${groupName}
🕒 Waktu: ${timeStr}
Zona   : ${tzShort}
━━━━━━━━━━━━━━━━━━
Mau tutup grup sekarang?
✅ YA = Tutup grup
❌ TIDAK = Abaikan`
  );
}

module.exports = { buildViolationPanel, buildCloseReminderPanel };
