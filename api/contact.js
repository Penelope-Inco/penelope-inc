import { upsertDossierRecord } from '../services/neon.js';
import { sendAdminAlert, sendApplicantConfirmation } from '../services/email.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const body = req.body || {};
    const { name, full_name, email, subject, message } = body;
    const cleanName = String(full_name || name || '').trim();
    const cleanEmail = String(email || '').trim().toLowerCase();

    if (!cleanName || !cleanEmail || !message) {
      return res.status(400).json({ ok: false, error: 'Name, email, and message are required.' });
    }

    const callsign = cleanEmail.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '') || `msg${Date.now()}`;
    const saved = await upsertDossierRecord({
      full_name: cleanName,
      email: cleanEmail,
      callsign,
      role: 'inquiry',
      suite: subject || 'general',
      motivation: `[CONTACT INQUIRY — ${subject || 'General'}]\n${message}`,
      status: 'pending',
      metadata: {
        source: 'penelope-inc-contact',
        subject: subject || 'general',
        message,
        submitted_at: new Date().toISOString(),
      },
    });

    await Promise.allSettled([
      sendAdminAlert({
        subject: `Website Contact: ${subject || 'General'} (${cleanName})`,
        replyTo: cleanEmail,
        fields: { Name: cleanName, Email: cleanEmail, Subject: subject || 'General', Message: message },
      }),
      sendApplicantConfirmation({
        email: cleanEmail,
        name: cleanName,
        pathLabel: 'Contact Inquiry',
        suite: subject || 'General',
      }),
    ]);

    return res.status(200).json({ ok: true, id: saved?.id });
  } catch (err) {
    console.error('[API/Contact] Error:', err);
    return res.status(500).json({ ok: false, error: 'Unable to record inquiry right now.' });
  }
}
