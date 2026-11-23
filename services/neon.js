import { Pool } from 'pg';

let sharedPool = null;

export function getPool() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is missing');
  }
  if (!sharedPool) {
    sharedPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 5,
      idleTimeoutMillis: 20000,
      connectionTimeoutMillis: 8000,
    });
  }
  return sharedPool;
}

export async function query(text, params = []) {
  const pool = getPool();
  return pool.query(text, params);
}

/**
 * Insert or update a dossier record by email or callsign without failing on missing columns.
 */
export async function upsertDossierRecord(entry) {
  const email = String(entry.email || '').trim().toLowerCase();
  const callsign = String(entry.callsign || '').trim().toLowerCase();
  if (!email) throw new Error('email is required');

  let existing = null;
  if (email || callsign) {
    const res = await query(
      `SELECT id, metadata FROM dossiers
       WHERE LOWER(email) = $1 OR ($2 <> '' AND LOWER(callsign) = $2)
       ORDER BY created_at DESC LIMIT 1`,
      [email, callsign]
    );
    existing = res.rows[0] || null;
  }

  const mergedMeta = {
    ...(existing?.metadata && typeof existing.metadata === 'object' ? existing.metadata : {}),
    ...(entry.metadata && typeof entry.metadata === 'object' ? entry.metadata : {}),
  };

  if (existing) {
    const upd = await query(
      `UPDATE dossiers SET
        full_name = COALESCE(NULLIF($2, ''), full_name),
        callsign = COALESCE(NULLIF($3, ''), callsign),
        role = COALESCE(NULLIF($4, ''), role),
        suite = COALESCE(NULLIF($5, ''), suite),
        motivation = COALESCE(NULLIF($6, ''), motivation),
        research_history = COALESCE(NULLIF($7, ''), research_history),
        phone = COALESCE(NULLIF($8, ''), phone),
        location = COALESCE(NULLIF($9, ''), location),
        referral = COALESCE(NULLIF($10, ''), referral),
        age = COALESCE(NULLIF($11, ''), age),
        cv_name = COALESCE(NULLIF($12, ''), cv_name),
        photo_name = COALESCE(NULLIF($13, ''), photo_name),
        cv_s3_key = COALESCE(NULLIF($14, ''), cv_s3_key),
        photo_s3_key = COALESCE(NULLIF($15, ''), photo_s3_key),
        status = COALESCE(NULLIF($16, ''), status),
        cpdc_issued = COALESCE($17, cpdc_issued),
        cpdc_card_url = COALESCE(NULLIF($18, ''), cpdc_card_url),
        metadata = $19::jsonb,
        updated_at = NOW()
      WHERE id = $1
      RETURNING *`,
      [
        existing.id,
        entry.full_name || '',
        callsign,
        entry.role || '',
        entry.suite || '',
        entry.motivation || '',
        entry.research_history || '',
        entry.phone || '',
        entry.location || '',
        entry.referral || '',
        entry.age || '',
        entry.cv_name || '',
        entry.photo_name || '',
        entry.cv_s3_key || '',
        entry.photo_s3_key || '',
        entry.status || '',
        typeof entry.cpdc_issued === 'boolean' ? entry.cpdc_issued : null,
        entry.cpdc_card_url || '',
        JSON.stringify(mergedMeta),
      ]
    );
    return upd.rows[0];
  }

  const ins = await query(
    `INSERT INTO dossiers (
      full_name, email, callsign, role, suite, motivation, research_history,
      phone, location, referral, age, cv_name, photo_name, cv_s3_key, photo_s3_key,
      status, cpdc_issued, cpdc_card_url, metadata
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19::jsonb
    ) RETURNING *`,
    [
      entry.full_name || 'Candidate',
      email,
      callsign || email.split('@')[0].replace(/[^a-z0-9]/g, ''),
      entry.role || 'applicant',
      entry.suite || 'phi-twin',
      entry.motivation || '',
      entry.research_history || '',
      entry.phone || '',
      entry.location || '',
      entry.referral || '',
      entry.age || '',
      entry.cv_name || '',
      entry.photo_name || '',
      entry.cv_s3_key || '',
      entry.photo_s3_key || '',
      entry.status || 'pending',
      Boolean(entry.cpdc_issued),
      entry.cpdc_card_url || '',
      JSON.stringify(mergedMeta),
    ]
  );
  return ins.rows[0];
}
