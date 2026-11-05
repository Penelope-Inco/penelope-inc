/**
 * /api/contact.js
 * POST https://penelope-inc.vercel.app/api/contact
 * Records general contact & inquiry submissions directly into Supabase (dossiers table)
 * for instant review inside the PHI-LAB Commander Dashboard.
 */

import { supabase } from '../services/supabase.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  const { department, name, email, message } = req.body || {};

  if (!name || !email || !message) {
    return res.status(400).json({ ok: false, error: 'Name, email, and message are required.' });
  }

  try {
    const { data, error } = await supabase
      .from('dossiers')
      .insert([
        {
          full_name: name.trim(),
          email: email.trim().toLowerCase(),
          role: 'contact',
          suite: department || 'general',
          motivation: `[${(department || 'GENERAL').toUpperCase()} INQUIRY] ${message}`,
          research_history: `Department requested: ${department || 'General'}`,
          status: 'contact_inquiry',
          metadata: {
            department,
            ip: req.headers['x-forwarded-for'] || req.socket?.remoteAddress,
            submitted_at: new Date().toISOString()
          }
        }
      ])
      .select()
      .single();

    if (!error && data) {
      return res.status(200).json({ ok: true, id: data.id, message: 'Message logged in Commander Ledger.' });
    }
  } catch (err) {
    console.error('[API/Contact] Supabase error:', err);
  }

  return res.status(200).json({ ok: true });
}
