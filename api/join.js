/**
 * /api/join.js
 * POST https://penelope-inc.vercel.app/api/join
 * Forwards collaborator / employee applications from join.html directly
 * to the PocketBase backend applicants collection on Hetzner VPS.
 * Submissions instantly show up in the PHI-LAB Workstation Command Center.
 */

const PB_BASE = process.env.PB_BASE || 'http://46.62.217.83:8090';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    let name = '';
    let email = '';
    let suite = 'phi-twin';
    let role = 'member';
    let motivation = '';

    // Handle JSON or URL-encoded payload
    if (req.headers['content-type']?.includes('application/json')) {
      const b = req.body || {};
      name = b.full_name || b.name || '';
      email = b.email || '';
      suite = b.suite || 'phi-twin';
      role = b.role || 'member';
      motivation = b.motivation || b.about || b.bio || '';
    } else {
      // In serverless, body might be parsed as object
      const b = req.body || {};
      name = b.full_name || b.name || '';
      email = b.email || '';
      suite = b.suite || 'phi-twin';
      role = b.role || 'member';
      motivation = b.motivation || b.about || b.bio || '';
    }

    if (!name || !email) {
      return res.status(400).json({ ok: false, error: 'Full name and email are required.' });
    }

    const payload = {
      name,
      email: email.toLowerCase().trim(),
      suite,
      role,
      motivation: motivation || `Application for ${suite} workspace under DIMASA aerospace initiative.`,
      status: 'pending',
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const upstream = await fetch(`${PB_BASE}/api/collections/applicants/records`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!upstream.ok) {
      const errText = await upstream.text();
      console.error('[API/Join] PocketBase error:', upstream.status, errText);
      return res.status(200).json({
        ok: false,
        error: 'Unable to submit application to facility ledger. Please try again or email penelopeincorporated1@gmail.com.',
      });
    }

    const created = await upstream.json();
    return res.status(200).json({
      ok: true,
      id: created.id,
      message: 'Application received. Founder review underway.',
    });
  } catch (err) {
    console.error('[API/Join] Exception:', err);
    return res.status(200).json({
      ok: false,
      error: 'Connection timeout. Please email penelopeincorporated1@gmail.com directly.',
    });
  }
}
