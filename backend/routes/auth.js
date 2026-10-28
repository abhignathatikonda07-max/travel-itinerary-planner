const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const { publicClient } = require('../supabase');
const requireAuth = require('../middleware/auth');
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Too many attempts. Try again later.' } });
const validEmail = s => typeof s === 'string' && s.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
router.post('/register', limiter, async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    if (!validEmail(email) || typeof password !== 'string' || password.length < 8 || password.length > 72)
      return res.status(400).json({ error: 'Enter a valid email and a password of 8–72 characters.' });
    const { data, error } = await publicClient.auth.signUp({ email: email.trim().toLowerCase(), password });
    if (error) return res.status(400).json({ error: 'Could not register. Check your details or try logging in.' });
    res.status(201).json({ message: data.session ? 'Registered and logged in.' : 'Registered. Confirm your email if confirmation is enabled, then log in.', session: data.session ? { access_token: data.session.access_token } : null });
  } catch (e) { next(e); }
});
router.post('/login', limiter, async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    if (!validEmail(email) || typeof password !== 'string') return res.status(400).json({ error: 'Enter email and password.' });
    const { data, error } = await publicClient.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    if (error || !data.session) return res.status(401).json({ error: 'Invalid credentials or unconfirmed email.' });
    res.json({ access_token: data.session.access_token, email: data.user.email });
  } catch (e) { next(e); }
});
router.get('/me', requireAuth, (req, res) => res.json({ id: req.user.id, email: req.user.email }));
module.exports = router;
