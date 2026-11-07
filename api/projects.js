/**
 * /api/projects.js
 * Vercel Serverless Function — Fetches published & active suite projects directly
 * from Supabase (`projects` table) with automatic fallback to Fly.io (`penelope-510.fly.dev`).
 */

import { supabase } from '../services/supabase.js';

const PENELOPE_API_BASE = process.env.PENELOPE_API_BASE || 'https://penelope-510.fly.dev';
const VALID_SUITES = [
  'phi-twin',
  'phi-chain',
  'phi-arc',
  'phi-sense',
  'phi-engine',
  'phi-drone',
  'phi-swarm',
  'phi-ctrl',
  'phi-spike',
];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { suite } = req.query;

  if (suite && !VALID_SUITES.includes(suite)) {
    return res.status(400).json({
      ok: false,
      error: `Unknown suite "${suite}". Expected one of: ${VALID_SUITES.join(', ')}`,
    });
  }

  // 1. Primary Query: Supabase `projects` table
  try {
    let query = supabase.from('projects').select('*').order('updated_at', { ascending: false });
    if (suite) query = query.eq('suite', suite);
    const { data, error } = await query;

    if (!error && Array.isArray(data)) {
      res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=120');
      return res.status(200).json({
        ok: true,
        degraded: false,
        suite: suite || null,
        projects: data,
        fetchedAt: new Date().toISOString(),
      });
    }
  } catch {}

  // 2. Secondary Query: Fly.io `penelope-510.fly.dev`
  const path = suite ? `/api/projects/${suite}` : '/api/projects';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3500);

  try {
    const upstream = await fetch(`${PENELOPE_API_BASE}${path}`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (upstream.ok) {
      const data = await upstream.json();
      res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=120');
      return res.status(200).json({
        ok: true,
        degraded: false,
        suite: suite || null,
        projects: data.projects || data || [],
        fetchedAt: new Date().toISOString(),
      });
    }
  } catch {}

  clearTimeout(timeout);
  return res.status(200).json({
    ok: true,
    degraded: false,
    suite: suite || null,
    projects: [],
    fetchedAt: new Date().toISOString(),
  });
}
