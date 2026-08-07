const BASE='https://api.themoviedb.org/3';
exports.handler=async function(event){
  const token=process.env.TMDB_BEARER_TOKEN;
  if(!token)return json(500,{error:'TMDB_BEARER_TOKEN non configurato su Netlify'});
  const q=event.queryStringParameters||{}; const action=q.action||'';
  let path='';
  if(action==='search'){const query=(q.q||'').trim();if(!query)return json(400,{error:'Ricerca vuota'});path=`/search/multi?query=${encodeURIComponent(query)}&include_adult=false&language=it-IT&page=${Math.max(1,Number(q.page)||1)}`}
  else if(action==='trending'){path='/trending/all/week?language=it-IT'}
  else if(action==='popular'){const type=q.type==='tv'?'tv':'movie';path=`/${type}/popular?language=it-IT&page=1`}
  else if(action==='details'){const type=q.type==='tv'?'tv':q.type==='movie'?'movie':null;const id=String(q.id||'').replace(/\D/g,'');if(!type||!id)return json(400,{error:'Parametri non validi'});const extras=type==='tv'?'credits,content_ratings,external_ids,watch/providers':'credits,release_dates,external_ids,watch/providers';path=`/${type}/${id}?language=it-IT&append_to_response=${encodeURIComponent(extras)}`}
  else return json(400,{error:'Azione non valida'});
  try{const r=await fetch(BASE+path,{headers:{Authorization:`Bearer ${token}`,accept:'application/json'}});const data=await r.json();return json(r.status,data)}catch(e){return json(502,{error:'TMDB non raggiungibile',detail:e.message})}
};
function json(statusCode,body){return{statusCode,headers:{'content-type':'application/json; charset=utf-8','cache-control':'public, max-age=120'},body:JSON.stringify(body)}}
