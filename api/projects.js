import { query } from '../services/neon.js';

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET') {
      const { suite, published, id } = req.query || {};
      const clauses = [];
      const params = [];

      if (id) {
        params.push(String(id));
        clauses.push(`id = $${params.length}`);
      }
      if (suite) {
        params.push(String(suite));
        clauses.push(`LOWER(suite) = LOWER($${params.length})`);
      }
      if (published === 'true' || published === '1') {
        clauses.push(`published = TRUE`);
      }

      const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
      const { rows } = await query(
        `SELECT * FROM projects ${whereSql} ORDER BY updated_at DESC LIMIT 200`,
        params
      );
      return res.status(200).json({ ok: true, items: rows, projects: rows, source: 'neon' });
    }

    if (req.method === 'POST') {
      const b = req.body || {};
      const projId = String(b.id || `proj_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`);
      const { rows } = await query(
        `INSERT INTO projects (
          id, title, description, suite, stages, progress, status,
          lead_id, github_repo, branch, published, what_im_working_on, images
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb)
        ON CONFLICT (id) DO UPDATE SET
          title = EXCLUDED.title,
          description = EXCLUDED.description,
          suite = EXCLUDED.suite,
          stages = EXCLUDED.stages,
          progress = EXCLUDED.progress,
          status = EXCLUDED.status,
          github_repo = EXCLUDED.github_repo,
          branch = EXCLUDED.branch,
          published = EXCLUDED.published,
          what_im_working_on = EXCLUDED.what_im_working_on,
          images = EXCLUDED.images,
          updated_at = NOW()
        RETURNING *`,
        [
          projId,
          b.title || 'Untitled Research Project',
          b.description || '',
          b.suite || 'phi-twin',
          typeof b.stages === 'string' ? b.stages : JSON.stringify(b.stages || []),
          Number(b.progress || 0),
          b.status || 'active',
          b.lead_id || '',
          b.github_repo || '',
          b.branch || 'main',
          Boolean(b.published),
          b.what_im_working_on || '',
          JSON.stringify(b.images || []),
        ]
      );
      return res.status(200).json({ ok: true, id: rows[0].id, project: rows[0], source: 'neon' });
    }

    if (req.method === 'PATCH') {
      const b = req.body || {};
      const projId = String(req.query?.id || b.id || '').trim();
      if (!projId) return res.status(400).json({ ok: false, error: 'Project id is required' });

      const { rows } = await query(
        `UPDATE projects SET
          title = COALESCE($2, title),
          description = COALESCE($3, description),
          suite = COALESCE($4, suite),
          stages = COALESCE($5, stages),
          progress = COALESCE($6, progress),
          status = COALESCE($7, status),
          github_repo = COALESCE($8, github_repo),
          branch = COALESCE($9, branch),
          published = COALESCE($10, published),
          what_im_working_on = COALESCE($11, what_im_working_on),
          images = COALESCE($12::jsonb, images),
          updated_at = NOW()
        WHERE id = $1
        RETURNING *`,
        [
          projId,
          b.title ?? null,
          b.description ?? null,
          b.suite ?? null,
          b.stages !== undefined ? (typeof b.stages === 'string' ? b.stages : JSON.stringify(b.stages)) : null,
          b.progress !== undefined ? Number(b.progress) : null,
          b.status ?? null,
          b.github_repo ?? null,
          b.branch ?? null,
          typeof b.published === 'boolean' ? b.published : null,
          b.what_im_working_on ?? null,
          b.images !== undefined ? JSON.stringify(b.images) : null,
        ]
      );
      return res.status(200).json({ ok: true, project: rows[0] || null, source: 'neon' });
    }

    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  } catch (err) {
    console.error('[API/Projects] Error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
