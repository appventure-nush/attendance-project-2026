const L = require('./_lib');
const validDay = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d || ''));
const csvCell = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) || /^[=+\-@]/.test(s) ? '"' + s.replace(/"/g, '""').replace(/^([=+\-@])/, "'$1") + '"' : s; };

module.exports = async (req, res) => {
  const u = L.getUser(req); if (!(await L.isAdmin(u))) return res.status(401).json({ error: 'auth' });

  if (req.method === 'POST') {
    const b = await L.body(req);
    const clean = (a) => [...new Set((a || []).map((s) => String(s).trim().toLowerCase()).filter(Boolean))];
    if (b.action === 'delete' || b.action === 'mark') {
      const email = String(b.email || '').trim().toLowerCase();
      const day = validDay(b.date) ? b.date : L.dayKey();
      if (!email) return res.status(400).json({ error: 'email' });
      if (b.action === 'delete') { await L.r('HDEL', 'att:' + day, email); return res.json({ ok: true }); }
      if (await L.r('HGET', 'att:' + day, email)) return res.json({ ok: true, already: true });
      const name = (await L.r('HGET', 'names', email)) || L.fallbackName(email);
      await L.r('HSET', 'att:' + day, email, JSON.stringify({ name, ts: Date.now(), ip: '', method: 'manual', flags: ['marked by ' + u.e] }));
      return res.json({ ok: true });
    }
    if (b.students) await L.r('SET', 'cfg:students', JSON.stringify(clean(b.students)));
    if (b.ips) await L.r('SET', 'cfg:ips', JSON.stringify(clean(b.ips)));
    if (b.exco) await L.r('SET', 'cfg:exco', JSON.stringify(clean(b.exco).filter((e) => e.includes('@'))));
    return res.json({ ok: true });
  }

  const day = validDay(req.query.date) ? req.query.date : L.dayKey();
  const list = await L.roster(day);

  if (req.query.format === 'csv') {
    const rows = [['Date', 'Name', 'Email', 'Status', 'Time', 'Method', 'On expected list', 'IP', 'Flags']];
    const fmt = (ts) => ts ? new Date(ts).toLocaleTimeString('en-GB', { timeZone: process.env.TZ_NAME || 'Asia/Singapore' }) : '';
    for (const s of list) rows.push([day, s.name, s.email, s.present ? 'Present' : 'Absent', fmt(s.ts), s.method || '', s.expected ? 'Yes' : 'No', s.ip || '', (s.flags || []).join('; ')]);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="attendance-${day}.csv"`);
    return res.send('﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n'));
  }

  res.json({
    day, today: L.dayKey(), roster: list,
    students: await L.getJson('cfg:students', []), exco: await L.getJson('cfg:exco', []), owners: L.owners(), me: u.e, ips: await L.getJson('cfg:ips', []), myIp: L.clientIp(req),
  });
};
