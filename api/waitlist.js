import { upsertDossierRecord } from '../services/neon.js';
import { sendAdminAlert, sendApplicantConfirmation } from '../services/email.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const { full_name, name, email, org_type, preferred_track, track, phone, phone_number } = req.body || {};
    const cleanName = String(full_name || name || '').trim();
    const cleanEmail = String(email || '').trim().toLowerCase();
    const cleanPhone = String(phone || phone_number || '').trim();
    const suite = String(preferred_track || track || org_type || 'training').trim();

    if (!cleanName || !cleanEmail) {
      return res.status(400).json({ ok: false, error: 'Full name and email are required.' });
    }

    const callsign = cleanEmail.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '') || `wl${Date.now()}`;
    const saved = await upsertDossierRecord({
      full_name: cleanName,
      email: cleanEmail,
      callsign,
      role: 'waitlist',
      suite,
      phone: cleanPhone,
      motivation: `[MASTERCLASS / TRAINING WAITLIST — ${org_type || 'General'}]`,
      status: 'waitlist',
      metadata: {
        source: 'penelope-inc-waitlist',
        org_type: org_type || '',
        phone: cleanPhone,
        submitted_at: new Date().toISOString(),
      },
    });

    await Promise.allSettled([
      sendAdminAlert({
        subject: `Training Waitlist: ${cleanName}`,
        replyTo: cleanEmail,
        fields: { Name: cleanName, Email: cleanEmail, Phone: cleanPhone, OrgType: org_type, Track: suite },
      }),
      sendApplicantConfirmation({
        email: cleanEmail,
        name: cleanName,
        pathLabel: 'Digital Twin Training Registration',
        suite,
      }),
    ]);

    return res.status(200).json({ ok: true, id: saved?.id });
  } catch (err) {
    console.error('[API/Waitlist] Error:', err);
    return res.status(500).json({ ok: false, error: 'Unable to record registration right now.' });
  }
}
