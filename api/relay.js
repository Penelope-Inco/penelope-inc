/**
 * /api/relay.js
 * PHI Lab Sovereign Cloud Backplane & Cross-Layer Intelligence Relay
 * Powered by Supabase (PostgreSQL) + In-Memory Fallback
 *
 * 24/7 always-on hybrid cloud relay handling:
 *  - dossiers / applicants : Website dossiers, visitor applications & Waiting Room state
 *  - cards                 : Cryptographic CPDC card issuance & verification
 *  - telemetry             : Cross-Layer Activity Feed across workstations and Penelope AI
 *  - messages              : Real-time Multi-laptop chat stream
 *  - signals               : WebRTC P2P signaling
 */

import fs from 'fs';
import { supabase } from '../services/supabase.js';

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
        content: 'DIMASA Hybrid Cloud Bridge online with Supabase Data Engine. Multi-station chat, WebRTC signaling, and Dossier Intelligence are active.',
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
      // 1. Dossiers / Applicants from Supabase
      if (channel === 'dossiers' || channel === 'applicants') {
        try {
          const { data: dossiers, error } = await supabase
            .from('dossiers')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(100);

          if (!error && dossiers && dossiers.length > 0) {
            const formatted = dossiers.map(d => ({
              id: d.id,
              name: d.full_name,
              full_name: d.full_name,
              email: d.email,
              callsign: d.callsign,
              suite: d.suite,
              role: d.role,
              motivation: d.motivation,
              research_history: d.research_history,
              phone: d.phone,
              location: d.location,
              status: d.status,
              cpdc_issued: d.cpdc_issued,
              cpdc_card_url: d.cpdc_card_url,
              created_at: d.created_at,
              created: d.created_at,
            }));
            return res.status(200).json({ ok: true, items: formatted, source: 'supabase' });
          }
        } catch (sbErr) {
          console.error('[Relay] Supabase dossiers query error:', sbErr);
        }

        // In-memory fallback
        return res.status(200).json({ ok: true, items: state.applicants || [], source: 'memory' });
      }

      // 2. CPDC Cards Issued
      if (channel === 'cards') {
        const email = (req.query.email || req.query.userId || '').toLowerCase().trim();
        if (email) {
          try {
            const { data: cardRow } = await supabase
              .from('cpdc_registry')
              .select('*')
              .eq('applicant_email', email)
              .maybeSingle();

            if (cardRow) {
              const card = {
                uid: cardRow.callsign,
                name: cardRow.applicant_name,
                email: cardRow.applicant_email,
                role: cardRow.role,
                suite: cardRow.suite,
                spaces: [cardRow.suite, '*'],
                access_matrix: [cardRow.suite, '*'],
                sig: cardRow.signature,
                cpdc_payload: cardRow.card_png_base64,
                issued_at: Math.floor(new Date(cardRow.issued_at).getTime() / 1000),
              };
              return res.status(200).json({ ok: true, card, source: 'supabase' });
            }
          } catch {}

          const card = state.cards[email] || null;
          return res.status(200).json({ ok: true, card, source: 'memory' });
        }

        return res.status(200).json({ ok: true, cards: state.cards });
      }

      // 3. Telemetry Stream
      if (channel === 'telemetry') {
        try {
          const { data: rows, error } = await supabase
            .from('telemetry')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(100);

          if (!error && rows) {
            return res.status(200).json({
              ok: true,
              items: rows,
              presence: state.presence || {},
              source: 'supabase'
            });
          }
        } catch {}

        return res.status(200).json({
          ok: true,
          items: (state.telemetry || []).slice(0, 200),
          presence: state.presence || {},
          source: 'memory'
        });
      }

      // 4. Messages Stream
      if (channel === 'messages') {
        const room = req.query.room || 'global';
        const roomMsgs = (state.messages || []).filter((m) => !room || m.room === room);
        return res.status(200).json({ ok: true, items: roomMsgs.slice(-150) });
      }

      // 5. WebRTC Signals
      if (channel === 'signals') {
        const room = req.query.room || 'global';
        const since = Number(req.query.since || 0);
        const now = Date.now();
        state.signals = (state.signals || []).filter((s) => now - s.ts < 60000);
        const matching = state.signals.filter((s) => (!room || s.room === room) && s.ts > since);
        return res.status(200).json({ ok: true, items: matching, serverTime: now });
      }

      // Default Health & Status
      let dbStatus = 'connecting';
      try {
        const { count } = await supabase.from('dossiers').select('*', { count: 'exact', head: true });
        dbStatus = `online (${count || 0} dossiers)`;
      } catch {
        dbStatus = 'offline';
      }

      return res.status(200).json({
        ok: true,
        status: 'online',
        database: dbStatus,
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

    // 1. Dossiers / Applicants write
    if (channel === 'dossiers' || channel === 'applicants') {
      const email = (body.email || '').trim().toLowerCase();
      const name = (body.name || body.full_name || email.split('@')[0] || 'Applicant').trim();
      const callsign = (body.callsign || email.split('@')[0] || '').toLowerCase().replace(/[^a-z0-9_]/g, '');

      try {
        await supabase
          .from('dossiers')
          .upsert(
            [
              {
                full_name: name,
                email,
                callsign,
                suite: body.suite || 'phi-twin',
                role: body.role || 'member',
                motivation: body.motivation || 'Workstation Onboarding Request',
                research_history: body.research_history || '',
                phone: body.phone || '',
                location: body.location || '',
                status: body.status || 'pending',
                updated_at: new Date().toISOString()
              }
            ],
            { onConflict: 'email' }
          );
      } catch (err) {
        console.error('[Relay] Supabase upsert dossier error:', err);
      }

      // In-memory update
      const existingIdx = state.applicants.findIndex(
        (a) => a.id === callsign || (email && a.email?.toLowerCase() === email)
      );
      const record = {
        id: callsign,
        name,
        full_name: name,
        email,
        callsign,
        suite: body.suite || 'phi-twin',
        role: body.role || 'member',
        motivation: body.motivation || 'Workstation Onboarding Request',
        status: body.status || 'pending',
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

    // 2. CPDC Card Issuance & Registration
    if (channel === 'cards') {
      const targetEmail = (body.email || '').trim().toLowerCase();
      const callsign = (body.userId || body.callsign || targetEmail.split('@')[0] || '').trim().toLowerCase();
      const name = body.name || 'Engineer';
      const role = body.role || 'member';
      const suite = body.suite || 'phi-twin';
      const sig = body.sig || `PHI_CLOUD_HMAC_${Date.now().toString(36)}`;
      const card_png_base64 = body.cpdc_payload || null;

      try {
        await supabase
          .from('cpdc_registry')
          .upsert(
            [
              {
                applicant_email: targetEmail,
                applicant_name: name,
                callsign,
                role,
                suite,
                signature: sig,
                card_png_base64,
                issued_at: new Date().toISOString(),
              }
            ],
            { onConflict: 'applicant_email' }
          );

        // Update dossier status to accepted
        await supabase
          .from('dossiers')
          .update({ status: 'accepted', cpdc_issued: true })
          .eq('email', targetEmail);
      } catch (err) {
        console.error('[Relay] Supabase cpdc insert error:', err);
      }

      const cardData = {
        uid: callsign,
        name,
        email: targetEmail,
        role,
        suite,
        spaces: [suite, '*'],
        access_matrix: [suite, '*'],
        issued_at: Math.floor(Date.now() / 1000),
        sig,
        cpdc_payload: card_png_base64,
      };

      if (callsign) state.cards[callsign] = cardData;
      if (targetEmail) state.cards[targetEmail] = cardData;
      saveState(state);
      return res.status(200).json({ ok: true, card: cardData });
    }

    // 3. Telemetry Ingestion
    if (channel === 'telemetry') {
      const payload = {
        operator_id: body.operator_id || 'anonymous',
        operator_name: body.operator_name || 'Workstation Operator',
        operator_email: body.operator_email || '',
        role: body.role || 'member',
        event_type: body.event_type || 'activity',
        suite: body.suite || 'workstation',
        prompt_summary: body.prompt_summary || '',
        metadata: body.metadata || {},
        created_at: new Date().toISOString(),
      };

      try {
        await supabase.from('telemetry').insert([payload]);
      } catch (err) {
        console.error('[Relay] Supabase telemetry insert error:', err);
      }

      state.telemetry.unshift(payload);
      if (state.telemetry.length > 500) state.telemetry = state.telemetry.slice(0, 500);

      if (body.operator_id) {
        state.presence[body.operator_id] = {
          id: body.operator_id,
          name: body.operator_name,
          email: body.operator_email,
          role: body.role,
          suite: body.suite,
          lastSeen: Date.now(),
        };
      }
      saveState(state);
      return res.status(200).json({ ok: true });
    }

    // 4. Multi-station Chat Messaging
    if (channel === 'messages') {
      const msg = {
        id: body.id || `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        sender: body.sender || 'operator',
        sender_name: body.sender_name || 'Engineer',
        content: body.content || '',
        room: body.room || 'global',
        kind: body.kind || 'chat',
        created_at: new Date().toISOString(),
      };
      state.messages.push(msg);
      if (state.messages.length > 1000) state.messages = state.messages.slice(-500);
      saveState(state);
      return res.status(200).json({ ok: true, message: msg });
    }

    // 5. WebRTC P2P Signals
    if (channel === 'signals') {
      const signalItem = {
        id: `sig_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        room: body.room || 'global',
        from: body.from || 'peer',
        to: body.to || 'all',
        payload: body.payload || {},
        ts: Date.now(),
      };
      state.signals.push(signalItem);
      saveState(state);
      return res.status(200).json({ ok: true, signal: signalItem });
    }

    return res.status(400).json({ ok: false, error: `Unknown channel: ${channel}` });
  } catch (err) {
    console.error('[Relay] Global Exception:', err);
    return res.status(500).json({ ok: false, error: String(err) });
  }
}
