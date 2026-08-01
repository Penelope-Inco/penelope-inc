/**
 * /api/tour-request.js
 * POST https://penelope-inc.vercel.app/api/tour-request
 * Forwards PHI Lab tour waiting-room signups (join.html "Tour" panel).
 * Backend needs a matching POST /api/tour-request route — this is a NEW
 * endpoint not in the original pb_schema.json. Add a `tour_requests`
 * collection (full_name, email, interest_note, submitted_at) and wire
 * email notification the same way join-form-handler.js does.
 */

const PENELOPE_API_BASE = process.env.PENELOPE_API_BASE || 'http://46.62.217.83:3002';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const { full_name, email, interest_note } = req.body || {};

  if (!full_name || !email) {
    return res.status(400).json({ ok: false, error: 'Name and email are required.' });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const upstream = await fetch(`${PENELOPE_API_BASE}/api/tour-request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        full_name,
        email,
        interest_note: interest_note || '',
        submitted_at: new Date().toISOString()
      })
    });
    clearTimeout(timeout);

    if (!upstream.ok) {
      return res.status(200).json({ ok: false, error: 'Backend could not accept the signup right now.' });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    clearTimeout(timeout);
    return res.status(200).json({
      ok: false,
      error: err.name === 'AbortError' ? 'Request timed out.' : 'Server temporarily unreachable.'
    });
  }
}
