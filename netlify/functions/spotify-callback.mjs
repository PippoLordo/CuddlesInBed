
function opts(maxAge){
  return {
    path:"/",
    httpOnly:true,
    secure:true,
    sameSite:"Lax",
    maxAge
  };
}

function redirect(location){
  return new Response(null, {
    status:302,
    headers:{
      Location:location,
      "Cache-Control":"no-store"
    }
  });
}

export default async (req, context) => {
  const url = new URL(req.url);
  const q = url.searchParams;

  const stateCookie = context.cookies.get("spotify_oauth_state");
  const returnCookie = context.cookies.get("spotify_return");
  const siteUser = context.cookies.get("spotify_site_user");

  const fallback = "https://aiydiwdwy.netlify.app/musica.html";
  const ret = returnCookie && /^https:\/\//.test(returnCookie)
    ? returnCookie
    : fallback;

  const cleanup = () => {
    context.cookies.delete({name:"spotify_oauth_state", path:"/"});
    context.cookies.delete({name:"spotify_return", path:"/"});
    context.cookies.delete({name:"spotify_site_user", path:"/"});
  };

  if(q.get("error")){
    cleanup();
    return redirect(`${ret}?spotify_error=${encodeURIComponent(q.get("error"))}`);
  }

  if(!q.get("code") || !q.get("state") || q.get("state") !== stateCookie){
    cleanup();
    return redirect(`${ret}?spotify_error=state`);
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if(!clientId || !clientSecret){
    cleanup();
    return redirect(`${ret}?spotify_error=config`);
  }

  const redirectUri = `${new URL(ret).origin}/.netlify/functions/spotify-callback`;

  try{
    const body = new URLSearchParams({
      grant_type:"authorization_code",
      code:q.get("code"),
      redirect_uri:redirectUri
    });

    const r = await fetch("https://accounts.spotify.com/api/token", {
      method:"POST",
      headers:{
        "Content-Type":"application/x-www-form-urlencoded",
        Authorization:"Basic " + Buffer.from(`${clientId}:${clientSecret}`).toString("base64")
      },
      body
    });

    const d = await r.json();
    if(!r.ok || !d.refresh_token){
      throw new Error(d.error_description || d.error || "Refresh token non ricevuto");
    }

    context.cookies.set({
      name:"spotify_refresh",
      value:d.refresh_token,
      ...opts(60*60*24*180)
    });

    context.cookies.set({
      name:"spotify_bound_user",
      value:siteUser || "",
      ...opts(60*60*24*180)
    });

    cleanup();
    return redirect(`${ret}?spotify=connected`);
  }catch(e){
    cleanup();
    return redirect(`${ret}?spotify_error=${encodeURIComponent(e.message)}`);
  }
};
