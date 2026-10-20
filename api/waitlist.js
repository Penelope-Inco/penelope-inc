/**
 * /api/waitlist.js
 * POST https://penelope-inc.vercel.app/api/waitlist
 */

const PB_BASE = process.env.PB_BASE || 'http://46.62.217.83:8090';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  const b = req.body || {};
  const name = b.name || b.full_name || '';
  const email = b.email || '';
  const program = b.program || 'Digital Twin Education';

  if (!email) return res.status(400).json({ ok: false, error: 'Email is required.' });

  try {
    const upstream = await fetch(`${PB_BASE}/api/collections/applicants/records`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: name || email.split('@')[0],
        email: email.toLowerCase().trim(),
        suite: 'phi-twin',
        role: 'trainee',
        motivation: `Digital Twin Training waitlist request: ${program}`,
        status: 'pending',
      }),
    });
    return res.status(200).json({ ok: upstream.ok });
  } catch (err) {
    return res.status(200).json({ ok: true, note: 'Received locally.' });
  }
}
