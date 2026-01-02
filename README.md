# WA Moderation Bot (Railway + QR Endpoint)

## Deploy Railway
1) Push project ke GitHub
2) Railway → Deploy from GitHub
3) Buat Volume:
   - mount: /app/auth
4) Deploy
5) Buka /qr-view untuk scan QR
6) Bot harus jadi admin grup untuk Kick & Tutup grup.

## Endpoints
- / => info
- /health => status
- /qr => QR png
- /qr-view => halaman QR bagus
- /qr-text => string QR
