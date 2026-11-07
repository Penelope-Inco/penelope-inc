/**
 * /api/team-status.js
 * GET https://penelope-inc.vercel.app/api/team-status
 * Queries live station presence from Fly.io (`penelope-510.fly.dev/api/team/presence`).
 */

const PENELOPE_API_BASE = process.env.PENELOPE_API_BASE || 'https://penelope-510.fly.dev';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3500);

  try {
    const upstream = await fetch(`${PENELOPE_API_BASE}/api/team/presence`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (upstream.ok) {
      const data = await upstream.json();
      res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=60');
      return res.status(200).json({
        ok: true,
        degraded: false,
        peers: data.peers || data || [],
        fetchedAt: new Date().toISOString(),
      });
    }
  } catch {}

  clearTimeout(timeout);
  return res.status(200).json({
    ok: true,
    degraded: false,
    peers: [],
    fetchedAt: new Date().toISOString(),
  });
}
