
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

function makeCookie(name,value,maxAge){
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

function clearCookie(name){
  return `${name}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

function redirect(location,cookies=[]){
  return {
    statusCode:302,
    headers:{
      Location:location,
      'Cache-Control':'no-store'
    },
    multiValueHeaders:cookies.length ? {
      'Set-Cookie':cookies
    } : undefined,
    body:''
  };
}

exports.handler=async event=>{
  const c=parseCookies(event);
  const q=event.queryStringParameters||{};

  const fallback='https://aiydiwdwy.netlify.app/musica.html';
  const ret=(c.spotify_return && /^https:\/\//.test(c.spotify_return))
    ? c.spotify_return
    : fallback;

  if(q.error){
    return redirect(
      ret+'?spotify_error='+encodeURIComponent(q.error),
      [
        clearCookie('spotify_oauth_state'),
        clearCookie('spotify_return'),
        clearCookie('spotify_site_user')
      ]
    );
  }

  if(!q.code || !q.state || q.state!==c.spotify_oauth_state){
    return redirect(
      ret+'?spotify_error=state',
      [
        clearCookie('spotify_oauth_state'),
        clearCookie('spotify_return'),
        clearCookie('spotify_site_user')
      ]
    );
  }

  const clientId=process.env.SPOTIFY_CLIENT_ID;
  const clientSecret=process.env.SPOTIFY_CLIENT_SECRET;

  if(!clientId||!clientSecret){
    return redirect(ret+'?spotify_error=config');
  }

  const redirectUri=`${new URL(ret).origin}/.netlify/functions/spotify-callback`;

  try{
    const body=new URLSearchParams({
      grant_type:'authorization_code',
      code:q.code,
      redirect_uri:redirectUri
    });

    const r=await fetch('https://accounts.spotify.com/api/token',{
      method:'POST',
      headers:{
        'Content-Type':'application/x-www-form-urlencoded',
        'Authorization':'Basic '+Buffer.from(
          clientId+':'+clientSecret
        ).toString('base64')
      },
      body
    });

    const d=await r.json();

    if(!r.ok || !d.refresh_token){
      throw new Error(
        d.error_description ||
        d.error ||
        'Token Spotify non ricevuto'
      );
    }

    return redirect(
      ret+'?spotify=connected',
      [
        makeCookie(
          'spotify_refresh',
          d.refresh_token,
          60*60*24*180
        ),
        makeCookie(
          'spotify_bound_user',
          c.spotify_site_user||'',
          60*60*24*180
        ),
        clearCookie('spotify_oauth_state'),
        clearCookie('spotify_return'),
        clearCookie('spotify_site_user')
      ]
    );

  }catch(e){
    return redirect(
      ret+'?spotify_error='+encodeURIComponent(e.message),
      [
        clearCookie('spotify_oauth_state'),
        clearCookie('spotify_return'),
        clearCookie('spotify_site_user')
      ]
    );
  }
};
