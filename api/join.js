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
    let body = req.body;

    // Handle raw string body if not parsed
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        // Parse URL-encoded or multipart boundary lines if plain text
        body = {};
      }
    }

    body = body || {};

    const name = (body.full_name || body.name || '').trim();
    const email = (body.email || '').trim().toLowerCase();
    const suite = body.suite || 'phi-twin';
    const role = body.role || 'member';

    const motivationParts = [
      body.motivation,
      body.research_history ? `Research / Proof: ${body.research_history}` : '',
      body.location ? `Location: ${body.location}` : '',
      body.phone_number || body.phone ? `Phone: ${body.phone_number || body.phone}` : '',
      body.age ? `Age: ${body.age}` : '',
      body.how_they_found_us ? `Referral: ${body.how_they_found_us}` : '',
      body.cv_name ? `CV Attached: ${body.cv_name}` : '',
      body.photo_name ? `Photo: ${body.photo_name}` : '',
    ].filter(Boolean);

    const motivation = motivationParts.join(' | ') || `Application for ${suite} workspace under DIMASA aerospace initiative.`;

    if (!name || !email || !email.includes('@')) {
      return res.status(400).json({
        ok: false,
        error: 'Please provide both your Full Name and a valid Email address.',
      });
    }

    const payload = {
      name,
      email,
      suite,
      role,
      motivation,
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
        error: 'Unable to record applicant to facility ledger. Please try again or email penelopeincorporated1@gmail.com.',
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
