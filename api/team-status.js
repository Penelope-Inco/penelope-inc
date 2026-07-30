/**
 * /api/team-status.js
 * GET https://penelope-inc.vercel.app/api/team-status
 * Proxies penelope-core :3002/api/team/presence. Same mixed-content
 * workaround as /api/projects.js — see that file's header comment.
 */

const PENELOPE_API_BASE = process.env.PENELOPE_API_BASE || 'http://46.62.217.83:3002';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const upstream = await fetch(`${PENELOPE_API_BASE}/api/team/presence`, {
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (!upstream.ok) {
      return res.status(200).json({
        ok: false,
        degraded: true,
        error: `Backend responded ${upstream.status}`,
        peers: [],
        fetchedAt: new Date().toISOString()
      });
    }

    const data = await upstream.json();
    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');

    return res.status(200).json({
      ok: true,
      degraded: false,
      peers: data.peers || data,
      fetchedAt: new Date().toISOString()
    });
  } catch (err) {
    clearTimeout(timeout);
    return res.status(200).json({
      ok: false,
      degraded: true,
      error: err.name === 'AbortError' ? 'Request timed out' : err.message,
      peers: [],
      fetchedAt: new Date().toISOString()
    });
  }
}
