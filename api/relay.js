import { query, upsertDossierRecord, ensureExtendedSchema } from '../services/neon.js';
import {
  isS3Configured,
  uploadDataUrl,
  getPresignedUrl,
  getPresignedPutUrl,
  buildSafeObjectKey,
  getPermanentAssetUrl,
} from '../services/s3.js';
import { sendCpdcIssuedEmail, isBrevoConfigured } from '../services/email.js';

const PUBLIC_ORIGIN = (process.env.PUBLIC_SITE_URL || 'https://penelope-inc.vercel.app').replace(/\/+$/, '');

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function norm(v) {
  return String(v || '').trim().toLowerCase();
}

function safeSlug(v, fallback = 'operator') {
  return norm(v).replace(/[^a-z0-9_-]/g, '').slice(0, 48) || fallback;
}

function resolveDossierAvatarUrl(d) {
  const s3Key = d?.photo_s3_key || d?.metadata?.photo_s3_key || '';
  if (s3Key) return getPermanentAssetUrl(s3Key, PUBLIC_ORIGIN);
  const metaAvatar = d?.metadata?.avatar_url || '';
  if (metaAvatar && (metaAvatar.startsWith('http://') || metaAvatar.startsWith('https://'))) {
    return metaAvatar;
  }
  return '';
}

function normalizeAttachments(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((a) => a && typeof a === 'object')
    .map((a) => {
      const key = String(a.key || a.s3_key || '').trim();
      return {
        name: String(a.name || 'deliverable.bin'),
        key,
        size: Number(a.size || 0),
        type: String(a.type || a.contentType || 'application/octet-stream'),
        url: key ? getPermanentAssetUrl(key, PUBLIC_ORIGIN) : String(a.url || ''),
      };
    });
}

function renderFallbackAvatarSvg(label = 'P') {
  const ch = String(label || 'P').trim().charAt(0).toUpperCase() || 'P';
  const safeCh = ch.replace(/[^A-Z0-9]/g, 'P');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
    <rect width="128" height="128" rx="28" fill="#0F1D2E"/>
    <circle cx="104" cy="24" r="6" fill="#E8A33D"/>
    <text x="64" y="79" text-anchor="middle" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="52" font-weight="700" fill="#FAF9F5">${safeCh}</text>
  </svg>`;
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const channel = String(req.query?.channel || req.body?.channel || 'applicants').toLowerCase();

  try {
    await ensureExtendedSchema();
    // ────────── HEALTH / SYNC STATUS ──────────
    if (channel === 'sync-status' || channel === 'health') {
      const dbCheck = await query('SELECT NOW() AS now');
      return res.status(200).json({
        ok: true,
        mode: 'neon+s3+brevo+cloudflare',
        database: 'neon-postgres',
        pocketbase: 'neon-verified',
        dbTime: dbCheck.rows[0]?.now,
        s3Configured: isS3Configured(),
        brevoConfigured: isBrevoConfigured(),
        ts: Date.now(),
      });
    }

    // ────────── PERMANENT S3 ASSET & AVATAR REDIRECTORS ──────────
    if (channel === 'asset' && req.method === 'GET') {
      const key = String(req.query?.key || '').trim();
      if (!key || key.includes('..')) {
        return res.status(400).json({ ok: false, error: 'Valid key is required' });
      }
      const signed = getPresignedUrl(key, 3600);
      if (!signed) {
        return res.status(404).json({ ok: false, error: 'Asset unavailable' });
      }
      res.setHeader('Cache-Control', 'public, max-age=900');
      return res.redirect(302, signed);
    }

    if (channel === 'avatar' && req.method === 'GET') {
      const directKey = String(req.query?.key || '').trim();
      if (directKey && !directKey.includes('..')) {
        const signed = getPresignedUrl(directKey, 3600);
        if (signed) {
          res.setHeader('Cache-Control', 'public, max-age=900');
          return res.redirect(302, signed);
        }
      }
      const user = norm(req.query?.user || req.query?.uid || req.query?.email);
      if (user) {
        const { rows } = await query(
          `SELECT full_name, callsign, photo_s3_key, metadata
           FROM dossiers
           WHERE LOWER(callsign) = $1 OR LOWER(email) = $1 OR id::text = $1
           ORDER BY updated_at DESC LIMIT 1`,
          [user]
        );
        const d = rows[0];
        const key = d?.photo_s3_key || d?.metadata?.photo_s3_key || '';
        if (key && !key.includes('..')) {
          const signed = getPresignedUrl(key, 3600);
          if (signed) {
            res.setHeader('Cache-Control', 'public, max-age=600');
            return res.redirect(302, signed);
          }
        }
        const svg = renderFallbackAvatarSvg(d?.full_name || d?.callsign || user);
        res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
        res.setHeader('Cache-Control', 'public, max-age=300');
        return res.status(200).send(svg);
      }
      res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
      return res.status(200).send(renderFallbackAvatarSvg('P'));
    }

    // ────────── S3 PRESIGNED URL REFRESH (JSON) ──────────
    if (channel === 's3-url' && req.method === 'GET') {
      const key = String(req.query?.key || '').trim();
      if (!key || key.includes('..')) {
        return res.status(400).json({ ok: false, error: 'Valid key is required' });
      }
      const url = getPresignedUrl(key, 3600);
      return res.status(200).json({
        ok: Boolean(url),
        url,
        permanentUrl: getPermanentAssetUrl(key, PUBLIC_ORIGIN),
        key,
      });
    }

    // ────────── GET REQUESTS ──────────
    if (req.method === 'GET') {
      if (channel === 'applicants' || channel === 'dossiers') {
        const { rows } = await query(
          `SELECT * FROM dossiers ORDER BY updated_at DESC, created_at DESC LIMIT 250`
        );
        const formatted = rows.map((d) => {
          const cvKey = d.cv_s3_key || d.metadata?.cv_s3_key || '';
          const photoKey = d.photo_s3_key || d.metadata?.photo_s3_key || '';
          const avatarUrl = resolveDossierAvatarUrl(d);
          return {
            id: d.id,
            user_id: d.metadata?.uid || d.callsign || d.id,
            email: d.email,
            full_name: d.full_name,
            name: d.full_name,
            callsign: d.callsign,
            username: d.callsign,
            role: d.role,
            suite: d.suite,
            status: d.status,
            bio: d.metadata?.bio || '',
            office_notes: d.metadata?.office_notes || '',
            motivation: d.motivation,
            research_history: d.research_history,
            phone: d.phone,
            location: d.location,
            referral: d.referral,
            age: d.age,
            cv_name: d.cv_name,
            photo_name: d.photo_name,
            cv_s3_key: cvKey,
            photo_s3_key: photoKey,
            cv_url: cvKey ? getPermanentAssetUrl(cvKey, PUBLIC_ORIGIN) : '',
            photo_url: avatarUrl,
            avatar: avatarUrl,
            cpdc_issued: d.cpdc_issued,
            cpdc_card_url: d.cpdc_card_url,
            metadata: d.metadata,
            created_at: d.created_at,
            updated_at: d.updated_at,
          };
        });
        return res.status(200).json({ ok: true, items: formatted, source: 'neon' });
      }

      if (channel === 'cards') {
        const email = norm(req.query?.email);
        const userId = norm(req.query?.userId || req.query?.uid || req.query?.callsign);

        const cpdcRes = await query(
          `SELECT * FROM cpdc_registry
           WHERE ($1 <> '' AND LOWER(applicant_email) = $1)
              OR ($2 <> '' AND LOWER(callsign) = $2)
           ORDER BY issued_at DESC LIMIT 1`,
          [email, userId]
        );
        const cardRow = cpdcRes.rows[0];
        if (cardRow) {
          let payload = null;
          let cardData = cardRow.card_png_base64 || '';
          try {
            if (typeof cardData === 'string' && cardData.trim().startsWith('{')) {
              const parsed = JSON.parse(cardData);
              if (parsed.cpdc_payload || parsed.v === 2) {
                payload = parsed.cpdc_payload || parsed;
                cardData = parsed.cpdc_card_data || '';
              }
            }
          } catch {}
          const cardUrl = cardRow.card_s3_key
            ? getPermanentAssetUrl(cardRow.card_s3_key, PUBLIC_ORIGIN)
            : '';
          const cardObj = {
            userId: cardRow.callsign,
            uid: cardRow.callsign,
            name: cardRow.applicant_name,
            email: cardRow.applicant_email,
            role: cardRow.role,
            suite: cardRow.suite,
            spaces: payload?.access_matrix || [cardRow.suite || 'phi-twin'],
            access_matrix: payload?.access_matrix || [cardRow.suite || 'phi-twin'],
            sig: cardRow.signature,
            cpdc_payload: payload,
            cpdc_card_data: cardData || undefined,
            card_url: cardUrl || undefined,
            issued_at: cardRow.issued_at,
          };
          return res.status(200).json({
            ok: true,
            ...cardObj,
            card: cardObj,
            source: 'neon-cpdc',
          });
        }

        const dosRes = await query(
          `SELECT * FROM dossiers
           WHERE ($1 <> '' AND LOWER(email) = $1)
              OR ($2 <> '' AND (LOWER(callsign) = $2 OR id::text = $2))
           ORDER BY updated_at DESC LIMIT 1`,
          [email, userId]
        );
        const dRow = dosRes.rows[0];
        if (dRow && (dRow.cpdc_issued || dRow.metadata?.cpdc_payload || dRow.metadata?.cpdc_card_data)) {
          const cardS3Key = dRow.metadata?.cpdc_s3_key || '';
          const cardObj = {
            userId: dRow.callsign || dRow.id,
            uid: dRow.callsign || dRow.id,
            name: dRow.full_name,
            email: dRow.email,
            role: dRow.role,
            suite: dRow.suite,
            spaces: dRow.metadata?.spaces || [dRow.suite || 'phi-twin'],
            access_matrix: dRow.metadata?.spaces || [dRow.suite || 'phi-twin'],
            cpdc_payload: dRow.metadata?.cpdc_payload || null,
            cpdc_card_data: dRow.metadata?.cpdc_card_data || undefined,
            card_url: cardS3Key ? getPermanentAssetUrl(cardS3Key, PUBLIC_ORIGIN) : undefined,
          };
          return res.status(200).json({
            ok: true,
            ...cardObj,
            card: cardObj,
            source: 'neon-dossier',
          });
        }

        return res.status(200).json({ ok: false, error: 'Card not found' });
      }

      if (channel === 'reports') {
        const authorId = norm(req.query?.author_id || req.query?.user_id);
        const includeDrafts = String(req.query?.include_drafts || 'false') === 'true';
        let rows = [];
        if (authorId) {
          const r = await query(
            `SELECT * FROM work_reports
             WHERE LOWER(author_id) = $1 OR LOWER(author_email) = $1
             ORDER BY updated_at DESC LIMIT 120`,
            [authorId]
          );
          rows = r.rows;
        } else if (includeDrafts) {
          const r = await query(`SELECT * FROM work_reports ORDER BY updated_at DESC LIMIT 200`);
          rows = r.rows;
        } else {
          const r = await query(
            `SELECT * FROM work_reports WHERE status <> 'draft' ORDER BY updated_at DESC LIMIT 200`
          );
          rows = r.rows;
        }
        const items = rows.map((row) => ({
          ...row,
          hours_logged: Number(row.hours_logged || 0),
          attachments: normalizeAttachments(row.attachments),
        }));
        return res.status(200).json({ ok: true, items, source: 'neon' });
      }

      if (channel === 'directives') {
        const suite = norm(req.query?.suite);
        const { rows } = suite && suite !== 'all'
          ? await query(
              `SELECT * FROM lab_directives WHERE suite = 'all' OR LOWER(suite) = $1 ORDER BY pinned DESC, created_at DESC LIMIT 40`,
              [suite]
            )
          : await query(`SELECT * FROM lab_directives ORDER BY pinned DESC, created_at DESC LIMIT 40`);
        return res.status(200).json({ ok: true, items: rows, source: 'neon' });
      }

      if (channel === 'telemetry') {
        const limit = Math.min(200, Math.max(10, Number(req.query?.limit || 60)));
        const [telRes, presRes] = await Promise.all([
          query(`SELECT * FROM telemetry ORDER BY created_at DESC LIMIT $1`, [limit]),
          query(
            `SELECT user_id, name, suite, role, avatar_url, what_im_working_on, last_seen
             FROM team_presence
             WHERE last_seen > NOW() - INTERVAL '10 minutes'
             ORDER BY last_seen DESC`
          ),
        ]);
        const presence = {};
        for (const p of presRes.rows) {
          presence[p.user_id] = {
            operator_id: p.user_id,
            operator_name: p.name,
            suite: p.suite,
            role: p.role,
            avatar: p.avatar_url || '',
            what_im_working_on: p.what_im_working_on || '',
            updated_at: p.last_seen,
          };
        }
        return res.status(200).json({
          ok: true,
          items: telRes.rows,
          presence,
          source: 'neon',
        });
      }

      if (channel === 'messages') {
        const room = String(req.query?.room || '').trim();
        const { rows } = room
          ? await query(`SELECT * FROM messages WHERE room = $1 ORDER BY created_at DESC LIMIT 120`, [room])
          : await query(`SELECT * FROM messages ORDER BY created_at DESC LIMIT 120`);
        return res.status(200).json({
          ok: true,
          items: rows.reverse(),
          source: 'neon',
        });
      }

      if (channel === 'timelogs') {
        const uid = String(req.query?.user_id || '').trim();
        const { rows } = uid
          ? await query(`SELECT * FROM time_logs WHERE LOWER(user_id) = LOWER($1) ORDER BY timestamp DESC LIMIT 150`, [uid])
          : await query(`SELECT * FROM time_logs ORDER BY timestamp DESC LIMIT 150`);
        return res.status(200).json({ ok: true, items: rows, logs: rows, source: 'neon' });
      }

      if (channel === 'signals') {
        const since = Number(req.query?.since || 0);
        const room = String(req.query?.room || '').trim();
        const cutoff = Date.now() - 120000;
        await query(`DELETE FROM signal_events WHERE ts < $1`, [cutoff]);
        const { rows } = await query(
          `SELECT id, target, sender, sender_name, room, signal_type, payload, ts
           FROM signal_events
           WHERE ts > $1 AND ($2 = '' OR room = $2 OR room = 'global' OR signal_type IN ('incoming-call','call-response','call-end','leave-call','screen-invite'))
           ORDER BY ts ASC LIMIT 60`,
          [since, room]
        );
        const items = rows.map((r) => ({
          ...(r.payload && typeof r.payload === 'object' ? r.payload : {}),
          id: r.id,
          type: r.signal_type,
          from: r.sender,
          to: r.target,
          room: r.room,
          ts: Number(r.ts),
        }));
        return res.status(200).json({
          ok: true,
          items,
          serverTime: Date.now(),
          source: 'neon',
        });
      }

      return res.status(400).json({ ok: false, error: `Unknown channel: ${channel}` });
    }

    // ────────── PATCH REQUESTS ──────────
    if (req.method === 'PATCH') {
      const b = req.body || {};

      if (channel === 'applicants' || channel === 'dossiers' || channel === 'profile') {
        const id = String(req.query?.id || b.id || '').trim();
        const email = norm(req.query?.email || b.email);
        const callsign = norm(req.query?.callsign || b.callsign || id);
        const slug = safeSlug(callsign || email.split('@')[0], 'operator');

        let newPhotoKey = '';
        let clearPhoto = false;
        let resolvedAvatarUrl = '';

        if (typeof b.avatar === 'string') {
          if (b.avatar === '') {
            clearPhoto = true;
          } else if (b.avatar.startsWith('data:image/') && isS3Configured()) {
            const up = await uploadDataUrl(`avatars/${slug}`, `${slug}.png`, b.avatar);
            if (up?.key) {
              newPhotoKey = up.key;
              resolvedAvatarUrl = getPermanentAssetUrl(up.key, PUBLIC_ORIGIN);
            }
          } else if (b.avatar.startsWith('http://') || b.avatar.startsWith('https://')) {
            resolvedAvatarUrl = b.avatar;
          }
        }

        const metaPatch = {};
        if (typeof b.bio === 'string') metaPatch.bio = b.bio;
        if (typeof b.office_notes === 'string') metaPatch.office_notes = b.office_notes;
        if (Array.isArray(b.spaces)) metaPatch.spaces = b.spaces;
        if (newPhotoKey) metaPatch.photo_s3_key = newPhotoKey;
        if (resolvedAvatarUrl) metaPatch.avatar_url = resolvedAvatarUrl;
        if (clearPhoto) {
          metaPatch.photo_s3_key = '';
          metaPatch.avatar_url = '';
        }

        const resUpd = await query(
          `UPDATE dossiers SET
            full_name = COALESCE(NULLIF($4, ''), full_name),
            status = COALESCE(NULLIF($5, ''), status),
            role = COALESCE(NULLIF($6, ''), role),
            suite = COALESCE(NULLIF($7, ''), suite),
            cpdc_issued = COALESCE($8, cpdc_issued),
            phone = COALESCE(NULLIF($9, ''), phone),
            location = COALESCE(NULLIF($10, ''), location),
            photo_s3_key = CASE
              WHEN $11::boolean THEN ''
              WHEN $12 <> '' THEN $12
              ELSE photo_s3_key
            END,
            metadata = COALESCE(metadata, '{}'::jsonb) || $13::jsonb,
            updated_at = NOW()
           WHERE ($1 <> '' AND id::text = $1)
              OR ($2 <> '' AND LOWER(email) = $2)
              OR ($3 <> '' AND LOWER(callsign) = $3)
           RETURNING *`,
          [
            id,
            email,
            callsign,
            b.name || b.full_name || '',
            b.status || '',
            b.role || '',
            b.suite || '',
            typeof b.cpdc_issued === 'boolean' ? b.cpdc_issued : null,
            b.phone || '',
            b.location || '',
            clearPhoto,
            newPhotoKey,
            JSON.stringify(metaPatch),
          ]
        );

        let savedRow = resUpd.rows[0] || null;
        if (!savedRow && (email || callsign)) {
          savedRow = await upsertDossierRecord({
            full_name: b.name || b.full_name || callsign || 'PHI Engineer',
            email: email || `${slug}@phi-lab.internal`,
            callsign: callsign || slug,
            role: b.role || (callsign === 'cgu43cdnkhza7sd' ? 'owner' : 'member'),
            suite: b.suite || 'phi-twin',
            status: b.status || 'accepted',
            cpdc_issued: typeof b.cpdc_issued === 'boolean' ? b.cpdc_issued : true,
            photo_s3_key: newPhotoKey,
            metadata: metaPatch,
          });
        }

        const finalAvatar = savedRow ? resolveDossierAvatarUrl(savedRow) : resolvedAvatarUrl;
        if (callsign) {
          await query(
            `UPDATE team_presence SET
               name = COALESCE(NULLIF($2, ''), name),
               avatar_url = CASE WHEN $3::boolean THEN '' WHEN $4 <> '' THEN $4 ELSE avatar_url END,
               last_seen = NOW()
             WHERE LOWER(user_id) = $1 OR LOWER(callsign) = $1`,
            [callsign, b.name || b.full_name || '', clearPhoto, finalAvatar]
          );
        }

        return res.status(200).json({
          ok: true,
          item: savedRow,
          avatar_url: finalAvatar,
          photo_s3_key: savedRow?.photo_s3_key || newPhotoKey || '',
          source: 'neon',
        });
      }

      if (channel === 'reports') {
        const id = String(req.query?.id || b.id || '').trim();
        if (!id) return res.status(400).json({ ok: false, error: 'Report id is required' });
        const attachmentsJson = Array.isArray(b.attachments) ? JSON.stringify(b.attachments) : null;
        const { rows } = await query(
          `UPDATE work_reports SET
             title = COALESCE(NULLIF($2, ''), title),
             summary = COALESCE($3, summary),
             suite = COALESCE(NULLIF($4, ''), suite),
             status = COALESCE(NULLIF($5, ''), status),
             hours_logged = COALESCE($6, hours_logged),
             attachments = COALESCE($7::jsonb, attachments),
             md_feedback = COALESCE($8, md_feedback),
             reviewed_by = COALESCE(NULLIF($9, ''), reviewed_by),
             reviewed_at = CASE WHEN $5 IN ('reviewed','approved','needs_changes') THEN NOW() ELSE reviewed_at END,
             updated_at = NOW()
           WHERE id::text = $1
           RETURNING *`,
          [
            id,
            b.title || '',
            typeof b.summary === 'string' ? b.summary : null,
            b.suite || '',
            b.status || '',
            typeof b.hours_logged === 'number' ? b.hours_logged : null,
            attachmentsJson,
            typeof b.md_feedback === 'string' ? b.md_feedback : null,
            b.reviewed_by || '',
          ]
        );
        const updated = rows[0] || null;
        return res.status(200).json({
          ok: Boolean(updated),
          item: updated
            ? {
                ...updated,
                hours_logged: Number(updated.hours_logged || 0),
                attachments: normalizeAttachments(updated.attachments),
              }
            : null,
          source: 'neon',
        });
      }

      return res.status(400).json({ ok: false, error: 'Unsupported PATCH channel' });
    }

    // ────────── DELETE REQUESTS ──────────
    if (req.method === 'DELETE') {
      const id = String(req.query?.id || req.body?.id || '').trim();
      if (!id) return res.status(400).json({ ok: false, error: 'id is required' });

      if (channel === 'reports') {
        await query(`DELETE FROM work_reports WHERE id::text = $1`, [id]);
        return res.status(200).json({ ok: true, deleted: id });
      }
      if (channel === 'directives') {
        await query(`DELETE FROM lab_directives WHERE id::text = $1`, [id]);
        return res.status(200).json({ ok: true, deleted: id });
      }
      return res.status(400).json({ ok: false, error: 'Unsupported DELETE channel' });
    }

    // ────────── POST REQUESTS ──────────
    if (req.method === 'POST') {
      const b = req.body || {};

      if (channel === 'presign-upload') {
        if (!isS3Configured()) {
          return res.status(500).json({ ok: false, error: 'Neon S3 is not configured' });
        }
        const folder = safeSlug(b.folder || 'deliverables', 'deliverables');
        const userSlug = safeSlug(b.userId || b.callsign || 'operator', 'operator');
        const fileName = String(b.fileName || 'deliverable.bin');
        const contentType = String(b.contentType || 'application/octet-stream');
        const key = buildSafeObjectKey(`${folder}/${userSlug}`, fileName);
        const putUrl = getPresignedPutUrl(key, contentType, 1800);
        const assetUrl = getPermanentAssetUrl(key, PUBLIC_ORIGIN);
        return res.status(200).json({
          ok: Boolean(putUrl),
          key,
          putUrl,
          assetUrl,
          contentType,
        });
      }

      if (channel === 'upload-asset') {
        if (!isS3Configured()) {
          return res.status(500).json({ ok: false, error: 'Neon S3 is not configured' });
        }
        const folder = safeSlug(b.folder || 'deliverables', 'deliverables');
        const userSlug = safeSlug(b.userId || b.callsign || 'operator', 'operator');
        const fileName = String(b.fileName || 'deliverable.bin');
        const up = await uploadDataUrl(`${folder}/${userSlug}`, fileName, b.dataUrl);
        if (!up?.key) {
          return res.status(400).json({ ok: false, error: 'Invalid base64 dataUrl payload' });
        }
        return res.status(200).json({
          ok: true,
          key: up.key,
          size: up.size,
          contentType: up.contentType,
          assetUrl: getPermanentAssetUrl(up.key, PUBLIC_ORIGIN),
        });
      }

      if (channel === 'applicants' || channel === 'dossiers') {
        let cvKey = b.cv_s3_key || '';
        let photoKey = b.photo_s3_key || '';
        const slug = safeSlug(b.callsign || b.email?.split('@')[0], 'applicant');
        if (isS3Configured()) {
          if (b.cv_data && !cvKey) {
            try { cvKey = (await uploadDataUrl(`dossiers/${slug}/cv`, b.cv_name || 'cv.pdf', b.cv_data))?.key || ''; } catch {}
          }
          if ((b.photo_data || b.avatar?.startsWith?.('data:image/')) && !photoKey) {
            try {
              photoKey = (await uploadDataUrl(`avatars/${slug}`, b.photo_name || 'photo.png', b.photo_data || b.avatar))?.key || '';
            } catch {}
          }
        }
        const avatarUrl = photoKey ? getPermanentAssetUrl(photoKey, PUBLIC_ORIGIN) : '';
        const saved = await upsertDossierRecord({
          full_name: b.full_name || b.name || 'Candidate',
          email: b.email,
          callsign: b.callsign || b.username || b.user_id,
          role: b.role || 'applicant',
          suite: b.suite || 'phi-twin',
          motivation: b.motivation || '',
          research_history: b.research_history || '',
          phone: b.phone || '',
          location: b.location || '',
          referral: b.referral || '',
          age: b.age || '',
          cv_name: b.cv_name || '',
          photo_name: b.photo_name || '',
          cv_s3_key: cvKey,
          photo_s3_key: photoKey,
          status: b.status || 'pending',
          cpdc_issued: typeof b.cpdc_issued === 'boolean' ? b.cpdc_issued : undefined,
          metadata: {
            ...(b.metadata || {}),
            ...(avatarUrl ? { avatar_url: avatarUrl, photo_s3_key: photoKey } : {}),
          },
        });
        return res.status(200).json({
          ok: true,
          id: saved.id,
          avatar_url: resolveDossierAvatarUrl(saved),
          item: saved,
          source: 'neon',
        });
      }

      if (channel === 'reports') {
        const authorId = String(b.author_id || b.user_id || 'operator').trim();
        const authorName = String(b.author_name || b.name || authorId).trim();
        const authorEmail = norm(b.author_email || b.email);
        const authorAvatar = String(b.author_avatar || b.avatar || '').trim();
        const suite = String(b.suite || 'phi-twin').trim();
        const title = String(b.title || 'Engineering Work Log').trim();
        const summary = String(b.summary || '').trim();
        const status = ['draft', 'submitted', 'reviewed', 'approved', 'needs_changes'].includes(b.status)
          ? b.status
          : 'submitted';
        const hoursLogged = Math.max(0, Number(b.hours_logged || 0) || 0);
        const attachments = Array.isArray(b.attachments) ? b.attachments : [];

        let row = null;
        if (b.id && /^[0-9a-f-]{36}$/i.test(String(b.id))) {
          const upd = await query(
            `UPDATE work_reports SET
               title = $2, summary = $3, suite = $4, status = $5,
               hours_logged = $6, attachments = $7::jsonb, author_avatar = COALESCE(NULLIF($8, ''), author_avatar),
               updated_at = NOW()
             WHERE id = $1::uuid
             RETURNING *`,
            [b.id, title, summary, suite, status, hoursLogged, JSON.stringify(attachments), authorAvatar]
          );
          row = upd.rows[0] || null;
        }

        if (!row) {
          const ins = await query(
            `INSERT INTO work_reports (
               author_id, author_name, author_email, author_avatar, suite, title, summary, status, hours_logged, attachments
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)
             RETURNING *`,
            [authorId, authorName, authorEmail, authorAvatar, suite, title, summary, status, hoursLogged, JSON.stringify(attachments)]
          );
          row = ins.rows[0];
        }

        if (status === 'submitted') {
          try {
            await query(
              `INSERT INTO telemetry (operator_id, operator_name, operator_email, role, event_type, suite, prompt_summary, metadata)
               VALUES ($1,$2,$3,'member','work_report_submitted',$4,$5,$6::jsonb)`,
              [
                authorId,
                authorName,
                authorEmail,
                suite,
                `Submitted report "${title}" (${hoursLogged}h, ${attachments.length} file(s))`,
                JSON.stringify({ report_id: row.id, attachments_count: attachments.length }),
              ]
            );
          } catch {}
        }

        return res.status(200).json({
          ok: true,
          item: {
            ...row,
            hours_logged: Number(row.hours_logged || 0),
            attachments: normalizeAttachments(row.attachments),
          },
          source: 'neon',
        });
      }

      if (channel === 'directives') {
        const title = String(b.title || '').trim();
        const content = String(b.content || '').trim();
        if (!title && !content) {
          return res.status(400).json({ ok: false, error: 'Directive title or content required' });
        }
        const { rows } = await query(
          `INSERT INTO lab_directives (author_id, author_name, suite, title, content, priority, pinned)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING *`,
          [
            String(b.author_id || 'cgu43cdnkhza7sd'),
            String(b.author_name || 'Managing Director'),
            String(b.suite || 'all'),
            title || 'Executive Facility Directive',
            content,
            ['normal', 'high', 'critical'].includes(b.priority) ? b.priority : 'normal',
            b.pinned !== false,
          ]
        );
        return res.status(200).json({ ok: true, item: rows[0], source: 'neon' });
      }

      if (channel === 'cards') {
        const callsign = norm(b.callsign || b.uid || b.userId || b.email?.split('@')[0]);
        const email = norm(b.email);
        const name = String(b.name || b.full_name || callsign || 'Operator').trim();
        const role = String(b.role || 'member').trim();
        const suite = String(b.suite || 'phi-twin').trim();
        const sig = String(b.sig || b.signature || `sovereign_neon_${callsign}_${Date.now()}`);
        const cardDataUrl = String(b.cpdc_card_data || b.card_png_base64 || '');

        let cardS3Key = '';
        if (cardDataUrl.startsWith('data:image/') && isS3Configured()) {
          try {
            const up = await uploadDataUrl(`cpdc/${callsign || 'card'}`, `${callsign || 'card'}.png`, cardDataUrl);
            cardS3Key = up?.key || '';
          } catch {}
        }

        const storedBlob = b.cpdc_payload
          ? JSON.stringify({
              cpdc_payload: b.cpdc_payload,
              cpdc_card_data: cardDataUrl && cardDataUrl.length < 350000 ? cardDataUrl : undefined,
            })
          : cardDataUrl;

        await query(
          `INSERT INTO cpdc_registry (applicant_email, applicant_name, callsign, role, suite, signature, card_png_base64, card_s3_key)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [email, name, callsign, role, suite, sig, storedBlob, cardS3Key]
        );

        if (email || callsign) {
          await query(
            `UPDATE dossiers SET
               status = 'accepted',
               cpdc_issued = TRUE,
               role = COALESCE(NULLIF($3, ''), role),
               suite = COALESCE(NULLIF($4, ''), suite),
               cpdc_card_url = COALESCE(NULLIF($5, ''), cpdc_card_url),
               metadata = COALESCE(metadata, '{}'::jsonb) || $6::jsonb,
               updated_at = NOW()
             WHERE ($1 <> '' AND LOWER(email) = $1) OR ($2 <> '' AND LOWER(callsign) = $2)`,
            [
              email,
              callsign,
              role,
              suite,
              cardS3Key ? getPermanentAssetUrl(cardS3Key, PUBLIC_ORIGIN) : '',
              JSON.stringify({
                cpdc_payload: b.cpdc_payload || undefined,
                spaces: b.spaces || b.access_matrix || [suite],
                cpdc_s3_key: cardS3Key || undefined,
                issued_at: new Date().toISOString(),
              }),
            ]
          );
        }

        if (email && b.notify !== false && isBrevoConfigured()) {
          try {
            await sendCpdcIssuedEmail({
              email,
              name,
              callsign,
              role,
              suite,
              cardPngBase64: cardDataUrl,
            });
          } catch (e) {
            console.warn('[Relay/Cards] Brevo notification warning:', e.message);
          }
        }

        return res.status(200).json({
          ok: true,
          callsign,
          card_s3_key: cardS3Key,
          card_url: cardS3Key ? getPermanentAssetUrl(cardS3Key, PUBLIC_ORIGIN) : '',
          source: 'neon',
        });
      }

      if (channel === 'telemetry') {
        const opId = String(b.operator_id || b.user_id || b.uid || 'anon').trim();
        const opName = String(b.operator_name || b.name || opId).trim();
        const opEmail = String(b.operator_email || b.email || '').trim().toLowerCase();
        const role = String(b.role || 'member').trim();
        const suite = String(b.suite || 'phi-twin').trim();
        const evType = String(b.event_type || 'event').trim();
        const summary = String(b.prompt_summary || b.summary || '').trim();
        const avatarUrl = String(b.avatar || b.avatar_url || '').trim();

        await Promise.all([
          query(
            `INSERT INTO telemetry (operator_id, operator_name, operator_email, role, event_type, suite, prompt_summary, metadata)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`,
            [opId, opName, opEmail, role, evType, suite, summary, JSON.stringify(b.metadata || {})]
          ),
          query(
            `INSERT INTO team_presence (user_id, name, callsign, suite, role, avatar_url, status, last_seen)
             VALUES ($1, $2, $3, $4, $5, $6, 'online', NOW())
             ON CONFLICT (user_id) DO UPDATE SET
               name = EXCLUDED.name,
               suite = EXCLUDED.suite,
               role = EXCLUDED.role,
               avatar_url = COALESCE(NULLIF(EXCLUDED.avatar_url, ''), team_presence.avatar_url),
               status = 'online',
               last_seen = NOW()`,
            [opId.toLowerCase(), opName, opId.toLowerCase(), suite, role, avatarUrl.startsWith('http') ? avatarUrl : '']
          ),
        ]);
        return res.status(200).json({ ok: true, source: 'neon' });
      }

      if (channel === 'messages') {
        const msgId = String(b.id || `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`);
        const senderAvatar = String(b.sender_avatar || '').trim();
        const safeAvatar = senderAvatar.startsWith('http') ? senderAvatar : '';
        const { rows } = await query(
          `INSERT INTO messages (id, room, sender, sender_name, sender_avatar, content, kind, reply_to, reply_preview)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (id) DO NOTHING
           RETURNING *`,
          [
            msgId,
            String(b.room || 'lab-general'),
            String(b.sender || b.user_id || 'peer'),
            String(b.sender_name || b.sender || 'Engineer'),
            safeAvatar,
            String(b.content || ''),
            String(b.kind || 'chat'),
            String(b.reply_to || ''),
            String(b.reply_preview || ''),
          ]
        );
        return res.status(200).json({ ok: true, message: rows[0] || { id: msgId }, source: 'neon' });
      }

      if (channel === 'timelogs') {
        const uid = String(b.user_id || b.member || 'operator').trim();
        const uName = String(b.user_name || b.name || uid).trim();
        const action = String(b.action || (b.type === 'out' ? 'clock-out' : 'clock-in')).trim();
        const suite = String(b.suite || 'phi-twin').trim();
        const note = String(b.note || '').trim();
        const durationMin = Math.max(0, Math.round(Number(b.duration_minutes || 0) || 0));
        const { rows } = await query(
          `INSERT INTO time_logs (user_id, user_name, action, suite, note, duration_minutes, timestamp)
           VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7::timestamptz, NOW()))
           RETURNING *`,
          [uid, uName, action, suite, note, durationMin, b.timestamp || null]
        );
        return res.status(200).json({ ok: true, log: rows[0], source: 'neon' });
      }

      if (channel === 'signals') {
        const sigId = String(b.sig_uid || b.id || `sig_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`);
        const ts = Number(b.ts || Date.now());
        await query(
          `INSERT INTO signal_events (id, target, sender, sender_name, room, signal_type, payload, ts)
           VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
           ON CONFLICT (id) DO NOTHING`,
          [
            sigId,
            String(b.to || '*'),
            String(b.from || 'peer'),
            String(b.fromName || b.sender_name || ''),
            String(b.room || 'global'),
            String(b.type || 'signal'),
            JSON.stringify(b),
            ts,
          ]
        );
        return res.status(200).json({ ok: true, id: sigId, serverTime: Date.now(), source: 'neon' });
      }

      return res.status(400).json({ ok: false, error: `Unknown POST channel: ${channel}` });
    }

    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  } catch (err) {
    console.error(`[API/Relay:${channel}] Error:`, err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
