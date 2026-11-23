const BREVO_URL = 'https://api.brevo.com/v3/smtp/email';

function escapeHtml(val) {
  return String(val || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function isBrevoConfigured() {
  return Boolean(process.env.BREVO_API_KEY);
}

export async function sendBrevoEmail({ to, subject, htmlContent, textContent, replyTo, attachment }) {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    return { skipped: true, reason: 'BREVO_API_KEY not configured' };
  }

  const senderEmail = process.env.BREVO_SENDER_EMAIL || 'penelopeincorporated1@gmail.com';
  const senderName = process.env.BREVO_SENDER_NAME || 'PHI Lab';

  const recipients = (Array.isArray(to) ? to : [to])
    .filter(Boolean)
    .map((item) => (typeof item === 'string' ? { email: item } : item));

  if (recipients.length === 0) {
    return { skipped: true, reason: 'no recipients' };
  }

  const body = {
    sender: { name: senderName, email: senderEmail },
    to: recipients,
    subject,
    htmlContent,
  };
  if (textContent) body.textContent = textContent;
  if (replyTo) body.replyTo = typeof replyTo === 'string' ? { email: replyTo } : replyTo;
  if (Array.isArray(attachment) && attachment.length > 0) body.attachment = attachment;

  const res = await fetch(BREVO_URL, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'api-key': apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Brevo HTTP ${res.status}: ${errText.slice(0, 200)}`);
  }
  return res.json();
}

export async function sendAdminAlert({ subject, fields = {}, replyTo }) {
  const adminEmail = process.env.ADMIN_ALERT_EMAIL || process.env.BREVO_SENDER_EMAIL || 'penelopeincorporated1@gmail.com';
  const rows = Object.entries(fields)
    .filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== '')
    .map(([k, v]) => `<tr><td style="padding:6px 10px;border:1px solid #d9e2ec;font-weight:600;">${escapeHtml(k)}</td><td style="padding:6px 10px;border:1px solid #d9e2ec;">${escapeHtml(v)}</td></tr>`)
    .join('');

  const htmlContent = `
    <div style="font-family:Segoe UI,Arial,sans-serif;max-width:640px;color:#0f172a;">
      <h2 style="margin:0 0 12px;color:#0b1f3a;">PHI Lab • ${escapeHtml(subject)}</h2>
      <table style="border-collapse:collapse;width:100%;font-size:13px;">${rows}</table>
    </div>`;

  return sendBrevoEmail({ to: adminEmail, subject: `[PHI Lab] ${subject}`, htmlContent, replyTo });
}

export async function sendApplicantConfirmation({ email, name, pathLabel, suite }) {
  if (!email) return { skipped: true };
  const safeName = escapeHtml(name || 'Engineer');
  const htmlContent = `
    <div style="font-family:Segoe UI,Arial,sans-serif;max-width:620px;color:#0f172a;line-height:1.6;">
      <h2 style="color:#0b1f3a;">Physics Hybrid Integrity Lab (PHI Lab)</h2>
      <p>Hello ${safeName},</p>
      <p>We received your <strong>${escapeHtml(pathLabel)}</strong> submission${suite ? ` for <strong>${escapeHtml(suite)}</strong>` : ''}.</p>
      <p>Our engineering desk reviews submissions continuously and follows up directly via email once cleared.</p>
      <p style="font-size:12px;color:#64748b;">DIMASA &bull; PHI-Lab Digital Twin &amp; Aerospace Systems</p>
    </div>`;
  return sendBrevoEmail({
    to: [{ email, name: name || email }],
    subject: `PHI Lab: ${pathLabel} Received`,
    htmlContent,
  });
}

export async function sendCpdcIssuedEmail({ email, name, callsign, role, suite, cardPngBase64 }) {
  if (!email) return { skipped: true };
  const safeName = escapeHtml(name || callsign || 'Operator');
  const attachments = [];
  if (typeof cardPngBase64 === 'string') {
    const rawB64 = cardPngBase64.replace(/^data:image\/png;base64,/, '');
    if (rawB64.length > 100 && rawB64.length < 3_500_000 && !rawB64.startsWith('{')) {
      attachments.push({
        name: `CPDC_${(callsign || 'operator').replace(/[^a-zA-Z0-9_-]/g, '')}.png`,
        content: rawB64,
      });
    }
  }
  const htmlContent = `
    <div style="font-family:Segoe UI,Arial,sans-serif;max-width:620px;color:#0f172a;line-height:1.6;">
      <h2 style="color:#0b1f3a;">PHI-Lab Workstation Clearance Granted</h2>
      <p>Welcome aboard, <strong>${safeName}</strong>.</p>
      <p>Your Cryptographic Penelope Digital Clearance (CPDC) card has been issued:</p>
      <ul>
        <li><strong>Callsign:</strong> ${escapeHtml(callsign || 'assigned')}</li>
        <li><strong>Role:</strong> ${escapeHtml(role || 'member')}</li>
        <li><strong>Primary Suite:</strong> ${escapeHtml(suite || 'phi-twin')}</li>
      </ul>
      <p>Open the <strong>PHI-Lab Workstation</strong> desktop app and sign in with your email/callsign or CPDC badge to activate your enclave workspace.</p>
    </div>`;
  return sendBrevoEmail({
    to: [{ email, name: name || email }],
    subject: 'PHI Lab: Workstation CPDC Clearance Issued',
    htmlContent,
    attachment: attachments,
  });
}
