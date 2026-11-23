import { upsertDossierRecord } from '../services/neon.js';
import { sendAdminAlert, sendApplicantConfirmation } from '../services/email.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const { org_name, contact_name, email, org_type, interest_area, details } = req.body || {};
    const cleanEmail = String(email || '').trim().toLowerCase();
    const cleanContact = String(contact_name || org_name || '').trim();

    if (!org_name || !cleanContact || !cleanEmail) {
      return res.status(400).json({ ok: false, error: 'Organization, contact name, and email are required.' });
    }

    const callsign = cleanEmail.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '') || `prt${Date.now()}`;
    const saved = await upsertDossierRecord({
      full_name: `${cleanContact} (${org_name})`,
      email: cleanEmail,
      callsign,
      role: 'partner',
      suite: interest_area || 'partner-mou',
      motivation: `[PARTNER MOU REQUEST — ${org_type || 'Enterprise'} / ${interest_area || 'General'}]\n${details || ''}`,
      status: 'pending',
      metadata: {
        source: 'penelope-inc-partner',
        org_name,
        contact_name: cleanContact,
        org_type: org_type || '',
        interest_area: interest_area || '',
        details: details || '',
        submitted_at: new Date().toISOString(),
      },
    });

    await Promise.allSettled([
      sendAdminAlert({
        subject: `Partner MOU Request: ${org_name}`,
        replyTo: cleanEmail,
        fields: { Organization: org_name, Contact: cleanContact, Email: cleanEmail, Type: org_type, Area: interest_area, Details: details },
      }),
      sendApplicantConfirmation({
        email: cleanEmail,
        name: cleanContact,
        pathLabel: 'Institutional Partnership / MOU Request',
        suite: interest_area || 'PHI Lab',
      }),
    ]);

    return res.status(200).json({ ok: true, id: saved?.id });
  } catch (err) {
    console.error('[API/Partner] Error:', err);
    return res.status(500).json({ ok: false, error: 'Unable to submit partner inquiry.' });
  }
}
