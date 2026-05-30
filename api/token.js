const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// In-process cache — avoids hammering Google's token endpoint
let _cached = null; // { access_token, expiresAt }

export default async function handler(req, res) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN } = process.env;

  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN) {
    return res.status(503).json({ error: 'Google credentials not configured on server' });
  }

  // Return cached token if still valid (with 2-min buffer)
  if (_cached && _cached.expiresAt > Date.now() + 120_000) {
    return res.status(200).json({ access_token: _cached.access_token, source: 'cache' });
  }

  // Refresh from Google
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: GOOGLE_REFRESH_TOKEN,
      grant_type:    'refresh_token',
    }),
  });

  const d = await r.json();
  if (!r.ok || !d.access_token) {
    return res.status(502).json({ error: d.error_description || 'Failed to refresh token' });
  }

  _cached = { access_token: d.access_token, expiresAt: Date.now() + (d.expires_in || 3600) * 1000 };
  return res.status(200).json({ access_token: d.access_token, source: 'refreshed' });
}
