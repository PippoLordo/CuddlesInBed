
import crypto from "node:crypto";

const ALLOWED = {
  "cucci@cuddles.app": "cucci",
  "cicci@cuddles.app": "cicci"
};

function bearer(req){
  const h = req.headers.get("authorization") || "";
  return h.startsWith("Bearer ") ? h.slice(7) : "";
}

async function verifyFirebase(req){
  const key = process.env.FIREBASE_WEB_API_KEY;
  const token = bearer(req);
  if(!key || !token) throw new Error("Autenticazione Firebase mancante");

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
  if(!r.ok || !ALLOWED[email]) throw new Error("Account non autorizzato");
  return {email, username:ALLOWED[email]};
}

function cookieOptions(maxAge){
  return {
    path:"/",
    httpOnly:true,
    secure:true,
    sameSite:"Lax",
    maxAge
  };
}

export default async (req, context) => {
  try{
    const user = await verifyFirebase(req);
    const clientId = process.env.SPOTIFY_CLIENT_ID;
    if(!clientId){
      return Response.json({error:"SPOTIFY_CLIENT_ID non configurato"}, {status:500});
    }

    const url = new URL(req.url);
    const returnTo = (url.searchParams.get("returnTo") || "").trim();
    if(!/^https:\/\/[A-Za-z0-9.-]+\/musica\.html(?:\?.*)?$/.test(returnTo)){
      return Response.json({error:"returnTo non valido"}, {status:400});
    }

    const state = crypto.randomBytes(24).toString("hex");
    const origin = new URL(returnTo).origin;
    const redirectUri = `${origin}/.netlify/functions/spotify-callback`;

    context.cookies.set({
      name:"spotify_oauth_state",
      value:state,
      ...cookieOptions(600)
    });
    context.cookies.set({
      name:"spotify_return",
      value:returnTo,
      ...cookieOptions(600)
    });
    context.cookies.set({
      name:"spotify_site_user",
      value:user.username,
      ...cookieOptions(600)
    });

    const scopes = [
      "user-top-read",
      "user-read-private",
      "user-read-email",
      "user-read-playback-state",
      "user-modify-playback-state",
      "user-read-recently-played",
      "user-library-read",
      "streaming"
    ].join(" ");

    const p = new URLSearchParams({
      response_type:"code",
      client_id:clientId,
      scope:scopes,
      redirect_uri:redirectUri,
      state,
      show_dialog:"true"
    });

    return Response.json(
      {url:`https://accounts.spotify.com/authorize?${p.toString()}`},
      {headers:{"Cache-Control":"no-store"}}
    );
  }catch(e){
    return Response.json({error:e.message}, {status:401});
  }
};
