# Robotics Club Attendance

Rotating QR + 2-letter code check-in with Microsoft (Azure AD / Entra ID) sign-in.

## Pages
- `/` students. Phones scan the QR (changes every 8s); laptops sign in and type the 3 words (change every 4s, set with `WORDS_SECONDS`).
- `/master` projector screen (admins only): QR, 3 words, and every expected student in green (checked in) or red (not yet).
- `/admin` who is absent, check-in times, delete entries, mark present, CSV export, expected students, approved IPs.

## Run
1. Copy `.env.example` to `.env` and fill it in (`.env` is never committed).
2. `docker compose up -d --build`
3. Put HTTPS in front of port 3000 (Caddy, nginx, or a Cloudflare tunnel). Phones need HTTPS for the camera, and Microsoft requires it for redirect URIs.

## Azure AD app registration
- Platform: **Web** (not SPA)
- Redirect URI: `<PUBLIC_URL>/api/auth/callback`
- For local testing you can also add `http://localhost:3000/api/auth/callback`
