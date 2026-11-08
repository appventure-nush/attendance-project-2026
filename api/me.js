const L = require('./_lib');
module.exports = async (req, res) => {
  const u = L.getUser(req);
  if (!u) return res.json({ email: null });
  const list = await L.getJson('cfg:students', []);
  res.json({ email: u.e, name: u.n, admin: await L.isAdmin(u), onList: !list.length || list.includes(u.e) });
};
