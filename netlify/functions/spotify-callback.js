
function cookies(event){
  const raw=event.headers.cookie||event.headers.Cookie||'';
  return Object.fromEntries(raw.split(';').map(x=>x.trim()).filter(Boolean).map(x=>{
    const i=x.indexOf('='); return [decodeURIComponent(x.slice(0,i)),decodeURIComponent(x.slice(i+1))]
  }));
}
function clear(name){return `${name}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`}
function setCookie(name,value,maxAge){
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`
}
exports.handler=async event=>{
  const c=cookies(event);
  const q=event.queryStringParameters||{};
  const fallback='https://aiydiwdwy.netlify.app/musica.html';
  const ret=(c.spotify_return&&/^https:\/\//.test(c.spotify_return))?c.spotify_return:fallback;
  if(q.error) return redirect(ret+'?spotify_error='+encodeURIComponent(q.error),[]);
  if(!q.code||!q.state||q.state!==c.spotify_oauth_state) return redirect(ret+'?spotify_error=state',[]);

  const id=process.env.SPOTIFY_CLIENT_ID,secret=process.env.SPOTIFY_CLIENT_SECRET;
  if(!id||!secret) return redirect(ret+'?spotify_error=config',[]);
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
        'Authorization':'Basic '+Buffer.from(id+':'+secret).toString('base64')
      },
      body
    });
    const d=await r.json();
    if(!r.ok||!d.refresh_token) throw new Error(d.error_description||'Token Spotify non ricevuto');

    const set=[
      setCookie('spotify_refresh',d.refresh_token,60*60*24*180),
      setCookie('spotify_bound_user',c.spotify_site_user||'',60*60*24*180),
      clear('spotify_oauth_state'),clear('spotify_return'),clear('spotify_site_user')
    ];
    return redirect(ret+'?spotify=connected',set);
  }catch(e){
    return redirect(ret+'?spotify_error='+encodeURIComponent(e.message),[]);
  }
};
function redirect(location,cookies){
  return{statusCode:302,headers:{Location:location,'Cache-Control':'no-store'},...(cookies.length?{multiValueHeaders:{'Set-Cookie':cookies}}:{}),body:''}
}
