const { requireUser } = require('./cloudinary-auth');
const crypto = require('crypto');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Metodo non consentito' }) };
  }
  let user;
  try { user = await requireUser(event); }
  catch (error) { return { statusCode: error.statusCode || 401, body: JSON.stringify({ error: error.message }) }; }

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Variabili Cloudinary mancanti su Netlify.' }) };
  }

  let payload = {};
  try { payload = JSON.parse(event.body || '{}'); } catch (_) {}
  const publicId = String(payload.publicId || '');
  const resourceType = payload.resourceType === 'video' ? 'video' : 'image';
  if (!publicId) return { statusCode: 400, body: JSON.stringify({ error: 'publicId mancante' }) };

  const timestamp = Math.floor(Date.now() / 1000);
  const toSign = `public_id=${publicId}&timestamp=${timestamp}${apiSecret}`;
  const signature = crypto.createHash('sha1').update(toSign).digest('hex');
  const form = new URLSearchParams({ public_id: publicId, timestamp: String(timestamp), api_key: apiKey, signature });
  const url = `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/${resourceType}/destroy`;

  try {
    const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form.toString() });
    const result = await response.json();
    if (!response.ok || !['ok', 'not found'].includes(result.result)) {
      return { statusCode: 502, body: JSON.stringify({ error: result.error?.message || `Cloudinary: ${result.result || 'errore'}` }) };
    }
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(result) };
  } catch (error) {
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};
