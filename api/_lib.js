const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const WORDS = require('./words');

const SECRET = () => process.env.MASTER_SECRET || 'dev-secret-change-me';
const hmac = (s) => crypto.createHmac('sha256', SECRET()).update(s).digest();

let r;
if (process.env.REDIS_URL) {
  const { createClient } = require('redis');
  const client = createClient({ url: process.env.REDIS_URL });
  client.on('error', (e) => console.error('redis', e.message));
  const ready = client.connect();
  r = async (...cmd) => { await ready; return client.sendCommand(cmd.map(String)); };
  console.log('Storage: Redis at ' + process.env.REDIS_URL.replace(/\/\/[^@]*@/, '//***@'));
} else {
  const DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
  const FILE = path.join(DIR, 'store.json');
  let mem = {};
  fs.mkdirSync(DIR, { recursive: true });
  try { mem = JSON.parse(fs.readFileSync(FILE, 'utf8')); }
  catch (e) { if (e.code !== 'ENOENT') { console.error('Could not read ' + FILE + ': ' + e.message); process.exit(1); } }
  const sweep = () => { const now = Date.now(); for (const k in mem) if (mem[k].x && mem[k].x < now) delete mem[k]; };
  const writeNow = () => { sweep(); const tmp = FILE + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(mem)); fs.renameSync(tmp, FILE); };
  let timer = null;
  const save = () => { if (!timer) timer = setTimeout(() => { timer = null;
    try { writeNow(); } catch (e) { console.error('Could not save ' + FILE + ': ' + e.message); } }, 200); };
  const flush = () => { if (timer) { clearTimeout(timer); timer = null; } try { writeNow(); } catch (e) { console.error(e.message); } };
  for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => { flush(); process.exit(0); });
  try { writeNow(); } catch (e) { console.error('Data folder is not writable: ' + DIR + ' (' + e.message + ')'); process.exit(1); }
  console.log('Storage: file at ' + FILE);
  const live = (k) => { const e = mem[k]; if (!e) return null; if (e.x && e.x < Date.now()) { delete mem[k]; return null; } return e; };
  r = async (cmd, ...a) => {
    a = a.map(String);
    switch (String(cmd).toUpperCase()) {
      case 'GET': { const e = live(a[0]); return e ? e.v : null; }
      case 'SET': { mem[a[0]] = { v: a[1], x: (a[2] || '').toUpperCase() === 'EX' ? Date.now() + a[3] * 1000 : 0 }; save(); return 'OK'; }
      case 'INCR': { const e = live(a[0]); const n = (e ? +e.v : 0) + 1; mem[a[0]] = { v: String(n), x: e ? e.x : 0 }; save(); return n; }
      case 'EXPIRE': { const e = live(a[0]); if (!e) return 0; e.x = Date.now() + a[1] * 1000; save(); return 1; }
      case 'HGET': { const e = live(a[0]); return e && Object.hasOwn(e.v, a[1]) ? e.v[a[1]] : null; }
      case 'HSET': { const e = live(a[0]) || (mem[a[0]] = { v: {}, x: 0 }); let n = 0;
        for (let i = 1; i < a.length; i += 2) { if (!Object.hasOwn(e.v, a[i])) n++; e.v[a[i]] = a[i + 1]; } save(); return n; }
      case 'HDEL': { const e = live(a[0]); if (!e) return 0; let n = 0;
        for (const f of a.slice(1)) if (Object.hasOwn(e.v, f)) { delete e.v[f]; n++; } save(); return n; }
      case 'HGETALL': { const e = live(a[0]); return e ? Object.entries(e.v).flat() : []; }
      default: throw new Error('Unsupported storage command ' + cmd);
    }
  };
}

const BASE = () => (process.env.PUBLIC_URL || 'http://localhost:3000').trim().replace(/^["']|["']$/g, '').replace(/\/$/, '');
const SITE = () => BASE().replace(/^https?:\/\//, '');

const W_QR = 8000;
const W_WORDS = Math.max(2, Math.min(60, +process.env.WORDS_SECONDS || 4)) * 1000;
const winQ = (now = Date.now()) => Math.floor(now / W_QR);
const winW = (now = Date.now()) => Math.floor(now / W_WORDS);
function qrToken(w) { return hmac('q' + w).toString('hex').slice(0, 10); }
function words(w) {
  const b = hmac('w' + w), out = [];
  for (let i = 0; out.length < 3; i++) {
    const word = WORDS[(b.readUInt16BE((i * 2) % 30) + Math.floor(i / 15)) % WORDS.length];
    if (!out.includes(word)) out.push(word);
  }
  return out;
}
const norm = (s) => String(s).toLowerCase().replace(/[^a-z]+/g, ' ').trim();
function validToken(t, now = Date.now()) { const w = winQ(now); return [w, w - 1].some((x) => qrToken(x) === String(t)); }
function validWords(s, now = Date.now()) { const w = winW(now), g = norm(s); return [w, w - 1].some((x) => words(x).join(' ') === g); }

function parseCookies(req) {
  return Object.fromEntries((req.headers.cookie || '').split(';').filter(Boolean).map((c) => {
    const i = c.indexOf('='); return [c.slice(0, i).trim(), decodeURIComponent(c.slice(i + 1))];
  }));
}
function setCookie(res, name, val, maxAge = 60 * 60 * 24 * 180) {
  const c = `${name}=${encodeURIComponent(val)}; Path=/; HttpOnly;${BASE().startsWith('https') ? ' Secure;' : ''} SameSite=Lax; Max-Age=${maxAge}`;
  const prev = res.getHeader('Set-Cookie') || [];
  res.setHeader('Set-Cookie', [].concat(prev, c));
}
function sign(obj) {
  const p = Buffer.from(JSON.stringify(obj)).toString('base64url');
  return p + '.' + hmac('s' + p).toString('base64url');
}
function unsign(s) {
  if (!s) return null; const [p, m] = s.split('.');
  if (!p || !m) return null;
  const good = hmac('s' + p).toString('base64url');
  if (m.length !== good.length || !crypto.timingSafeEqual(Buffer.from(m), Buffer.from(good))) return null;
  try { const o = JSON.parse(Buffer.from(p, 'base64url').toString()); return o.exp > Date.now() ? o : null; } catch { return null; }
}
const getUser = (req) => unsign(parseCookies(req).sess);
const isAdmin = (u) => !!u && (process.env.ADMIN_EMAILS || '').toLowerCase().split(',').map((s) => s.trim()).includes(u.e);

const clientIp = (req) => String(req.ip || '').replace(/^::ffff:/, '');
const ip2n = (ip) => ip.split('.').reduce((a, o) => (a << 8) + (+o), 0) >>> 0;
function ipAllowed(ip, list) {
  if (!list.length) return true;
  return list.some((e) => {
    if (e === ip) return true;
    const m = e.match(/^(\d+\.\d+\.\d+\.\d+)\/(\d+)$/);
    if (!m || !/^\d+\.\d+\.\d+\.\d+$/.test(ip)) return false;
    const mask = m[2] === '0' ? 0 : (~0 << (32 - +m[2])) >>> 0;
    return (ip2n(ip) & mask) === (ip2n(m[1]) & mask);
  });
}

const dayKey = (d = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: process.env.TZ_NAME || 'Asia/Singapore' }).format(d);
const getJson = async (k, def) => { const v = await r('GET', k); return v ? JSON.parse(v) : def; };
const body = async (req) => (typeof req.body === 'object' && req.body) || JSON.parse(req.body || '{}');
const hashToObj = (a) => { const o = {}; for (let i = 0; i < (a || []).length; i += 2) o[a[i]] = a[i + 1]; return o; };
const fallbackName = (email) => email.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

async function roster(day) {
  const att = hashToObj(await r('HGETALL', 'att:' + day));
  const names = hashToObj(await r('HGETALL', 'names'));
  const expected = await getJson('cfg:students', []);
  const list = [], seen = new Set();
  for (const email of expected) {
    seen.add(email);
    const rec = att[email] ? JSON.parse(att[email]) : null;
    list.push({ email, name: (rec && rec.name) || names[email] || fallbackName(email), expected: true, present: !!rec, ...(rec ? { ts: rec.ts, method: rec.method, ip: rec.ip, flags: rec.flags || [] } : {}) });
  }
  for (const [email, v] of Object.entries(att)) {
    if (seen.has(email)) continue;
    const rec = JSON.parse(v);
    list.push({ email, name: rec.name || names[email] || fallbackName(email), expected: false, present: true, ts: rec.ts, method: rec.method, ip: rec.ip, flags: rec.flags || [] });
  }
  list.sort((a, b) => a.name.localeCompare(b.name));
  return list;
}

module.exports = { r, BASE, SITE, W_QR, W_WORDS, winQ, winW, qrToken, words, validToken, validWords, parseCookies, setCookie, sign, unsign,
  getUser, isAdmin, clientIp, ipAllowed, dayKey, getJson, body, roster, fallbackName, crypto };
