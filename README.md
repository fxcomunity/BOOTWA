# WA Moderation Bot (Railway)

## ✅ Fitur
- Deteksi link non-resmi (selain link grup resmi)
- Deteksi konten vulgar/ilegal berdasarkan banwords.json
- Deteksi media/stiker vulgar dari caption/metadata
- Notifikasi ke admin via DM + tombol YA/TIDAK
  - YA = kick pelanggar
  - TIDAK = abaikan
- Auto close grup WIB jam 22:00 WIB
- Grup WITA/WIT: reminder jam 22 lokal + tombol tutup YA/TIDAK

## ✅ Deploy Railway
1) Upload project ini ke GitHub
2) Railway → New Project → Deploy from GitHub
3) Buat Volume supaya session WA tidak hilang:
   - Railway → Settings → Volumes → Add Volume
   - Mount path: /app/auth
4) Jalankan (Railway auto run npm install & npm start)
5) Buka logs → scan QR pertama kali
6) Pastikan bot dijadikan admin grup agar bisa kick / tutup grup

## ✅ Endpoint Health
- GET / => OK
- GET /health => JSON
