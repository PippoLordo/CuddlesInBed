
const ALLOWED_EMAILS={
  'cucci@cuddles.app':'cucci',
  'cicci@cuddles.app':'cicci'
};

function parseCookies(event){
  const raw=event.headers.cookie||event.headers.Cookie||'';
  const out={};

  for(const part of raw.split(';')){
    const i=part.indexOf('=');
    if(i<0) continue;

    const key=part.slice(0,i).trim();
    const value=part.slice(i+1).trim();

    try{
      out[decodeURIComponent(key)]=decodeURIComponent(value);
    }catch{
      out[key]=value;
    }
  }

  return out;
}

function bearer(event){
  const h=event.headers.authorization||event.headers.Authorization||'';
  return h.startsWith('Bearer ')?h.slice(7):'';
}

async function siteUser(event){
  const key=process.env.FIREBASE_WEB_API_KEY;
  const token=bearer(event);

  if(!key||!token){
    throw Object.assign(
      new Error('Non autenticato'),
      {status:401}
    );
  }

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
  const username=ALLOWED_EMAILS[email];

  if(!r.ok||!username){
    throw Object.assign(
      new Error('Account non autorizzato'),
      {status:403}
    );
  }

  return username;
}

async function accessToken(refreshToken){
  const clientId=process.env.SPOTIFY_CLIENT_ID;
  const clientSecret=process.env.SPOTIFY_CLIENT_SECRET;

  if(!clientId||!clientSecret){
    throw Object.assign(
      new Error('Spotify non configurato su Netlify'),
      {status:500}
    );
  }

  const body=new URLSearchParams({
    grant_type:'refresh_token',
    refresh_token:refreshToken
  });

  const r=await fetch(
    'https://accounts.spotify.com/api/token',
    {
      method:'POST',
      headers:{
        'Content-Type':'application/x-www-form-urlencoded',
        'Authorization':'Basic '+Buffer.from(
          clientId+':'+clientSecret
        ).toString('base64')
      },
      body
    }
  );

  const d=await r.json();

  if(!r.ok){
    throw Object.assign(
      new Error(
        d.error_description ||
        d.error ||
        'Collegamento Spotify scaduto'
      ),
      {status:401}
    );
  }

  return d.access_token;
}

async function spotifyApi(token,path,init={}){
  const r=await fetch(
    'https://api.spotify.com/v1'+path,
    {
      ...init,
      headers:{
        Authorization:'Bearer '+token,
        ...(init.body
          ? {'Content-Type':'application/json'}
          : {}),
        ...(init.headers||{})
      }
    }
  );

  if(r.status===204) return null;

  const d=await r.json().catch(()=>({}));

  if(!r.ok){
    throw Object.assign(
      new Error(
        d.error?.message ||
        'Errore Spotify'
      ),
      {status:r.status}
    );
  }

  return d;
}

function json(statusCode,body,cookies=[]){
  return {
    statusCode,
    headers:{
      'Content-Type':'application/json; charset=utf-8',
      'Cache-Control':'no-store'
    },
    multiValueHeaders:cookies.length
      ? {'Set-Cookie':cookies}
      : undefined,
    body:JSON.stringify(body)
  };
}

function clearSpotifyCookies(){
  return [
    'spotify_refresh=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0',
    'spotify_bound_user=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0'
  ];
}

exports.handler=async event=>{
  try{
    const username=await siteUser(event);
    const c=parseCookies(event);
    const action=event.queryStringParameters?.action||'';

    if(action==='disconnect'){
      return json(
        200,
        {ok:true},
        clearSpotifyCookies()
      );
    }

    if(!c.spotify_refresh){
      throw Object.assign(
        new Error('Spotify non collegato'),
        {status:401}
      );
    }

    if(c.spotify_bound_user!==username){
      throw Object.assign(
        new Error(
          'Spotify è collegato a un altro account del sito'
        ),
        {status:401}
      );
    }

    const token=await accessToken(c.spotify_refresh);
    const q=event.queryStringParameters||{};

    if(action==='token'){
      return json(200,{access_token:token});
    }

    if(action==='profile'){
      return json(
        200,
        await spotifyApi(token,'/me')
      );
    }

    if(action==='top'){
      const type=q.type==='artists'
        ? 'artists'
        : 'tracks';

      const range=[
        'short_term',
        'medium_term',
        'long_term'
      ].includes(q.range)
        ? q.range
        : 'short_term';

      const limit=Math.min(
        50,
        Math.max(1,Number(q.limit)||20)
      );

      return json(
        200,
        await spotifyApi(
          token,
          `/me/top/${type}?time_range=${range}&limit=${limit}`
        )
      );
    }

    if(action==='recent'){
      const limit=Math.min(
        50,
        Math.max(1,Number(q.limit)||20)
      );

      return json(
        200,
        await spotifyApi(
          token,
          `/me/player/recently-played?limit=${limit}`
        )
      );
    }

    if(action==='saved-tracks'){
      const limit=Math.min(
        50,
        Math.max(1,Number(q.limit)||20)
      );

      return json(
        200,
        await spotifyApi(
          token,
          `/me/tracks?limit=${limit}`
        )
      );
    }

    if(action==='search'){
      const term=String(q.q||'').trim();

      if(!term){
        return json(
          400,
          {error:'Ricerca vuota'}
        );
      }

      const limit=Math.min(
        50,
        Math.max(1,Number(q.limit)||20)
      );

      return json(
        200,
        await spotifyApi(
          token,
          `/search?q=${encodeURIComponent(term)}&type=track,album,artist&limit=${limit}`
        )
      );
    }

    let body={};

    try{
      body=JSON.parse(event.body||'{}');
    }catch{}

    if(action==='transfer'){
      await spotifyApi(
        token,
        '/me/player',
        {
          method:'PUT',
          body:JSON.stringify({
            device_ids:[body.device_id],
            play:!!body.play
          })
        }
      );

      return {
        statusCode:204,
        headers:{'Cache-Control':'no-store'},
        body:''
      };
    }

    if(action==='play'){
      const device=encodeURIComponent(
        body.device_id||''
      );

      const payload={};

      if(Array.isArray(body.uris)){
        payload.uris=body.uris;
      }

      if(body.context_uri){
        payload.context_uri=body.context_uri;
      }

      await spotifyApi(
        token,
        `/me/player/play${device
          ? '?device_id='+device
          : ''}`,
        {
          method:'PUT',
          body:JSON.stringify(payload)
        }
      );

      return {
        statusCode:204,
        headers:{'Cache-Control':'no-store'},
        body:''
      };
    }

    return json(
      400,
      {error:'Azione Spotify non valida'}
    );

  }catch(e){
    return json(
      e.status||500,
      {
        error:
          e.message ||
          'Spotify non disponibile'
      }
    );
  }
};
