/**
 * /api/waitlist.js
 * POST https://penelope-inc.vercel.app/api/waitlist
 * Forwards Masterclass waiting-room signups to the Hetzner backend's
 * training_waitlist collection (already in pb_schema.json).
 * CONFIRM this endpoint exists on the backend — not in Kimi's last
 * confirmed-live list, same caveat as /api/partner-request.js.
 */

const PENELOPE_API_BASE = process.env.PENELOPE_API_BASE || 'http://46.62.217.83:3002';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const { full_name, email, org_type } = req.body || {};

  if (!full_name || !email || !org_type) {
    return res.status(400).json({ ok: false, error: 'All fields are required.' });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const upstream = await fetch(`${PENELOPE_API_BASE}/api/waitlist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        full_name,
        email,
        org_type,
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
