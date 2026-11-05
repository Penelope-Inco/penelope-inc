/**
 * /api/relay.js
 * PHI Lab Sovereign Cloud Backplane & Cross-Layer Intelligence Relay
 *
 * Provides a 24/7 always-on hybrid cloud relay when the primary Hetzner VPS is offline.
 * Channels supported:
 *  - applicants : Waiting Room personnel admission requests & status
 *  - cards      : Cryptographic CPDC card payloads issued by Founder to waiting applicants
 *  - messages   : Real-time General Room & Suite chat messages across workstations
 *  - telemetry  : Cross-Layer Intelligence feed (operator activity & Penelope AI interactions)
 *  - signals    : WebRTC P2P video/screen-share signaling (SDP offers/answers/ICE via Google STUN)
 */

import fs from 'fs';
import path from 'path';

const TMP_STATE_FILE = '/tmp/phi_lab_cloud_relay_v1.json';

function loadState() {
  if (globalThis.__PHI_RELAY_STATE__) {
    return globalThis.__PHI_RELAY_STATE__;
  }
  try {
    if (fs.existsSync(TMP_STATE_FILE)) {
      const raw = fs.readFileSync(TMP_STATE_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      globalThis.__PHI_RELAY_STATE__ = parsed;
      return parsed;
    }
  } catch {}

  const initial = {
    applicants: [],
    cards: {},
    messages: [
      {
        id: 'welcome-global-1',
        sender: 'system',
        sender_name: 'PHI Lab Hybrid Relay',
        content: 'DIMASA Hybrid Cloud Bridge online. Multi-station chat, WebRTC signaling, and Cross-Layer Intelligence are active.',
        room: 'global',
        created_at: new Date().toISOString(),
      },
    ],
    telemetry: [],
    signals: [],
    presence: {},
  };
  globalThis.__PHI_RELAY_STATE__ = initial;
  return initial;
}

function saveState(state) {
  globalThis.__PHI_RELAY_STATE__ = state;
  try {
    fs.writeFileSync(TMP_STATE_FILE, JSON.stringify(state), 'utf8');
  } catch {}
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const state = loadState();
  const channel = (req.query.channel || 'status').toLowerCase();

  try {
    // ─── GET REQUESTS ───
    if (req.method === 'GET') {
      if (channel === 'applicants') {
        return res.status(200).json({ ok: true, items: state.applicants || [] });
      }

      if (channel === 'cards') {
        const userId = (req.query.userId || req.query.email || '').toLowerCase();
        if (userId) {
          const card = state.cards[userId] || null;
          return res.status(200).json({ ok: true, card });
        }
        return res.status(200).json({ ok: true, cards: state.cards });
      }

      if (channel === 'messages') {
        const room = req.query.room || 'global';
        const roomMsgs = (state.messages || []).filter((m) => !room || m.room === room);
        return res.status(200).json({ ok: true, items: roomMsgs.slice(-150) });
      }

      if (channel === 'telemetry') {
        return res.status(200).json({
          ok: true,
          items: (state.telemetry || []).slice(0, 200),
          presence: state.presence || {},
        });
      }

      if (channel === 'signals') {
        const room = req.query.room || 'global';
        const since = Number(req.query.since || 0);
        const now = Date.now();
        // Clean signals older than 60s
        state.signals = (state.signals || []).filter((s) => now - s.ts < 60000);
        const matching = state.signals.filter(
          (s) => (!room || s.room === room) && s.ts > since
        );
        return res.status(200).json({ ok: true, items: matching, serverTime: now });
      }

      return res.status(200).json({
        ok: true,
        status: 'online',
        counts: {
          applicants: (state.applicants || []).length,
          cards: Object.keys(state.cards || {}).length,
          messages: (state.messages || []).length,
          telemetry: (state.telemetry || []).length,
          active_stations: Object.keys(state.presence || {}).length,
        },
      });
    }

    // ─── POST / PATCH REQUESTS ───
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};

    if (channel === 'applicants') {
      const email = (body.email || '').trim().toLowerCase();
      const id = (body.id || email.split('@')[0] || `user_${Date.now()}`).replace(/[^a-z0-9_-]/gi, '');
      const existingIdx = state.applicants.findIndex(
        (a) => a.id === id || (email && a.email?.toLowerCase() === email)
      );

      const record = {
        id,
        name: body.name || body.full_name || id,
        email,
        suite: body.suite || 'phi-twin',
        role: body.role || 'member',
        motivation: body.motivation || body.bio || 'Workstation Onboarding Request',
        status: body.status || 'pending',
        github: body.github || '',
        created: existingIdx >= 0 ? state.applicants[existingIdx].created : new Date().toISOString(),
        updated: new Date().toISOString(),
      };

      if (existingIdx >= 0) {
        state.applicants[existingIdx] = { ...state.applicants[existingIdx], ...record };
      } else {
        state.applicants.unshift(record);
      }
      saveState(state);
      return res.status(200).json({ ok: true, record });
    }

    if (channel === 'cards') {
      const targetId = (body.userId || body.uid || '').trim().toLowerCase();
      const targetEmail = (body.email || '').trim().toLowerCase();
      if (!targetId && !targetEmail) {
        return res.status(400).json({ ok: false, error: 'Missing userId or email' });
      }
      const cardData = {
        uid: body.userId || body.uid || targetId,
        name: body.name || 'Engineer',
        email: targetEmail,
        role: body.role || 'member',
        suite: body.suite || 'phi-twin',
        spaces: body.spaces || [body.suite || 'phi-twin'],
        access_matrix: body.access_matrix || body.spaces || [body.suite || 'phi-twin'],
        issued_at: Math.floor(Date.now() / 1000),
        sig: body.sig || `PHI_CLOUD_HMAC_${Date.now().toString(36)}`,
        cpdc_payload: body.cpdc_payload || null,
      };
      if (targetId) state.cards[targetId] = cardData;
      if (targetEmail) state.cards[targetEmail] = cardData;

      // Also mark applicant as accepted
      state.applicants = (state.applicants || []).map((a) => {
        if (a.id?.toLowerCase() === targetId || (targetEmail && a.email?.toLowerCase() === targetEmail)) {
          return { ...a, status: 'accepted', role: cardData.role, suite: cardData.suite };
        }
        return a;
      });

      saveState(state);
      return res.status(200).json({ ok: true, card: cardData });
    }

    if (channel === 'messages') {
      const msg = {
        id: body.id || `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        sender: body.sender || 'engineer',
        sender_name: body.sender_name || 'Engineer',
        content: body.content || '',
        room: body.room || 'global',
        reply_to: body.reply_to || null,
        reply_preview: body.reply_preview || null,
        created_at: body.created_at || new Date().toISOString(),
      };
      state.messages = state.messages || [];
      if (!state.messages.some((m) => m.id === msg.id)) {
        state.messages.push(msg);
        if (state.messages.length > 500) {
          state.messages = state.messages.slice(-500);
        }
      }
      saveState(state);
      return res.status(200).json({ ok: true, item: msg });
    }

    if (channel === 'telemetry') {
      const entry = {
        id: body.id || `tel_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        operator_id: body.operator_id || 'unknown',
        operator_name: body.operator_name || 'Workstation User',
        operator_email: body.operator_email || '',
        role: body.role || 'member',
        event_type: body.event_type || 'ai_query',
        suite: body.suite || 'penelope-ide',
        prompt_summary: body.prompt_summary || '',
        response_summary: body.response_summary || '',
        workspace: body.workspace || '',
        model_used: body.model_used || '',
        timestamp: new Date().toISOString(),
      };
      state.telemetry = state.telemetry || [];
      state.telemetry.unshift(entry);
      if (state.telemetry.length > 300) {
        state.telemetry = state.telemetry.slice(0, 300);
      }
      if (entry.operator_id) {
        state.presence = state.presence || {};
        state.presence[entry.operator_id] = {
          operator_id: entry.operator_id,
          operator_name: entry.operator_name,
          operator_email: entry.operator_email,
          role: entry.role,
          suite: entry.suite,
          last_seen: entry.timestamp,
          last_action: entry.prompt_summary || entry.event_type,
        };
      }
      saveState(state);
      return res.status(200).json({ ok: true, item: entry });
    }

    if (channel === 'signals') {
      const sig = {
        ...body,
        id: body.id || `sig_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        room: body.room || 'global',
        ts: Date.now(),
      };
      state.signals = state.signals || [];
      state.signals.push(sig);
      if (state.signals.length > 300) {
        state.signals = state.signals.slice(-300);
      }
      saveState(state);
      return res.status(200).json({ ok: true, item: sig });
    }

    return res.status(400).json({ ok: false, error: `Unknown channel: ${channel}` });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message || 'Relay error' });
  }
}
