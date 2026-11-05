/**
 * /api/waitlist.js
 * POST https://penelope-inc.vercel.app/api/waitlist
 * Forwards digital twin masterclass/training signups directly into Supabase (dossiers table)
 * and mirrors to Fly.io PocketBase.
 */

import { supabase } from '../services/supabase.js';

const FLY_PB_BASE = process.env.PB_BASE || 'https://penelope-510.fly.dev';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  let b = req.body || {};
  if (typeof b === 'string') {
    try { b = JSON.parse(b); } catch { b = {}; }
  }

  const name = (b.name || b.full_name || '').trim();
  const email = (b.email || '').trim().toLowerCase();
  const program = b.program || 'Digital Twin Masterclass';

  if (!email || !email.includes('@')) {
    return res.status(400).json({ ok: false, error: 'Valid email address is required.' });
  }

  // 1. Write to Supabase
  try {
    const { data } = await supabase
      .from('dossiers')
      .insert([
        {
          full_name: name || email.split('@')[0],
          email,
          callsign: email.split('@')[0],
          suite: 'phi-twin',
          role: 'trainee',
          motivation: `[MASTERCLASS WAITLIST] Program: ${program}`,
          research_history: 'Education & Training Ingestion',
          status: 'waitlist_pending',
          metadata: {
            program,
            ip: req.headers['x-forwarded-for'] || req.socket?.remoteAddress,
            submitted_at: new Date().toISOString()
          }
        }
      ])
      .select()
      .single();

    if (data) {
      console.log('[API/Waitlist] Saved waitlist candidate to Supabase:', data.id);
    }
  } catch (err) {
    console.error('[API/Waitlist] Supabase error:', err);
  }

  // 2. Mirror to Fly.io PocketBase
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);
    await fetch(`${FLY_PB_BASE}/api/collections/applicants/records`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        name: name || email.split('@')[0],
        email,
        suite: 'phi-twin',
        role: 'trainee',
        motivation: `Digital Twin Training waitlist request: ${program}`,
        status: 'pending',
      }),
    });
    clearTimeout(timeout);
  } catch {}

  return res.status(200).json({ ok: true, message: 'Added to masterclass queue.' });
}
