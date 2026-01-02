# WA Moderation Bot (Railway)

## ✅ Deploy Railway
1) Upload project ini ke GitHub
2) Railway → New Project → Deploy from GitHub
3) Add Volume supaya session tidak hilang:
   - Railway → Settings → Volumes → Add Volume
   - Mount path: /app/auth
4) Deploy dan scan QR pertama kali di logs
5) Bot harus admin grup untuk kick & tutup grup

## ✅ Endpoint
- GET / => OK
- GET /health => JSON
