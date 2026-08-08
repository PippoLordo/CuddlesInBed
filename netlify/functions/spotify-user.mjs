
const ALLOWED = {
  "cucci@cuddles.app": "cucci",
  "cicci@cuddles.app": "cicci"
};

function bearer(req){
  const h = req.headers.get("authorization") || "";
  return h.startsWith("Bearer ") ? h.slice(7) : "";
}

async function siteUser(req){
  const key = process.env.FIREBASE_WEB_API_KEY;
  const token = bearer(req);
  if(!key || !token) throw Object.assign(new Error("Non autenticato"), {status:401});

  const r = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(key)}`,
    {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({idToken:token})
    }
  );
  const d = await r.json();
  const email = (d.users?.[0]?.email || "").toLowerCase();
  const username = ALLOWED[email];

  if(!r.ok || !username){
    throw Object.assign(new Error("Account non autorizzato"), {status:403});
  }
  return username;
}

async function refreshAccess(refreshToken){
  const id = process.env.SPOTIFY_CLIENT_ID;
  const secret = process.env.SPOTIFY_CLIENT_SECRET;
  if(!id || !secret) throw Object.assign(new Error("Spotify non configurato"), {status:500});

  const body = new URLSearchParams({
    grant_type:"refresh_token",
    refresh_token:refreshToken
  });

  const r = await fetch("https://accounts.spotify.com/api/token", {
    method:"POST",
    headers:{
      "Content-Type":"application/x-www-form-urlencoded",
      Authorization:"Basic " + Buffer.from(`${id}:${secret}`).toString("base64")
    },
    body
  });
  const d = await r.json();
  if(!r.ok){
    throw Object.assign(
      new Error(d.error_description || d.error || "Collegamento Spotify scaduto"),
      {status:401}
    );
  }
  return d.access_token;
}

async function sp(token, path, init={}){
  const r = await fetch(`https://api.spotify.com/v1${path}`, {
    ...init,
    headers:{
      Authorization:`Bearer ${token}`,
      ...(init.body ? {"Content-Type":"application/json"} : {}),
      ...(init.headers || {})
    }
  });

  if(r.status === 204) return null;
  const d = await r.json().catch(()=>({}));
  if(!r.ok){
    throw Object.assign(new Error(d.error?.message || "Errore Spotify"), {status:r.status});
  }
  return d;
}

function json(body,status=200){
  return Response.json(body, {
    status,
    headers:{"Cache-Control":"no-store"}
  });
}

export default async (req, context) => {
  try{
    const username = await siteUser(req);
    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "";

    if(action === "status"){
      return json({
        username,
        hasRefresh:!!context.cookies.get("spotify_refresh"),
        boundUser:context.cookies.get("spotify_bound_user") || null
      });
    }

    if(action === "disconnect"){
      context.cookies.delete({name:"spotify_refresh", path:"/"});
      context.cookies.delete({name:"spotify_bound_user", path:"/"});
      return json({ok:true});
    }

    const refresh = context.cookies.get("spotify_refresh");
    const bound = context.cookies.get("spotify_bound_user");

    if(!refresh){
      throw Object.assign(new Error("Spotify non collegato"), {status:401});
    }
    if(bound !== username){
      throw Object.assign(new Error("Spotify è collegato a un altro account del sito"), {status:401});
    }

    const token = await refreshAccess(refresh);

    if(action === "token") return json({access_token:token});
    if(action === "profile") return json(await sp(token,"/me"));

    if(action === "top"){
      const type = url.searchParams.get("type") === "artists" ? "artists" : "tracks";
      const range = ["short_term","medium_term","long_term"].includes(url.searchParams.get("range"))
        ? url.searchParams.get("range")
        : "short_term";
      const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit")) || 20));
      return json(await sp(token,`/me/top/${type}?time_range=${range}&limit=${limit}`));
    }

    if(action === "recent"){
      const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit")) || 20));
      return json(await sp(token,`/me/player/recently-played?limit=${limit}`));
    }

    if(action === "saved-tracks"){
      const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit")) || 20));
      return json(await sp(token,`/me/tracks?limit=${limit}`));
    }

    if(action === "search"){
      const term = (url.searchParams.get("q") || "").trim();
      if(!term) return json({error:"Ricerca vuota"},400);
      const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit")) || 20));
      return json(await sp(
        token,
        `/search?q=${encodeURIComponent(term)}&type=track,album,artist&limit=${limit}`
      ));
    }

    let body={};
    if(req.method !== "GET"){
      body = await req.json().catch(()=>({}));
    }

    if(action === "transfer"){
      await sp(token,"/me/player",{
        method:"PUT",
        body:JSON.stringify({device_ids:[body.device_id], play:!!body.play})
      });
      return new Response(null,{status:204});
    }

    if(action === "play"){
      const payload={};
      if(Array.isArray(body.uris)) payload.uris=body.uris;
      if(body.context_uri) payload.context_uri=body.context_uri;
      const device = body.device_id ? `?device_id=${encodeURIComponent(body.device_id)}` : "";
      await sp(token,`/me/player/play${device}`,{
        method:"PUT",
        body:JSON.stringify(payload)
      });
      return new Response(null,{status:204});
    }

    return json({error:"Azione Spotify non valida"},400);

  }catch(e){
    return json({error:e.message || "Spotify non disponibile"}, e.status || 500);
  }
};
