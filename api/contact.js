/**
 * /api/contact.js
 * POST https://penelope-inc.vercel.app/api/contact
 * Forwards general contact form submissions to the Hetzner backend.
 * Backend needs a matching POST /api/contact route storing into a
 * `contact_requests` PocketBase collection (not yet in pb_schema.json —
 * add it) and emailing penelopeincorporated1@gmail.com.
 */

const PENELOPE_API_BASE = process.env.PENELOPE_API_BASE || 'http://46.62.217.83:3002';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const { department, name, email, message } = req.body || {};

  if (!department || !name || !email || !message) {
    return res.status(400).json({ ok: false, error: 'All fields are required.' });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const upstream = await fetch(`${PENELOPE_API_BASE}/api/contact`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({ department, name, email, message, submitted_at: new Date().toISOString() })
    });
    clearTimeout(timeout);

    if (!upstream.ok) {
      return res.status(200).json({ ok: false, error: 'Backend could not accept the message right now.' });
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
