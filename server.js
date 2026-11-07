const express = require('express');
const path = require('path');
const app = express();

const missing = ['PUBLIC_URL', 'MS_CLIENT_ID', 'MS_CLIENT_SECRET', 'MS_TENANT', 'MASTER_SECRET', 'ADMIN_EMAILS'].filter((k) => !process.env[k]);
if (missing.length) console.error('\n*** Missing settings: ' + missing.join(', ') + '. Sign-in will not work until they are set. ***\n');

// How many reverse proxies sit in front of this app (Caddy/nginx/Cloudflare tunnel = 1).
// Needed so the IP allowlist sees the student's real IP, not the proxy's.
const tp = process.env.TRUST_PROXY ?? '1';
app.set('trust proxy', /^\d+$/.test(tp) ? +tp : tp === 'true' ? true : tp === 'false' ? false : tp);
app.disable('x-powered-by');
app.use(express.json({ limit: '50kb' }));
app.use((req, res, next) => {
  res.set({ 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'same-origin', 'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff', 'Permissions-Policy': 'camera=(self)' });
  next();
});

const wrap = (f) => (req, res, next) => Promise.resolve(f(req, res)).catch(next);
const routes = { '/api/auth/login': 'auth/login', '/api/auth/callback': 'auth/callback', '/api/me': 'me',
  '/api/logout': 'logout', '/api/checkin': 'checkin', '/api/master': 'master', '/api/admin': 'admin' };
for (const [url, file] of Object.entries(routes)) app.all(url, wrap(require('./api/' + file)));

const pub = path.join(__dirname, 'public');
app.get('/s', (req, res) => res.sendFile(path.join(pub, 'index.html')));
app.use(express.static(pub, { extensions: ['html'] }));
app.get('/health', (req, res) => res.send('ok'));
app.use((err, req, res, next) => { console.error(err); res.status(500).json({ error: 'server' }); });

const port = process.env.PORT || 3000;
app.listen(port, () => console.log('Attendance running on :' + port));
