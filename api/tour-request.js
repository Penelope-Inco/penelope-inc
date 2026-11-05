/**
 * /api/tour-request.js
 * POST https://penelope-inc.vercel.app/api/tour-request
 * Forwards PHI Lab tour waiting-room signups (join.html "Tour" panel)
 * directly into Supabase (dossiers table) with live streaming to Commander Dashboard.
 */

import { supabase } from '../services/supabase.js';

const FLY_PB_BASE = process.env.PB_BASE || 'https://penelope-510.fly.dev';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  const { full_name, name, email, interest_note } = body || {};
  const applicantName = (full_name || name || '').trim();
  const applicantEmail = (email || '').trim().toLowerCase();

  if (!applicantName || !applicantEmail || !applicantEmail.includes('@')) {
    return res.status(400).json({ ok: false, error: 'Full name and a valid email address are required.' });
  }

  // 1. Primary Write to Supabase dossiers table
  try {
    const { data, error } = await supabase
      .from('dossiers')
      .insert([
        {
          full_name: applicantName,
          email: applicantEmail,
          callsign: applicantEmail.split('@')[0],
          suite: 'phi-twin',
          role: 'tour',
          motivation: interest_note ? `[TOUR WAITING ROOM] ${interest_note}` : 'Tour PHI Lab waiting room registration.',
          research_history: 'Tour & Demonstration Request',
          status: 'tour_waiting',
          metadata: {
            interest_note: interest_note || '',
            ip: req.headers['x-forwarded-for'] || req.socket?.remoteAddress,
            submitted_at: new Date().toISOString()
          }
        }
      ])
      .select()
      .single();

    if (!error && data) {
      console.log('[API/Tour] Successfully saved tour request to Supabase:', data.id);
      return res.status(200).json({
        ok: true,
        id: data.id,
        message: 'Received. We will reach out when tours open up.'
      });
    }
  } catch (err) {
    console.error('[API/Tour] Supabase error:', err);
  }

  // 2. Secondary replica to Fly.io PocketBase
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);
    await fetch(`${FLY_PB_BASE}/api/collections/applicants/records`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        name: applicantName,
        email: applicantEmail,
        suite: 'phi-twin',
        role: 'tour',
        motivation: interest_note || 'Tour request',
        status: 'pending'
      })
    });
    clearTimeout(timeout);
  } catch {}

  // 3. Always succeed gracefully so the user is never shown a timeout
  return res.status(200).json({
    ok: true,
    message: 'Received. We will reach out when tours open up.'
  });
}
