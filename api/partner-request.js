/**
 * /api/partner-request.js
 * POST https://penelope-inc.vercel.app/api/partner-request
 * Forwards MOU/partner applications directly to Supabase and Fly.io PocketBase.
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

  const { company_name, contact_name, email, service_category, pitch_url } = b;

  if (!company_name || !contact_name || !email) {
    return res.status(400).json({ ok: false, error: 'Company name, contact name, and email are required.' });
  }

  // 1. Supabase write
  try {
    const { data } = await supabase
      .from('dossiers')
      .insert([
        {
          full_name: contact_name,
          email: email.trim().toLowerCase(),
          callsign: email.split('@')[0],
          suite: 'general',
          role: 'partner',
          motivation: `[PARTNER / MOU REQUEST] Company: ${company_name} | Service: ${service_category || 'N/A'} | Pitch: ${pitch_url || 'N/A'}`,
          research_history: `MOU Proposal for ${company_name}`,
          status: 'partner_pending',
          metadata: {
            company_name,
            service_category,
            pitch_url,
            ip: req.headers['x-forwarded-for'] || req.socket?.remoteAddress,
            submitted_at: new Date().toISOString()
          }
        }
      ])
      .select()
      .single();

    if (data) {
      console.log('[API/Partner] Saved partner inquiry to Supabase:', data.id);
    }
  } catch (err) {
    console.error('[API/Partner] Supabase error:', err);
  }

  // 2. Mirror to Fly.io
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);
    await fetch(`${FLY_PB_BASE}/api/collections/applicants/records`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        name: contact_name,
        email,
        suite: 'phi-twin',
        role: 'partner',
        motivation: `MOU Partner Request: ${company_name} (${service_category})`,
        status: 'pending'
      })
    });
    clearTimeout(timeout);
  } catch {}

  return res.status(200).json({ ok: true, message: 'Partner inquiry received by PHI Lab leadership.' });
}
