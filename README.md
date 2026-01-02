# 🤖 WA Moderation Bot (Baileys) — Anti Spam & Anti Jomok 🔥

Bot WhatsApp moderasi grup pake **Node.js + Baileys (@whiskeysockets/baileys)**.  
Fokusnya: **ngusir spam link, konten ilegal, dan stiker/media jomok** tapi tetap aman biar akun WA bot gak gampang kena **"account limited"**.

> Admin dapet notif via DM + tombol **YA / TIDAK** buat kick pelanggar.

---

## ✨ Fitur Utama (V1 / Current)

✅ Deteksi **link vulgar/porn/ilegal** → dianggap pelanggaran  
✅ Deteksi **link selain link resmi grup** → pelanggaran  
✅ Deteksi **media/stiker jomok** (berdasarkan keyword + caption)  
✅ **Kata kasar/makian biasa diabaikan** (gak dihitung pelanggaran)

✅ Auto delete pesan pelanggaran (kalau bot admin grup)  
✅ Notif pelanggaran dikirim ke **admin via DM** (bukan ke grup biar gak rame)  
✅ Admin dapat panel:
- ✅ YA = Kick pelanggar
- ❌ TIDAK = Abaikan

✅ Sistem **CASE** (biar tombol kick tetap valid walau banyak notif)  
✅ Sistem **QUEUE** (notif masuk antrian + delay random biar gak dianggap spam)  
✅ Sistem **THROTTLE** per grup (default 20 detik) → aman dari limit  
✅ Risk alert kalau pelanggaran cepat sampai 3x / 10 menit

✅ QR bisa dibuka dari endpoint:
- `/qr-view` → tampilan bagus buat scan
- `/qr` → download QR PNG HD
- `/qr-text` → QR string

✅ Log kick ke grup admin khusus (pakai `.setlog`)  
✅ Optional: announce kick di grup + mention pelanggar

---

## ⚙️ Konfigurasi (`config.json`)

Buat file `config.json` di root project:

```json
{
  "allowedGroupLink": "https://chat.whatsapp.com/KnkESJgEUKT5PEki4SpDD0",
  "admins": [
    "62895404147521@s.whatsapp.net",
    "6281237381918@s.whatsapp.net",
    "6285889200041@s.whatsapp.net",
    "601129323365@s.whatsapp.net",
    "6285701449359@s.whatsapp.net"
  ],
  "defaultTimezone": "WIB",
  "closeHourWIB": 22,
  "caseExpireMinutes": 10,
  "violationWindowMinutes": 10,
  "riskAlertThreshold": 3,

  "adminLogGroupId": "",
  "kickAnnounceInGroup": true,
  "autoDeleteViolationMessage": true
}
