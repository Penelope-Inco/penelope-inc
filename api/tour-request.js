import { upsertDossierRecord } from '../services/neon.js';
import { sendAdminAlert, sendApplicantConfirmation } from '../services/email.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const body = req.body || {};
    const { name, full_name, email, organization, org_type, preferred_suite, purpose, interest_note } = body;
    const cleanName = String(full_name || name || '').trim();
    const cleanEmail = String(email || '').trim().toLowerCase();
    const cleanSuite = String(preferred_suite || 'phi-twin').trim();
    const cleanPurpose = String(purpose || interest_note || 'Requested guided digital twin workstation tour').trim();

    if (!cleanName || !cleanEmail) {
      return res.status(400).json({ ok: false, error: 'Name and email are required.' });
    }

    const callsign = cleanEmail.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '') || `tour${Date.now()}`;
    const saved = await upsertDossierRecord({
      full_name: cleanName,
      email: cleanEmail,
      callsign,
      role: 'tour-guest',
      suite: cleanSuite,
      motivation: `[TOUR REQUEST — ${organization || org_type || 'Visitor'}]\n${cleanPurpose}`,
      status: 'tour-requested',
      metadata: {
        source: 'penelope-inc-tour',
        organization: organization || org_type || '',
        purpose: cleanPurpose,
        submitted_at: new Date().toISOString(),
      },
    });

    await Promise.allSettled([
      sendAdminAlert({
        subject: `Workstation Tour Request: ${cleanName}`,
        replyTo: cleanEmail,
        fields: { Name: cleanName, Email: cleanEmail, Organization: organization || org_type, Suite: cleanSuite, Purpose: cleanPurpose },
      }),
      sendApplicantConfirmation({
        email: cleanEmail,
        name: cleanName,
        pathLabel: 'Workstation Guided Tour Request',
        suite: cleanSuite,
      }),
    ]);

    return res.status(200).json({ ok: true, id: saved?.id });
  } catch (err) {
    console.error('[API/Tour] Error:', err);
    return res.status(500).json({ ok: false, error: 'Unable to schedule tour request right now.' });
  }
}
