# 🤖 WA Moderation Bot — Baileys (Railway / Terminal)  
Moderation bot WhatsApp grup menggunakan **Node.js + Baileys** dengan sistem notifikasi **langsung ke admin via DM**, dan admin bisa memilih **Kick / Abaikan** lewat tombol.

✅ Fokus: deteksi link ilegal/non-resmi, konten vulgar, stiker/media jomok (opsional)  
✅ Bot tidak melakukan tindakan otomatis tanpa persetujuan admin.

---

## ✨ Fitur Utama

### 🛡️ Moderasi Konten
- ✅ Deteksi **link non-resmi** (selain link grup yang diizinkan)
- ✅ Deteksi **kata terlarang** (porn/jomok/ilegal, bukan makian biasa)
- ✅ Deteksi **media/stiker** (caption / keyword)
- ✅ (Opsional) Deteksi stiker/media **jomok akurat** dengan **NSFWJS (gratis self-host)**

### 👮 Notifikasi Admin (DM Private)
- ✅ Alert dikirim **langsung ke admin** (bukan ke grup)
- Isi alert lengkap:
  - Nama grup
  - Nomor pelanggar
  - Jenis pelanggaran
  - Bukti (kata/link)
  - Waktu kejadian + zona waktu

### ✅ Tombol Pilihan Admin
Admin akan menerima tombol:
- ✅ **YA (KICK)** → bot kick pelanggar (bot harus admin grup)
- ❌ **TIDAK** → abaikan dan case ditutup

### 🔒 Tutup Grup Jam 22
- ✅ Auto close group jam **22:00 WIB** (announcement mode)
- ✅ Grup WITA/WIT jam 22 lokal → bot kirim reminder ke admin:
  - ✅ YA = tutup
  - ❌ TIDAK = abaikan

### 📊 Counter Pelanggaran
- ✅ Bot menyimpan pelanggaran per grup (default window: 10 menit)
- ✅ Jika pelanggaran banyak (default: 3x), bot kirim **RISK ALERT** ke admin:
  - Saran mute/tutup grup sementara

### 🔄 Stabil & Anti Crash
- ✅ Auto reconnect kalau koneksi terputus
- ✅ Error log lengkap biar gampang debugging
- ✅ Safe send agar bot tidak crash saat gagal kirim pesan

---

## ✅ QR Login yang Mudah (Gak Perlu Buka Logs)
QR bisa discan langsung via browser:

- `/qr-view` → halaman QR paling mudah discan
- `/qr` → QR dalam bentuk PNG (HD)
- `/qr-text` → QR string (backup)

---

## 🧠 (Opsional) NSFW Sticker Detector (Gratis)
Untuk deteksi stiker/media jomok **yang benar-benar akurat**, gunakan:
✅ **NSFWJS** (self-hosted, gratis selamanya)

Flow:
1) download sticker/image
2) convert webp → png
3) classify dengan nsfwjs
4) jika confidence Porn/Hentai/Sexy tinggi → notif admin + tombol Kick

> NOTE: fitur ini optional dan bisa menambah beba
