
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
  const r=await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(key)}`,{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({idToken:token})
  });
  const d=await r.json();
  const email=(d.users?.[0]?.email||'').toLowerCase();
  if(!r.ok||!ALLOWED_EMAILS[email]) throw new Error('Account non autorizzato');
  return {email,username:ALLOWED_EMAILS[email]};
}
function cookie(name,value,opts=''){
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; ${opts}`;
}
exports.handler=async event=>{
  try{
    const user=await verifyFirebase(event);
    const id=process.env.SPOTIFY_CLIENT_ID;
    if(!id) return json(500,{error:'SPOTIFY_CLIENT_ID non configurato'});
    const returnTo=String(event.queryStringParameters?.returnTo||'').trim();
    if(!/^https:\/\/[A-Za-z0-9.-]+\/musica\.html(?:\?.*)?$/.test(returnTo))
      return json(400,{error:'returnTo non valido'});

    const state=crypto.randomBytes(24).toString('hex');
    const redirectUri=`${new URL(returnTo).origin}/.netlify/functions/spotify-callback`;
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
      client_id:id,
      scope:scopes,
      redirect_uri:redirectUri,
      state,
      show_dialog:'true'
    });

    return {
      statusCode:200,
      headers:{'Content-Type':'application/json','Cache-Control':'no-store'},
      multiValueHeaders:{'Set-Cookie':[
        cookie('spotify_oauth_state',state,'Max-Age=600'),
        cookie('spotify_return',returnTo,'Max-Age=600'),
        cookie('spotify_site_user',user.username,'Max-Age=600')
      ]},
      body:JSON.stringify({url:'https://accounts.spotify.com/authorize?'+params})
    };
  }catch(e){
    return json(401,{error:e.message});
  }
};
function json(statusCode,body){return{statusCode,headers:{'Content-Type':'application/json','Cache-Control':'no-store'},body:JSON.stringify(body)}}
