const { parseCookies, setCookie, sign, BASE, r } = require('../_lib');
module.exports = async (req, res) => {
  const [state, ret] = (parseCookies(req).oas || '|/').split('|');
  if (!req.query.code || req.query.state !== state) return res.status(400).send('Sign-in failed. Go back and try again.');
  const t = await fetch(`https://login.microsoftonline.com/${process.env.MS_TENANT || 'organizations'}/oauth2/v2.0/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: process.env.MS_CLIENT_ID, client_secret: process.env.MS_CLIENT_SECRET,
      grant_type: 'authorization_code', code: req.query.code, scope: 'openid profile email',
      redirect_uri: `${BASE()}/api/auth/callback` }) }).then((x) => x.json());
  if (!t.id_token) return res.status(401).send('Microsoft sign-in was rejected.');
  const c = JSON.parse(Buffer.from(t.id_token.split('.')[1], 'base64url').toString());
  const email = String(c.preferred_username || c.email || c.upn || '').toLowerCase();
  const dom = (process.env.ALLOWED_DOMAIN || '').toLowerCase();
  if (!email || (dom && !email.endsWith('@' + dom))) return res.status(403).send('Please use your school Microsoft account.');
  if (c.name) await r('HSET', 'names', email, c.name);
  setCookie(res, 'sess', sign({ e: email, n: c.name || email, exp: Date.now() + 1000 * 60 * 60 * 24 * 180 }));
  setCookie(res, 'oas', '', 0);
  res.redirect(302, ret || '/');
};
