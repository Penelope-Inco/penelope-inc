import { query, upsertDossierRecord } from '../services/neon.js';
import { isS3Configured, uploadDataUrl, getPresignedUrl } from '../services/s3.js';
import { sendCpdcIssuedEmail, isBrevoConfigured } from '../services/email.js';

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function norm(v) {
  return String(v || '').trim().toLowerCase();
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const channel = String(req.query?.channel || req.body?.channel || 'applicants').toLowerCase();

  try {
    // ────────── HEALTH / SYNC STATUS ──────────
    if (channel === 'sync-status' || channel === 'health') {
      const dbCheck = await query('SELECT NOW() AS now');
      return res.status(200).json({
        ok: true,
        mode: 'neon+s3+brevo+cloudflare',
        database: 'neon-postgres',
        dbTime: dbCheck.rows[0]?.now,
        s3Configured: isS3Configured(),
        brevoConfigured: isBrevoConfigured(),
        ts: Date.now(),
      });
    }

    // ────────── S3 PRESIGNED URL REFRESH ──────────
    if (channel === 's3-url' && req.method === 'GET') {
      const key = String(req.query?.key || '').trim();
      if (!key || key.includes('..')) {
        return res.status(400).json({ ok: false, error: 'Valid key is required' });
      }
      const url = getPresignedUrl(key, 3600);
      return res.status(200).json({ ok: Boolean(url), url, key });
    }

    // ────────── GET REQUESTS ──────────
    if (req.method === 'GET') {
      if (channel === 'applicants' || channel === 'dossiers') {
        const { rows } = await query(
          `SELECT * FROM dossiers ORDER BY created_at DESC LIMIT 250`
        );
        const formatted = rows.map((d) => ({
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
          motivation: d.motivation,
          research_history: d.research_history,
          phone: d.phone,
          location: d.location,
          referral: d.referral,
          age: d.age,
          cv_name: d.cv_name,
          photo_name: d.photo_name,
          cv_s3_key: d.cv_s3_key || d.metadata?.cv_s3_key || '',
          photo_s3_key: d.photo_s3_key || d.metadata?.photo_s3_key || '',
          cv_url: (d.cv_s3_key || d.metadata?.cv_s3_key)
            ? getPresignedUrl(d.cv_s3_key || d.metadata?.cv_s3_key, 3600)
            : '',
          photo_url: (d.photo_s3_key || d.metadata?.photo_s3_key)
            ? getPresignedUrl(d.photo_s3_key || d.metadata?.photo_s3_key, 3600)
            : '',
          cpdc_issued: d.cpdc_issued,
          cpdc_card_url: d.cpdc_card_url,
          metadata: d.metadata,
          created_at: d.created_at,
          updated_at: d.updated_at,
        }));
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
          const cardUrl = cardRow.card_s3_key ? getPresignedUrl(cardRow.card_s3_key, 3600) : '';
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

        // Fallback to dossiers metadata if CPDC issued directly on dossier
        const dosRes = await query(
          `SELECT * FROM dossiers
           WHERE ($1 <> '' AND LOWER(email) = $1)
              OR ($2 <> '' AND (LOWER(callsign) = $2 OR id::text = $2))
           ORDER BY updated_at DESC LIMIT 1`,
          [email, userId]
        );
        const dRow = dosRes.rows[0];
        if (dRow && (dRow.cpdc_issued || dRow.metadata?.cpdc_payload || dRow.metadata?.cpdc_card_data)) {
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

      if (channel === 'telemetry') {
        const limit = Math.min(200, Math.max(10, Number(req.query?.limit || 60)));
        const [telRes, presRes] = await Promise.all([
          query(`SELECT * FROM telemetry ORDER BY created_at DESC LIMIT $1`, [limit]),
          query(
            `SELECT user_id, name, suite, role, last_seen
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

    // ────────── PATCH REQUESTS (e.g. dossier clearance updates) ──────────
    if (req.method === 'PATCH') {
      const b = req.body || {};
      if (channel === 'applicants' || channel === 'dossiers') {
        const id = String(req.query?.id || b.id || '').trim();
        const email = norm(req.query?.email || b.email);
        const callsign = norm(req.query?.callsign || b.callsign);

        const resUpd = await query(
          `UPDATE dossiers SET
            status = COALESCE(NULLIF($4, ''), status),
            role = COALESCE(NULLIF($5, ''), role),
            suite = COALESCE(NULLIF($6, ''), suite),
            cpdc_issued = COALESCE($7, cpdc_issued),
            updated_at = NOW()
           WHERE ($1 <> '' AND id::text = $1)
              OR ($2 <> '' AND LOWER(email) = $2)
              OR ($3 <> '' AND LOWER(callsign) = $3)
           RETURNING *`,
          [
            id,
            email,
            callsign,
            b.status || '',
            b.role || '',
            b.suite || '',
            typeof b.cpdc_issued === 'boolean' ? b.cpdc_issued : null,
          ]
        );
        return res.status(200).json({ ok: true, item: resUpd.rows[0] || null, source: 'neon' });
      }
      return res.status(400).json({ ok: false, error: 'Unsupported PATCH channel' });
    }

    // ────────── POST REQUESTS ──────────
    if (req.method === 'POST') {
      const b = req.body || {};

      if (channel === 'applicants' || channel === 'dossiers') {
        let cvKey = b.cv_s3_key || '';
        let photoKey = b.photo_s3_key || '';
        const slug = norm(b.callsign || b.email?.split('@')[0] || 'applicant').replace(/[^a-z0-9]/g, '') || 'applicant';
        if (isS3Configured()) {
          if (b.cv_data && !cvKey) {
            try { cvKey = (await uploadDataUrl(`dossiers/${slug}/cv`, b.cv_name || 'cv.pdf', b.cv_data))?.key || ''; } catch {}
          }
          if (b.photo_data && !photoKey) {
            try { photoKey = (await uploadDataUrl(`dossiers/${slug}/photo`, b.photo_name || 'photo.png', b.photo_data))?.key || ''; } catch {}
          }
        }
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
          metadata: b.metadata || {},
        });
        return res.status(200).json({ ok: true, id: saved.id, item: saved, source: 'neon' });
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
               metadata = metadata || $5::jsonb,
               updated_at = NOW()
             WHERE ($1 <> '' AND LOWER(email) = $1) OR ($2 <> '' AND LOWER(callsign) = $2)`,
            [
              email,
              callsign,
              role,
              suite,
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

        return res.status(200).json({ ok: true, callsign, card_s3_key: cardS3Key, source: 'neon' });
      }

      if (channel === 'telemetry') {
        const opId = String(b.operator_id || b.user_id || b.uid || 'anon').trim();
        const opName = String(b.operator_name || b.name || opId).trim();
        const opEmail = String(b.operator_email || b.email || '').trim().toLowerCase();
        const role = String(b.role || 'member').trim();
        const suite = String(b.suite || 'phi-twin').trim();
        const evType = String(b.event_type || 'event').trim();
        const summary = String(b.prompt_summary || b.summary || '').trim();

        await Promise.all([
          query(
            `INSERT INTO telemetry (operator_id, operator_name, operator_email, role, event_type, suite, prompt_summary, metadata)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`,
            [opId, opName, opEmail, role, evType, suite, summary, JSON.stringify(b.metadata || {})]
          ),
          query(
            `INSERT INTO team_presence (user_id, name, callsign, suite, role, status, last_seen)
             VALUES ($1, $2, $3, $4, $5, 'online', NOW())
             ON CONFLICT (user_id) DO UPDATE SET
               name = EXCLUDED.name,
               suite = EXCLUDED.suite,
               role = EXCLUDED.role,
               status = 'online',
               last_seen = NOW()`,
            [opId.toLowerCase(), opName, opId.toLowerCase(), suite, role]
          ),
        ]);
        return res.status(200).json({ ok: true, source: 'neon' });
      }

      if (channel === 'messages') {
        const msgId = String(b.id || `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`);
        const { rows } = await query(
          `INSERT INTO messages (id, room, sender, sender_name, content, kind)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (id) DO NOTHING
           RETURNING *`,
          [
            msgId,
            String(b.room || 'lab-general'),
            String(b.sender || b.user_id || 'peer'),
            String(b.sender_name || b.sender || 'Engineer'),
            String(b.content || ''),
            String(b.kind || 'chat'),
          ]
        );
        return res.status(200).json({ ok: true, message: rows[0] || { id: msgId }, source: 'neon' });
      }

      if (channel === 'timelogs') {
        const uid = String(b.user_id || b.member || 'operator').trim();
        const uName = String(b.user_name || b.name || uid).trim();
        const action = String(b.action || (b.type === 'out' ? 'clock-out' : 'clock-in')).trim();
        const suite = String(b.suite || 'phi-twin').trim();
        const { rows } = await query(
          `INSERT INTO time_logs (user_id, user_name, action, suite, timestamp)
           VALUES ($1, $2, $3, $4, COALESCE($5::timestamptz, NOW()))
           RETURNING *`,
          [uid, uName, action, suite, b.timestamp || null]
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
