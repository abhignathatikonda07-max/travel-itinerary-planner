require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const path = require('path');
require('./supabase'); // fail early when configuration is missing
const app = express();
app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'"], connectSrc: ["'self'"], imgSrc: ["'self'", 'data:'] } } }));
app.use(express.json({ limit: '32kb' }));
app.get('/api/health', (_req, res) => res.json({ status: 'ok', note: 'Server active; this does not verify remote database connectivity.' }));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/trips', require('./routes/trips'));
app.use('/api', (_req, res) => res.status(404).json({ error: 'API route not found.' }));
app.use(express.static(path.join(__dirname, '..', 'frontend')));
app.use((err, req, res, _next) => {
  console.error('Server error:', err.message);
  if (res.headersSent) return;
  res.status(err.status || 500).json({ error: err.type === 'entity.parse.failed' ? 'Invalid JSON.' : 'Something went wrong. Please try again.' });
});
const port = Number(process.env.PORT || 3000);
app.listen(port, () => console.log(`Travel Itinerary Planner: http://localhost:${port}`));
