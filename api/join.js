import { upsertDossierRecord, query } from '../services/neon.js';
import { isS3Configured, uploadDataUrl } from '../services/s3.js';
import { sendAdminAlert, sendApplicantConfirmation } from '../services/email.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const body = req.body || {};
    const {
      full_name,
      name,
      email,
      role,
      suite,
      phone,
      phone_number,
      location,
      age,
      referral,
      how_they_found_us,
      motivation,
      research_history,
      callsign,
      cv_name,
      cv_data,
      cv_resume_name,
      cv_resume_data,
      photo_name,
      photo_data,
    } = body;

    const cleanName = String(full_name || name || '').trim();
    const cleanEmail = String(email || '').trim().toLowerCase();
    const cleanRole = String(role || 'applicant').trim();
    const cleanSuite = String(suite || 'phi-twin').trim();
    const cleanPhone = String(phone || phone_number || '').trim();
    const cleanReferral = String(referral || how_they_found_us || '').trim();
    const cleanCvName = String(cv_name || cv_resume_name || '').trim();
    const cleanCvData = cv_data || cv_resume_data || '';

    if (!cleanName || !cleanEmail) {
      return res.status(400).json({ ok: false, error: 'Full name and email are required.' });
    }

    const safeCallsign =
      String(callsign || cleanEmail.split('@')[0] || 'applicant')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '') || `app${Date.now().toString(36)}`;
    const dossierUid = safeCallsign.slice(0, 15).padEnd(6, '0');

    // Upload CV / Photo binaries to Neon S3 (`philab26` bucket) when configured
    let cvUpload = null;
    let photoUpload = null;
    if (isS3Configured()) {
      const uploads = [];
      if (cleanCvData) {
        uploads.push(
          uploadDataUrl(`dossiers/${safeCallsign}/cv`, cleanCvName || 'cv.pdf', cleanCvData)
            .then((r) => { cvUpload = r; })
            .catch((e) => console.warn('[API/Join] CV S3 upload warning:', e.message))
        );
      }
      if (photo_data) {
        uploads.push(
          uploadDataUrl(`dossiers/${safeCallsign}/photo`, photo_name || 'photo.png', photo_data)
            .then((r) => { photoUpload = r; })
            .catch((e) => console.warn('[API/Join] Photo S3 upload warning:', e.message))
        );
      }
      if (uploads.length > 0) await Promise.all(uploads);
    }

    const saved = await upsertDossierRecord({
      full_name: cleanName,
      email: cleanEmail,
      callsign: safeCallsign,
      role: cleanRole,
      suite: cleanSuite,
      motivation: motivation || 'Research collaborator submission',
      research_history: research_history || 'Submitted via penelope-inc.vercel.app/join',
      phone: cleanPhone,
      location: location || '',
      referral: cleanReferral,
      age: age ? String(age) : '',
      cv_name: cleanCvName,
      photo_name: photo_name || '',
      cv_s3_key: cvUpload?.key || '',
      photo_s3_key: photoUpload?.key || '',
      status: 'pending',
      metadata: {
        uid: dossierUid,
        source: 'penelope-inc-join',
        cv_s3_key: cvUpload?.key || '',
        photo_s3_key: photoUpload?.key || '',
        submitted_at: new Date().toISOString(),
      },
    });

    // Log telemetry event + send Brevo alerts cleanly
    await Promise.allSettled([
      query(
        `INSERT INTO telemetry (operator_id, operator_name, operator_email, role, event_type, suite, prompt_summary, metadata)
         VALUES ($1, $2, $3, $4, 'dossier_submitted', $5, $6, $7::jsonb)`,
        [
          dossierUid,
          cleanName,
          cleanEmail,
          cleanRole,
          cleanSuite,
          `${cleanName} (${cleanEmail}) applied for ${cleanRole} / ${cleanSuite}`,
          JSON.stringify({ dossier_id: saved?.id, cv_s3_key: cvUpload?.key || '', photo_s3_key: photoUpload?.key || '' }),
        ]
      ),
      sendAdminAlert({
        subject: `New Collaborator Dossier: ${cleanName}`,
        replyTo: cleanEmail,
        fields: {
          Name: cleanName,
          Email: cleanEmail,
          Callsign: safeCallsign,
          Role: cleanRole,
          Suite: cleanSuite,
          Phone: cleanPhone,
          Location: location,
          Age: age,
          Referral: cleanReferral,
          Motivation: motivation,
          ResearchHistory: research_history,
          CV: cvUpload?.key || cleanCvName || 'None',
          Photo: photoUpload?.key || photo_name || 'None',
        },
      }),
      sendApplicantConfirmation({
        email: cleanEmail,
        name: cleanName,
        pathLabel: 'Research Collaborator Application',
        suite: cleanSuite,
      }),
    ]);

    return res.status(200).json({ ok: true, id: saved?.id || dossierUid, status: 'pending' });
  } catch (err) {
    console.error('[API/Join] Error:', err);
    return res.status(500).json({ ok: false, error: 'Unable to record submission right now.' });
  }
}
