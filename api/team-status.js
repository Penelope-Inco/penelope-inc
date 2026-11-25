import { query } from '../services/neon.js';

const CF_RELAY_BASE = (
  process.env.CLOUDFLARE_RELAY_HTTP || 'https://phi-lab-relay.penelope-phi.workers.dev'
).replace(/\/+$/, '');

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'POST') {
      const b = req.body || {};
      const userId = String(b.user_id || b.id || b.callsign || '').trim().toLowerCase();
      if (!userId) return res.status(400).json({ ok: false, error: 'user_id is required' });
      const avatarUrl = String(b.avatar || b.avatar_url || '').trim();
      await query(
        `INSERT INTO team_presence (user_id, name, callsign, suite, role, avatar_url, status, what_im_working_on, last_seen)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
         ON CONFLICT (user_id) DO UPDATE SET
           name = EXCLUDED.name,
           callsign = EXCLUDED.callsign,
           suite = EXCLUDED.suite,
           role = EXCLUDED.role,
           avatar_url = COALESCE(NULLIF(EXCLUDED.avatar_url, ''), team_presence.avatar_url),
           status = EXCLUDED.status,
           what_im_working_on = EXCLUDED.what_im_working_on,
           last_seen = NOW()`,
        [
          userId,
          b.name || b.full_name || userId,
          b.callsign || userId,
          b.suite || 'phi-twin',
          b.role || 'member',
          avatarUrl.startsWith('http') ? avatarUrl : '',
          b.status || 'online',
          b.what_im_working_on || '',
        ]
      );
      return res.status(200).json({ ok: true, source: 'neon' });
    }

    const peerMap = new Map();

    // 1. Live WebSocket presence from Cloudflare Durable Object Relay
    try {
      const cfRes = await fetch(`${CF_RELAY_BASE}/api/team/presence`, {
        signal: AbortSignal.timeout(2200),
      });
      if (cfRes.ok) {
        const cfData = await cfRes.json();
        const users = Array.isArray(cfData?.users) ? cfData.users : [];
        for (const u of users) {
          const k = String(u.id || '').toLowerCase();
          if (!k) continue;
          peerMap.set(k, {
            id: u.id,
            name: u.name || u.id,
            callsign: u.callsign || u.id,
            suite: u.suite || 'phi-twin',
            role: u.role || 'member',
            avatar: u.avatar || '',
            online: true,
            transport: 'cloudflare-ws',
          });
        }
      }
    } catch {}

    // 2. Recent Neon DB presence (active within last 5 minutes) + enrich missing avatars from dossiers
    const [presRes, dosRes] = await Promise.all([
      query(
        `SELECT user_id, name, callsign, suite, role, avatar_url, status, what_im_working_on, last_seen
         FROM team_presence
         WHERE last_seen > NOW() - INTERVAL '5 minutes'
         ORDER BY last_seen DESC`
      ),
      query(`SELECT callsign, email, full_name, photo_s3_key, metadata FROM dossiers`),
    ]);
    const origin = (process.env.PUBLIC_SITE_URL || 'https://penelope-inc.vercel.app').replace(/\/+$/, '');
    const dosAv = new Map();
    for (const d of dosRes.rows) {
      const k = d.photo_s3_key || d.metadata?.photo_s3_key || '';
      const av = k
        ? `${origin}/api/relay?channel=asset&key=${encodeURIComponent(k)}`
        : (d.metadata?.avatar_url && !String(d.metadata.avatar_url).includes('channel=avatar') ? d.metadata.avatar_url : '');
      if (!av) continue;
      if (d.callsign) dosAv.set(String(d.callsign).toLowerCase(), av);
      if (d.email) dosAv.set(String(d.email).toLowerCase(), av);
      if (d.full_name) dosAv.set(String(d.full_name).toLowerCase(), av);
    }
    for (const [k, existing] of peerMap.entries()) {
      if (!existing.avatar || String(existing.avatar).includes('channel=avatar')) {
        existing.avatar = dosAv.get(k) || dosAv.get(String(existing.name || '').toLowerCase()) || existing.avatar || '';
      }
    }
    for (const r of presRes.rows) {
      const k = String(r.user_id || '').toLowerCase();
      if (!k) continue;
      const fallbackAv = dosAv.get(k) || dosAv.get(String(r.name || '').toLowerCase()) || '';
      const resolvedAv = (r.avatar_url && !String(r.avatar_url).includes('channel=avatar') ? r.avatar_url : '') || fallbackAv;
      if (peerMap.has(k)) {
        const existing = peerMap.get(k);
        if (!existing.avatar && resolvedAv) existing.avatar = resolvedAv;
        if (!existing.what_im_working_on && r.what_im_working_on) existing.what_im_working_on = r.what_im_working_on;
        continue;
      }
      peerMap.set(k, {
        id: r.user_id,
        name: r.name || r.user_id,
        callsign: r.callsign || r.user_id,
        suite: r.suite || 'phi-twin',
        role: r.role || 'member',
        avatar: resolvedAv,
        status: r.status || 'online',
        what_im_working_on: r.what_im_working_on || '',
        online: true,
        transport: 'neon-heartbeat',
      });
    }

    const peers = Array.from(peerMap.values());
    return res.status(200).json({
      ok: true,
      count: peers.length,
      online: peers.length,
      online_count: peers.length,
      peers,
      users: peers,
      source: 'cloudflare+neon',
      ts: Date.now(),
    });
  } catch (err) {
    console.error('[API/TeamStatus] Error:', err);
    return res.status(200).json({ ok: true, count: 0, peers: [], users: [], error: err.message });
  }
}
