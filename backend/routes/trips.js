const router = require('express').Router();
const db = require('../supabase').adminClient;
const requireAuth = require('../middleware/auth');
router.use(requireAuth);
const isoDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s;
const text = (s, max) => typeof s === 'string' && s.trim().length > 0 && s.trim().length <= max;
const idOK = id => /^\d+$/.test(String(id)) && Number.isSafeInteger(Number(id)) && Number(id) > 0;
const fail = (res, error, code = 400) => res.status(code).json({ error });
async function tripForUser(req, res) {
  if (!idOK(req.params.tripId || req.params.id)) { fail(res, 'Invalid trip ID.'); return null; }
  const id = req.params.tripId || req.params.id;
  const { data, error } = await db.from('trips').select('*').eq('id', id).eq('user_id', req.user.id).maybeSingle();
  if (error) throw error;
  if (!data) { fail(res, 'Trip not found.', 404); return null; }
  return data;
}
function validateTrip(body) {
  if (!text(body.title, 100) || !text(body.destination, 100) || !isoDate(body.start_date) || !isoDate(body.end_date) || body.end_date < body.start_date || (Date.parse(body.end_date) - Date.parse(body.start_date)) / 86400000 > 60)
    return 'Enter a title, destination and valid date range (maximum 61 days).';
  if (body.notes !== undefined && (typeof body.notes !== 'string' || body.notes.length > 1000)) return 'Notes must have at most 1000 characters.';
  return null;
}
router.get('/', async (req, res, next) => {
  try {
    const { data, error } = await db.from('trips').select('id,title,destination,start_date,end_date,notes,created_at').eq('user_id', req.user.id).order('start_date', { ascending: true });
    if (error) throw error;
    res.json({ trips: data });
  } catch (e) { next(e); }
});
router.post('/', async (req, res, next) => {
  try {
    const body = req.body || {}; const errorMessage = validateTrip(body);
    if (errorMessage) return fail(res, errorMessage);
    const { data, error } = await db.from('trips').insert({ user_id: req.user.id, title: body.title.trim(), destination: body.destination.trim(), start_date: body.start_date, end_date: body.end_date, notes: (body.notes || '').trim() }).select().single();
    if (error) throw error;
    res.status(201).json({ trip: data });
  } catch (e) { next(e); }
});
router.get('/:id', async (req, res, next) => {
  try {
    const trip = await tripForUser(req, res); if (!trip) return;
    const { data, error } = await db.from('activities').select('*').eq('trip_id', trip.id).order('activity_date').order('start_time').order('id');
    if (error) throw error;
    res.json({ trip, activities: data });
  } catch (e) { next(e); }
});
router.put('/:id', async (req, res, next) => {
  try {
    const trip = await tripForUser(req, res); if (!trip) return;
    const body = req.body || {}, message = validateTrip(body);
    if (message) return fail(res, message);
    // Existing activities must fit the edited date range; no silent deletion.
    const { count, error: countError } = await db.from('activities').select('*', { count: 'exact', head: true }).eq('trip_id', trip.id).or(`activity_date.lt.${body.start_date},activity_date.gt.${body.end_date}`);
    if (countError) throw countError;
    if (count) return fail(res, 'Move or delete activities outside the new dates first.', 409);
    const { data, error } = await db.from('trips').update({ title: body.title.trim(), destination: body.destination.trim(), start_date: body.start_date, end_date: body.end_date, notes: (body.notes || '').trim() }).eq('id', trip.id).eq('user_id', req.user.id).select().single();
    if (error) throw error;
    res.json({ trip: data });
  } catch (e) { next(e); }
});
router.delete('/:id', async (req, res, next) => {
  try {
    const trip = await tripForUser(req, res); if (!trip) return;
    const { error } = await db.from('trips').delete().eq('id', trip.id).eq('user_id', req.user.id);
    if (error) throw error;
    res.json({ message: 'Trip and its activities deleted.' });
  } catch (e) { next(e); }
});
function validateActivity(body, trip) {
  if (!text(body.title, 120) || !isoDate(body.activity_date) || body.activity_date < trip.start_date || body.activity_date > trip.end_date) return 'Enter a title and a date within this trip.';
  if (body.start_time !== undefined && body.start_time !== null && body.start_time !== '' && !/^([01]\d|2[0-3]):[0-5]\d$/.test(body.start_time)) return 'Invalid time.';
  if (body.location !== undefined && (typeof body.location !== 'string' || body.location.length > 150)) return 'Location too long.';
  if (body.notes !== undefined && (typeof body.notes !== 'string' || body.notes.length > 1000)) return 'Notes too long.';
  if (typeof body.cost !== 'number' || !Number.isFinite(body.cost) || body.cost < 0 || body.cost > 10000000 || Math.round(body.cost * 100) !== body.cost * 100) return 'Cost must be between 0 and 10,000,000 with up to two decimals.';
  return null;
}
function activityFields(body) { return { title: body.title.trim(), activity_date: body.activity_date, start_time: body.start_time || null, location: (body.location || '').trim(), notes: (body.notes || '').trim(), cost: body.cost }; }
router.post('/:tripId/activities', async (req, res, next) => {
  try {
    const trip = await tripForUser(req, res); if (!trip) return;
    const msg = validateActivity(req.body || {}, trip); if (msg) return fail(res, msg);
    const { data, error } = await db.from('activities').insert({ trip_id: trip.id, ...activityFields(req.body) }).select().single();
    if (error) throw error;
    res.status(201).json({ activity: data });
  } catch (e) { next(e); }
});
router.put('/:tripId/activities/:activityId', async (req, res, next) => {
  try {
    const trip = await tripForUser(req, res); if (!trip) return;
    if (!idOK(req.params.activityId)) return fail(res, 'Invalid activity ID.');
    const msg = validateActivity(req.body || {}, trip); if (msg) return fail(res, msg);
    const { data, error } = await db.from('activities').update(activityFields(req.body)).eq('id', req.params.activityId).eq('trip_id', trip.id).select().maybeSingle();
    if (error) throw error;
    if (!data) return fail(res, 'Activity not found.', 404);
    res.json({ activity: data });
  } catch (e) { next(e); }
});
router.delete('/:tripId/activities/:activityId', async (req, res, next) => {
  try {
    const trip = await tripForUser(req, res); if (!trip) return;
    if (!idOK(req.params.activityId)) return fail(res, 'Invalid activity ID.');
    const { data, error } = await db.from('activities').delete().eq('id', req.params.activityId).eq('trip_id', trip.id).select('id').maybeSingle();
    if (error) throw error;
    if (!data) return fail(res, 'Activity not found.', 404);
    res.json({ message: 'Activity deleted.' });
  } catch (e) { next(e); }
});
module.exports = router;
