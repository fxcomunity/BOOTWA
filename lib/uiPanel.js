function safeText(v, fallback = "-") {
  if (v === undefined || v === null) return fallback;
  const s = String(v).trim();
  return s.length ? s : fallback;
}

function buildViolationPanel({
  groupName,
  violatorName,
  violatorPhone,
  violationType,
  evidence,
  timeStr
}) {
  const gName = safeText(groupName);
  const vName = safeText(violatorName, violatorPhone || "-");
  const vPhone = safeText(violatorPhone);
  const vType = safeText(violationType);
  const ev = safeText(evidence);
  const t = safeText(timeStr);

  return (
`🚨 *NOTIF PELANGGARAN*
━━━━━━━━━━━━━━━━━━
🏷️ *Grup*        : ${gName}
👤 *Pelanggar*   : ${vName}
📱 *Nomor*       : ${vPhone}
📌 *Pelanggaran* : ${vType}
🧾 *Bukti*       : ${ev}
🕒 *Waktu*       : ${t}
━━━━━━━━━━━━━━━━━━
⚙️ *Pilih tindakan:*
✅ YA  = Kick pelanggar
❌ TIDAK = Abaikan`
  );
}

function buildCloseReminderPanel({ groupName, timeStr, tzShort }) {
  const gName = safeText(groupName);
  const t = safeText(timeStr);
  const tz = safeText(tzShort);

  return (
`⏰ *REMINDER TUTUP GRUP*
━━━━━━━━━━━━━━━━━━
🏷️ *Grup*  : ${gName}
🕒 *Waktu* : ${t}
🧭 *Zona*  : ${tz}
━━━━━━━━━━━━━━━━━━
Mau tutup grup sekarang?
✅ YA  = Tutup grup
❌ TIDAK = Abaikan`
  );
}

module.exports = { buildViolationPanel, buildCloseReminderPanel };
