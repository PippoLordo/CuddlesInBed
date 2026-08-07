let cachedToken=null,cachedUntil=0;
async function getToken(){
  const id=process.env.TWITCH_CLIENT_ID,secret=process.env.TWITCH_CLIENT_SECRET;
  if(!id||!secret) throw new Error('TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET non configurati su Netlify');
  if(cachedToken && Date.now()<cachedUntil) return {token:cachedToken,id};
  const u='https://id.twitch.tv/oauth2/token?client_id='+encodeURIComponent(id)+'&client_secret='+encodeURIComponent(secret)+'&grant_type=client_credentials';
  const r=await fetch(u,{method:'POST'}); const d=await r.json();
  if(!r.ok) throw new Error(d.message||'Autenticazione Twitch/IGDB fallita');
  cachedToken=d.access_token; cachedUntil=Date.now()+Math.max(60000,(Number(d.expires_in||3600)-120)*1000); return {token:cachedToken,id};
}
async function query(endpoint,body){const {token,id}=await getToken();const r=await fetch('https://api.igdb.com/v4/'+endpoint,{method:'POST',headers:{'Client-ID':id,'Authorization':'Bearer '+token,'Accept':'application/json'},body});const d=await r.json();if(!r.ok)throw new Error(d.message||'Errore IGDB');return d}
exports.handler=async event=>{try{const q=event.queryStringParameters||{},action=q.action||'';
 if(action==='search'){const term=String(q.q||'').trim().replace(/"/g,'');if(!term)return json(400,{error:'Ricerca vuota'});const page=Math.max(1,Number(q.page)||1),offset=(page-1)*20;const body=`search "${term}"; fields id,name,slug,summary,cover.url,first_release_date,total_rating,total_rating_count,platforms.name,genres.name; where version_parent = null; limit 20; offset ${offset};`;return json(200,{results:await query('games',body),page});}
 if(action==='details'){const id=String(q.id||'').replace(/\D/g,'');if(!id)return json(400,{error:'ID non valido'});const fields='id,name,slug,summary,storyline,cover.url,first_release_date,genres.name,themes.name,platforms.name,game_modes.name,player_perspectives.name,involved_companies.company.name,involved_companies.developer,involved_companies.publisher,franchises.name,collection.name,total_rating,total_rating_count,rating,rating_count,hypes,follows,websites.url,websites.type,screenshots.url,videos.video_id,dlcs.name,expansions.name,remakes.name,remasters.name,similar_games.name,parent_game.name,age_ratings.organization,age_ratings.rating_category,release_dates.human,release_dates.platform.name,release_dates.region';const d=await query('games',`fields ${fields}; where id = ${id}; limit 1;`);return json(200,d[0]||{});}
 return json(400,{error:'Azione non valida'});
 }catch(e){return json(502,{error:e.message||'IGDB non raggiungibile'})}};
function json(statusCode,body){return{statusCode,headers:{'content-type':'application/json; charset=utf-8','cache-control':'public, max-age=120'},body:JSON.stringify(body)}}
