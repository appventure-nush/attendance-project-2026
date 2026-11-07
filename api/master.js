const L = require('./_lib');
module.exports = async (req, res) => {
  const u = L.getUser(req); if (!L.isAdmin(u)) return res.status(401).json({ error: 'auth' });
  const now = Date.now(), q = L.winQ(now), w = L.winW(now);
  const qr = (x) => ({ n: x, url: `${L.BASE()}/s?t=${L.qrToken(x)}` });
  const wd = (x) => ({ n: x, words: L.words(x) });
  const list = await L.roster(L.dayKey());
  res.json({
    now, site: L.SITE(),
    qr: { period: L.W_QR, cur: qr(q), next: qr(q + 1) },
    words: { period: L.W_WORDS, cur: wd(w), next: wd(w + 1) },
    roster: list.map((s) => ({ email: s.email, name: s.name, present: s.present, expected: s.expected, ts: s.ts || null })),
  });
};
