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
  const cleanDate = String(payload.date || 'senza-data').replace(/[^0-9A-Za-z_-]/g, '-');
  const cleanUser = user.username;
  const folder = `cuddles-in-bed/${cleanDate}/${cleanUser || 'utente'}`;
  const timestamp = Math.floor(Date.now() / 1000);
  const toSign = `folder=${folder}&timestamp=${timestamp}${apiSecret}`;
  const signature = crypto.createHash('sha1').update(toSign).digest('hex');

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify({ cloudName, apiKey, timestamp, folder, signature })
  };
};
