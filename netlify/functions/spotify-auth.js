
const crypto=require('crypto');

const ALLOWED_EMAILS={
  'cucci@cuddles.app':'cucci',
  'cicci@cuddles.app':'cicci'
};

function parseBearer(event){
  const h=event.headers.authorization||event.headers.Authorization||'';
  return h.startsWith('Bearer ')?h.slice(7):'';
}

async function verifyFirebase(event){
  const key=process.env.FIREBASE_WEB_API_KEY;
  const token=parseBearer(event);

  if(!key||!token) throw new Error('Autenticazione Firebase mancante');

  const r=await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(key)}`,
    {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({idToken:token})
    }
  );

  const d=await r.json();
  const email=(d.users?.[0]?.email||'').toLowerCase();

  if(!r.ok||!ALLOWED_EMAILS[email]){
    throw new Error('Account non autorizzato');
  }

  return {
    email,
    username:ALLOWED_EMAILS[email]
  };
}

function makeCookie(name,value,maxAge=600){
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

function json(statusCode,body,extra={}){
  return {
    statusCode,
    headers:{
      'Content-Type':'application/json; charset=utf-8',
      'Cache-Control':'no-store',
      ...(extra.headers||{})
    },
    multiValueHeaders:extra.cookies?.length ? {
      'Set-Cookie':extra.cookies
    } : undefined,
    body:JSON.stringify(body)
  };
}

exports.handler=async event=>{
  try{
    const user=await verifyFirebase(event);

    const clientId=process.env.SPOTIFY_CLIENT_ID;
    if(!clientId){
      return json(500,{error:'SPOTIFY_CLIENT_ID non configurato'});
    }

    const returnTo=String(event.queryStringParameters?.returnTo||'').trim();

    if(!/^https:\/\/[A-Za-z0-9.-]+\/musica\.html(?:\?.*)?$/.test(returnTo)){
      return json(400,{error:'returnTo non valido'});
    }

    const state=crypto.randomBytes(24).toString('hex');
    const origin=new URL(returnTo).origin;
    const redirectUri=`${origin}/.netlify/functions/spotify-callback`;

    const scopes=[
      'user-top-read',
      'user-read-private',
      'user-read-email',
      'user-read-playback-state',
      'user-modify-playback-state',
      'user-read-recently-played',
      'user-library-read',
      'streaming'
    ].join(' ');

    const params=new URLSearchParams({
      response_type:'code',
      client_id:clientId,
      scope:scopes,
      redirect_uri:redirectUri,
      state,
      show_dialog:'true'
    });

    return json(
      200,
      {url:'https://accounts.spotify.com/authorize?'+params.toString()},
      {
        cookies:[
          makeCookie('spotify_oauth_state',state,600),
          makeCookie('spotify_return',returnTo,600),
          makeCookie('spotify_site_user',user.username,600)
        ]
      }
    );
  }catch(e){
    return json(401,{error:e.message});
  }
};
