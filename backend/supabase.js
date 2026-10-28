const { createClient } = require('@supabase/supabase-js');
const url = process.env.SUPABASE_URL;
const anon = process.env.SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anon || !service || url.includes('YOUR_PROJECT') || anon.startsWith('YOUR_') || service.startsWith('YOUR_')) {
  throw new Error('Configure SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY in backend/.env');
}
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const publicClient = createClient(url, anon, options);
// Privileged key stays inside backend. Routes MUST check the verified user and ownership.
const adminClient = createClient(url, service, options);
module.exports = { publicClient, adminClient };
