/**
 * /api/projects.js
 * Plain Vercel Serverless Function — NOT Next.js, works alongside your
 * existing static HTML files with zero migration.
 *
 * Vercel auto-detects any file in /api/*.js at the project root and turns
 * it into a serverless endpoint at https://penelope-inc.vercel.app/api/projects
 *
 * Why this exists: your site is served over HTTPS (Vercel always does this),
 * but penelope-core backend is currently raw HTTP. Browsers block HTTPS
 * pages from calling HTTP endpoints directly ("mixed content"). This
 * function runs server-side on Vercel, fetches from penelope-core over
 * plain HTTP (server-to-server calls aren't subject to that browser rule),
 * then returns clean JSON to your page's client-side JS over HTTPS.
 *
 * Usage from suite pages (replaces direct PocketBase calls in pb-realtime.js):
 *   fetch('/api/projects?suite=phi-twin')
 *
 * Env var to set in Vercel dashboard (Settings -> Environment Variables):
 *   PENELOPE_API_BASE = http://46.62.217.83:3002
 *   (swap to https://api.yourdomain.com once SSL is live on penelope-core —
 *    nothing else changes)
 */

const PENELOPE_API_BASE = process.env.PENELOPE_API_BASE || 'http://46.62.217.83:3002';
const VALID_SUITES = ['phi-twin', 'phi-chain', 'phi-arc', 'phi-drone'];

export default async function handler(req, res) {
  // CORS: allow the browser JS on your own site to call this
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const { suite } = req.query;

  if (suite && !VALID_SUITES.includes(suite)) {
    return res.status(400).json({
      ok: false,
      error: `Unknown suite "${suite}". Expected one of: ${VALID_SUITES.join(', ')}`
    });
  }

  const path = suite ? `/api/projects/${suite}` : '/api/projects';

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const upstream = await fetch(`${PENELOPE_API_BASE}${path}`, {
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (!upstream.ok) {
      // Backend reachable but returned an error — still respond 200 with
      // degraded:true so the frontend shows "last synced" instead of crashing
      return res.status(200).json({
        ok: false,
        degraded: true,
        error: `Backend responded ${upstream.status}`,
        fetchedAt: new Date().toISOString()
      });
    }

    const data = await upstream.json();

    // Cache at Vercel's edge for 60s so we're not hammering penelope-core
    // on every single page view, but updates still land fast
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');

    return res.status(200).json({
      ok: true,
      degraded: false,
      suite: suite || null,
      projects: data.projects || data,
      fetchedAt: new Date().toISOString()
    });
  } catch (err) {
    clearTimeout(timeout);
    // penelope-core entirely unreachable (down, DNS issue, timeout)
    return res.status(200).json({
      ok: false,
      degraded: true,
      error: err.name === 'AbortError' ? 'Request timed out' : err.message,
      fetchedAt: new Date().toISOString(),
      message: 'Live data temporarily unavailable.'
    });
  }
}
