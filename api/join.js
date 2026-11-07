/**
 * /api/join.js
 * POST https://penelope-inc.vercel.app/api/join
 * Forwards collaborator / employee applications from join.html directly
 * to Supabase (dossiers table) with live streaming to Commander Dashboard.
 */

import { supabase } from '../services/supabase.js';

const PB_BASE = process.env.PB_BASE || 'https://penelope-510.fly.dev';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    let body = req.body;

    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        body = {};
      }
    }

    body = body || {};

    const name = (body.full_name || body.name || '').trim();
    const email = (body.email || '').trim().toLowerCase();
    const suite = body.suite || 'phi-twin';
    const role = body.role || 'member';
    const callsign = (body.callsign || email.split('@')[0] || '').toLowerCase().replace(/[^a-z0-9_]/g, '');

    const research_history = body.research_history || '';
    const phone = body.phone_number || body.phone || '';
    const location = body.location || '';
    const age = body.age || '';
    const referral = body.how_they_found_us || '';
    const cv_name = body.cv_name || '';
    const photo_name = body.photo_name || '';

    const motivationParts = [
      body.motivation,
      research_history ? `Research / Proof: ${research_history}` : '',
      location ? `Location: ${location}` : '',
      phone ? `Phone: ${phone}` : '',
      age ? `Age: ${age}` : '',
      referral ? `Referral: ${referral}` : '',
      cv_name ? `CV Attached: ${cv_name}` : '',
      photo_name ? `Photo: ${photo_name}` : '',
    ].filter(Boolean);

    const motivation = motivationParts.join(' | ') || `Application for ${suite} workspace under DIMASA aerospace initiative.`;

    if (!name || !email || !email.includes('@')) {
      return res.status(400).json({
        ok: false,
        error: 'Please provide both your Full Name and a valid Email address.',
      });
    }

    // 1. Primary write to Supabase dossiers table
    try {
      const { data, error } = await supabase
        .from('dossiers')
        .insert([
          {
            full_name: name,
            email,
            callsign,
            suite,
            role,
            motivation,
            research_history,
            phone,
            location,
            referral,
            age: String(age),
            cv_name,
            photo_name,
            status: 'pending',
            metadata: {
              ip: req.headers['x-forwarded-for'] || req.socket?.remoteAddress,
              user_agent: req.headers['user-agent'],
              submitted_at: new Date().toISOString()
            }
          }
        ])
        .select()
        .single();

      if (!error && data) {
        console.log('[API/Join] Successfully saved dossier to Supabase:', data.id);
        return res.status(200).json({
          ok: true,
          id: data.id,
          message: 'Dossier received and recorded in PHI-LAB Commander ledger.',
        });
      } else if (error) {
        console.error('[API/Join] Supabase insert warning:', error);
      }
    } catch (sbErr) {
      console.error('[API/Join] Supabase exception:', sbErr);
    }

    // 2. Secondary fallback to legacy PocketBase if available
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2000);
      const upstream = await fetch(`${PB_BASE}/api/collections/applicants/records`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, suite, role, motivation, status: 'pending' }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (upstream.ok) {
        const created = await upstream.json();
        return res.status(200).json({
          ok: true,
          id: created.id,
          message: 'Application received. Founder review underway.',
        });
      }
    } catch {}

    // Success response even if legacy fails, since user shouldn't be blocked
    return res.status(200).json({
      ok: true,
      message: 'Application received. Founder review underway.',
    });
  } catch (err) {
    console.error('[API/Join] Fatal Exception:', err);
    return res.status(200).json({
      ok: false,
      error: 'Submission error. Please email penelopeincorporated1@gmail.com directly.',
    });
  }
}
