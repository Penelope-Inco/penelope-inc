import crypto from 'node:crypto';

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function b64Url(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(String(input), 'utf8');
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function mintLiveKitJwt({ apiKey, apiSecret, roomName, identity, name, metadata, ttlSec = 21600 }) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64Url(
    JSON.stringify({
      iss: apiKey,
      sub: identity,
      nbf: now - 5,
      exp: now + ttlSec,
      name: name || identity,
      metadata: typeof metadata === 'string' ? metadata : JSON.stringify(metadata || {}),
      video: {
        room: roomName,
        roomJoin: true,
        canPublish: true,
        canSubscribe: true,
        canPublishData: true,
      },
    })
  );
  const signingInput = `${header}.${payload}`;
  const sig = crypto.createHmac('sha256', apiSecret).update(signingInput).digest();
  return `${signingInput}.${b64Url(sig)}`;
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const url = process.env.LIVEKIT_URL || '';
  const apiKey = process.env.LIVEKIT_API_KEY || '';
  const apiSecret = process.env.LIVEKIT_API_SECRET || '';
  const configured = Boolean(url && apiKey && apiSecret);

  if (req.method === 'GET') {
    return res.status(200).json({ ok: true, configured, url });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  if (!configured) {
    return res.status(503).json({ ok: false, error: 'LiveKit credentials not configured' });
  }

  try {
    const b = req.body || {};
    const roomName = String(b.roomName || b.room || 'phi-lab-general').trim();
    const identity = String(b.identity || b.userId || b.participantId || `op_${Date.now()}`).trim();
    const participantName = String(b.participantName || b.name || identity).trim();
    const token = mintLiveKitJwt({
      apiKey,
      apiSecret,
      roomName,
      identity,
      name: participantName,
      metadata: b.metadata || {},
    });
    return res.status(200).json({ ok: true, token, url, room: roomName, identity });
  } catch (err) {
    return res.status(400).json({ ok: false, error: err?.message || 'Invalid request' });
  }
}
