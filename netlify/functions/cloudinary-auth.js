const ALLOWED = new Map([
  ['cucci@cuddles.app', 'cucci'],
  ['cicci@cuddles.app', 'cicci']
]);

async function requireUser(event) {
  const header = event.headers?.authorization || event.headers?.Authorization || '';
  const match = String(header).match(/^Bearer\s+(.+)$/i);
  if (!match) throw Object.assign(new Error('Accesso Firebase richiesto.'), { statusCode: 401 });

  const apiKey = process.env.FIREBASE_WEB_API_KEY;
  if (!apiKey) throw Object.assign(new Error('FIREBASE_WEB_API_KEY mancante su Netlify.'), { statusCode: 500 });

  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken: match[1] })
  });
  const data = await response.json().catch(() => ({}));
  const email = String(data.users?.[0]?.email || '').toLowerCase();
  if (!response.ok || !ALLOWED.has(email)) {
    throw Object.assign(new Error('Account non autorizzato.'), { statusCode: 403 });
  }
  return { email, username: ALLOWED.get(email) };
}

module.exports = { requireUser };
