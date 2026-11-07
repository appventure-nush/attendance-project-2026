const { crypto, setCookie, BASE } = require('../_lib');
module.exports = (req, res) => {
  const missing = ['MS_CLIENT_ID', 'MS_CLIENT_SECRET', 'PUBLIC_URL'].filter((k) => !process.env[k]);
  if (missing.length) return res.status(500).type('text').send(
    'Sign-in is not set up yet. The server is missing: ' + missing.join(', ') + '.\nWhoever runs the server needs to set these environment variables.');
  const state = crypto.randomBytes(16).toString('hex');
  const ret = String(req.query.return || '/');
  setCookie(res, 'oas', state + '|' + (ret.startsWith('/') && !ret.startsWith('//') ? ret : '/'), 600);
  const p = new URLSearchParams({
    client_id: process.env.MS_CLIENT_ID, response_type: 'code', scope: 'openid profile email',
    redirect_uri: `${BASE()}/api/auth/callback`, state, prompt: 'select_account',
    response_mode: 'query' });
  res.redirect(302, `https://login.microsoftonline.com/${process.env.MS_TENANT || 'organizations'}/oauth2/v2.0/authorize?${p}`);
};
