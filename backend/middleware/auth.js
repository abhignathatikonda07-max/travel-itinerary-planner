const { publicClient } = require('../supabase');
async function requireAuth(req, res, next) {
  const match = /^Bearer (\S+)$/.exec(req.get('authorization') || '');
  if (!match) return res.status(401).json({ error: 'Please log in.' });
  try {
    const { data, error } = await publicClient.auth.getUser(match[1]);
    if (error || !data.user) return res.status(401).json({ error: 'Session expired. Please log in again.' });
    req.user = data.user;
    next();
  } catch (err) { next(err); }
}
module.exports = requireAuth;
