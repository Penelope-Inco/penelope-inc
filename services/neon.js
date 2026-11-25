import { Pool } from 'pg';

let sharedPool = null;
let schemaEnsuredPromise = null;

export function getPool() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is missing');
  }
  if (!sharedPool) {
    sharedPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 5,
      idleTimeoutMillis: 20000,
      connectionTimeoutMillis: 15000,
    });
  }
  return sharedPool;
}

export async function query(text, params = []) {
  const pool = getPool();
  return pool.query(text, params);
}

export function ensureExtendedSchema() {
  if (!schemaEnsuredPromise) {
    schemaEnsuredPromise = query(`
      CREATE TABLE IF NOT EXISTS work_reports (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        author_id TEXT NOT NULL,
        author_name TEXT NOT NULL DEFAULT 'Engineer',
        author_email TEXT NOT NULL DEFAULT '',
        author_avatar TEXT NOT NULL DEFAULT '',
        suite TEXT NOT NULL DEFAULT 'phi-twin',
        title TEXT NOT NULL,
        summary TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'submitted',
        hours_logged NUMERIC(6,2) NOT NULL DEFAULT 0,
        attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
        md_feedback TEXT NOT NULL DEFAULT '',
        reviewed_by TEXT NOT NULL DEFAULT '',
        reviewed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS lab_directives (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        author_id TEXT NOT NULL DEFAULT 'cgu43cdnkhza7sd',
        author_name TEXT NOT NULL DEFAULT 'Managing Director',
        suite TEXT NOT NULL DEFAULT 'all',
        title TEXT NOT NULL,
        content TEXT NOT NULL DEFAULT '',
        priority TEXT NOT NULL DEFAULT 'normal',
        pinned BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      ALTER TABLE team_presence ADD COLUMN IF NOT EXISTS avatar_url TEXT NOT NULL DEFAULT '';
      ALTER TABLE messages ADD COLUMN IF NOT EXISTS sender_avatar TEXT NOT NULL DEFAULT '';
      ALTER TABLE messages ADD COLUMN IF NOT EXISTS reply_to TEXT NOT NULL DEFAULT '';
      ALTER TABLE messages ADD COLUMN IF NOT EXISTS reply_preview TEXT NOT NULL DEFAULT '';
      ALTER TABLE time_logs ADD COLUMN IF NOT EXISTS note TEXT NOT NULL DEFAULT '';
      ALTER TABLE time_logs ADD COLUMN IF NOT EXISTS duration_minutes INTEGER NOT NULL DEFAULT 0;
    `).catch((err) => {
      schemaEnsuredPromise = null;
      console.warn('[Neon/Schema] Warning:', err.message);
    });
  }
  return schemaEnsuredPromise;
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
