/**
 * /api/partner-request.js
 * POST https://penelope-inc.vercel.app/api/partner-request
 * Forwards MOU/partner applications from services/index.html to the
 * Hetzner backend. Same mixed-content workaround as /api/projects.js —
 * see that file's header comment for why this proxy exists at all.
 *
 * Expects the Hetzner Node API (:3002) to expose a matching endpoint,
 * e.g. POST /api/partner-requests, storing into the
 * `service_partner_requests` PocketBase collection (already in
 * pb_schema.json from earlier). CONFIRM THIS ENDPOINT EXISTS on the
 * backend before relying on this in production — it was not in Kimi's
 * confirmed-live endpoint list as of the last status update.
 */

const PENELOPE_API_BASE = process.env.PENELOPE_API_BASE || 'http://46.62.217.83:3002';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const { company_name, contact_name, email, service_category, pitch_url } = req.body || {};

  if (!company_name || !contact_name || !email || !service_category || !pitch_url) {
    return res.status(400).json({ ok: false, error: 'All fields are required.' });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const upstream = await fetch(`${PENELOPE_API_BASE}/api/partner-requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        company_name,
        contact_name,
        email,
        service_category,
        pitch: pitch_url,
        status: 'pending'
      })
    });
    clearTimeout(timeout);

    if (!upstream.ok) {
      return res.status(200).json({
        ok: false,
        error: 'Backend could not accept the request right now. Please email us directly.'
      });
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
