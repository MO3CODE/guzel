import crypto from 'crypto';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// Session token = HMAC-SHA256(pin + timestamp_hour) — stateless, valid for 1 hour window
function makeToken(pin) {
  const secret = process.env.SESSION_SECRET || 'fallback-secret-change-me';
  const hour = Math.floor(Date.now() / 3_600_000); // changes every hour
  return crypto.createHmac('sha256', secret).update(`${pin}:${hour}`).digest('hex');
}

export function verifySessionToken(token) {
  if (!token) return false;
  const pin = process.env.SITE_PIN || '';
  const secret = process.env.SESSION_SECRET || 'fallback-secret-change-me';
  const hour = Math.floor(Date.now() / 3_600_000);
  // Accept current hour or previous hour (grace period)
  for (const h of [hour, hour - 1]) {
    const expected = crypto.createHmac('sha256', secret).update(`${pin}:${h}`).digest('hex');
    if (crypto.timingSafeEqual(Buffer.from(token, 'hex'), Buffer.from(expected, 'hex'))) return true;
  }
  return false;
}

export default function handler(req, res) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const sitePin = process.env.SITE_PIN;
  if (!sitePin) return res.status(500).json({ error: 'SITE_PIN not configured on server' });

  const { pin } = req.body || {};
  if (!pin) return res.status(400).json({ error: 'PIN required' });

  // Constant-time comparison to prevent timing attacks
  const pinBuf  = Buffer.from(String(pin).padEnd(32));
  const siteBuf = Buffer.from(String(sitePin).padEnd(32));
  const match = crypto.timingSafeEqual(pinBuf.slice(0, 32), siteBuf.slice(0, 32))
    && pin.length === sitePin.length;

  if (!match) {
    return res.status(401).json({ error: 'رمز غير صحيح' });
  }

  return res.status(200).json({ token: makeToken(sitePin) });
}
