const L = require('./_lib');
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();
  const u = L.getUser(req); if (!u) return res.status(401).json({ ok: false, reason: 'signin' });
  const b = await L.body(req), ip = L.clientIp(req), day = L.dayKey();
  if (!b.token) {
    const ips = await L.getJson('cfg:ips', []);
    if (!L.ipAllowed(ip, ips)) return res.status(403).json({ ok: false, reason: 'network' });
  }
  const existing = await L.r('HGET', 'att:' + day, u.e);
  if (existing) return res.json({ ok: true, already: true, ts: JSON.parse(existing).ts });
  const fk = 'fail:' + u.e + ':' + Math.floor(Date.now() / 60000);
  if (+(await L.r('GET', fk)) >= 6) return res.status(429).json({ ok: false, reason: 'slow' });
  const good = b.token ? L.validToken(b.token) : b.words ? L.validWords(b.words) : false;
  if (!good) { await L.r('INCR', fk); await L.r('EXPIRE', fk, 90);
    return res.status(400).json({ ok: false, reason: b.token ? 'expired' : 'wrong' }); }
  const flags = [];
  const did = L.parseCookies(req).did || L.crypto.randomBytes(12).toString('hex');
  L.setCookie(res, 'did', did, 60 * 60 * 24 * 365);
  const owner = await L.r('GET', `dev:${day}:${did}`);
  if (owner && owner !== u.e) flags.push('same device as ' + owner); else await L.r('SET', `dev:${day}:${did}`, u.e, 'EX', 86400);
  if (b.pasteAttempts) flags.push('paste attempts: ' + b.pasteAttempts);
  if (b.hidden > 2) flags.push('tab switched ' + b.hidden + 'x');
  if (b.words && b.keys !== undefined && b.chars > b.keys + 2) flags.push('words not typed by keyboard');
  const rec = { name: u.n, ts: Date.now(), ip, method: b.token ? 'qr' : 'words', flags };
  await L.r('HSET', 'att:' + day, u.e, JSON.stringify(rec));
  await L.r('HSET', 'names', u.e, u.n);
  res.json({ ok: true, ts: rec.ts });
};
