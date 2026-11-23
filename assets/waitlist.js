// Legacy duplicate stub removed; live endpoint lives at /api/waitlist.js
export default async function handler(req, res) {
  return res.status(410).json({ ok: false, error: 'Use /api/waitlist' });
}
