# 🤖 WA Moderation Bot (Baileys) — Anti Spam & Anti Jomok 🔥

Bot WhatsApp moderasi grup pake **Node.js + Baileys (@whiskeysockets/baileys)**.  
Fokusnya: **ngusir spam link, konten ilegal, dan stiker/media jomok**, tapi tetap aman biar akun bot gak gampang kena **"account limited"**.

> Admin akan dapet notif via DM + tombol **YA / TIDAK** buat kick pelanggar.

---

## ✅ Versi & Perbandingan

### 🟢 V1 (Basic / Versi Awal)
- Deteksi link & banned words
- Notif pelanggaran dikirim ke admin
- Admin kick manual (tanpa tombol / tanpa case)
- QR cuma muncul di terminal
❌ Belum ada queue / throttle / auto delete / log group / command admin

---

### 🔥 V2 (Current Stable / Versi Sekarang ✅)
✅ Deteksi link jorok & link selain allowed  
✅ Deteksi media/stiker jomok (pakai keyword + caption)  
✅ Panel notif cantik + tombol:
- ✅ YA (Kick)
- ❌ TIDAK (Abaikan)

✅ Admin klik YA → bot kick otomatis  
✅ Case system (tombol tetap valid walau notif banyak)  
✅ Queue system (delay random 3–8 detik)  
✅ Throttle per grup (default 20 detik) → anti spam notif  
✅ Auto delete pesan pelanggaran (kalau bot admin grup)  
✅ Kick log ke grup admin khusus (`.setlog`)  
✅ Optional announce kick di grup + mention

✅ Command admin (di grup):
- `.id`
- `.jid`
- `.setlog`
- `.getlog`

---

### 🚀 V3 (Next Planned / Rencana Upgrade)
✅ Deteksi stiker jomok beneran via API vision (tanpa caption)  
✅ Smart throttle summary (spam diringkas jadi 1 notif)  
✅ Blacklist user (`.ban / .unban / .banlist`)  
✅ Dashboard `/dashboard` buat status bot + log + queue  
✅ Mode moderasi: manual / semi-auto / full-auto (optional)

---

## ✨ Fitur Utama Bot (V2)

✅ Deteksi:
- link vulgar/porn/ilegal
- link selain link resmi grup
- media/stiker jomok (caption/keyword)

✅ Yang *tidak dianggap pelanggaran*:
- kata kasar/makian biasa (diabaikan)

✅ Auto delete pesan pelanggaran (kalau bot admin)  
✅ DM notif ke admin (1 pelanggaran → 1 admin aja biar gak spam)  
✅ Admin klik YA → kick otomatis  
✅ Risk alert kalau pelanggaran 3x dalam 10 menit  
✅ QR endpoint:
- `/qr-view` (paling enak)
- `/qr` (PNG HD)
- `/qr-text` (QR string)

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
