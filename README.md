# WhatsApp Moderation Bot (Node.js + Baileys) — Render Ready ✅

Bot ini mendeteksi pelanggaran (link non-resmi / link vulgar / media vulgar) lalu **mengirim DM ke admin** dengan **2 tombol**:

- ✅ **YA (KICK)** → bot kick pelanggar dari grup
- ❌ **TIDAK (ABAIKAN)** → bot abaikan kasus

Tambahan: **tutup grup otomatis untuk grup WIB jam 22:00 WIB**, dan untuk grup WITA/WIT bot hanya **kirim reminder jam 22:00 waktu setempat** (admin bisa pilih tutup/tidak).

> **Catatan**: Bot harus jadi **admin grup** agar bisa kick / menutup grup (set `announcement`).

---

## ✅ Fitur Utama

- Deteksi link non-resmi (selain invite yang diizinkan)
- Deteksi kata/link blacklist (banwords)
- Deteksi media/stiker dengan caption/filename blacklist
- DM admin dengan panel & tombol `YA (KICK)` / `TIDAK (ABAIKAN)`
- Case ID + expired otomatis
- Counter pelanggaran per grup (3 kali/10 menit → DM risk alert)
- Jadwal:
  - Grup `WIB` → auto close jam **22:00 WIB**
  - Grup `WITA/WIT` → reminder jam **22:00** setempat + tombol tutup (manual)
  - Reminder pra-22:00 (default 15 menit sebelum)

---

## 📁 Struktur

```
wa-moderation-bot/
├── index.js
├── package.json
├── README.md
├── config.json
├── data/
│   ├── banwords.json
│   ├── groupCounters.json
│   ├── cases.json
│   ├── groupSettings.json
├── lib/
│   ├── actionHandler.js
│   ├── caseManager.js
│   ├── groupCloser.js
│   ├── helpers.js
│   ├── moderation.js
│   ├── scheduler.js
│   ├── storage.js
│   ├── uiPanel.js
└── auth/ (akan terisi setelah QR scan)
```

---

## 🚀 Jalankan Lokal (Scan QR Sekali)

1) Install:
```bash
npm install
```

2) Run:
```bash
npm start
```

3) Scan QR dari console.

Setelah sukses login, folder `auth/` terisi. **Jangan hapus** folder ini.

---

## 🌐 Deploy ke Render (Gratis)

### 1) Upload proyek ke GitHub
- Buat repo baru
- Upload semua file proyek ini
- **Pastikan folder `auth/` juga ikut di-upload setelah kamu scan QR lokal** agar Render tidak meminta QR ulang.

### 2) Buat Web Service di Render
- Dashboard Render → **New +** → **Web Service**
- Connect repo GitHub kamu
- Setting:
  - **Build Command**: `npm install`
  - **Start Command**: `npm start`
  - **Instance**: Free

Render akan build dan menjalankan service.

### 3) Supaya tidak sleep (Free tier)
Buat monitor ping dengan UptimeRobot:
- Add monitor HTTP(s)
- Ping URL Render kamu setiap 5 menit
- Bot ini sudah punya endpoint `/` untuk ping.

---

## ⚙️ Command Admin

- `!help`
- `!addword <kata>`
- `!removeword <kata>`
- `!listwords`
- `!resetcounter`
- `!settimezone WIB|WITA|WIT`
- `!groupstatus`

> Timezone per grup disimpan di `data/groupSettings.json`

---

## 🧪 Test Cepat

- Kirim link selain allowed invite → admin dapat panel
- Klik ✅ YA (KICK) → user langsung di-remove (bot harus admin)
- Klik ❌ TIDAK (ABAIKAN) → selesai
- Ubah timezone grup: `!settimezone WITA`

---

## 🛟 Troubleshooting

- **Kick gagal**: pastikan bot jadi admin grup
- **Render sleep**: aktifkan ping (UptimeRobot)
- **QR diminta terus**: pastikan `auth/` tersimpan dan ikut deploy

---

Selamat! 🔥
