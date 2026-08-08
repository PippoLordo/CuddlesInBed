
let spotifyConnected=false;
let spotifyProfileData=null;
let currentRange='short_term';
let currentPlayer=null;
let playerDeviceId=null;
let currentState=null;
let seekTimer=null;
let topCache={};
let recentTracksCache=[];

const $=id=>document.getElementById(id);

function spotifyAuthHeaders(){
    return auth.currentUser
        ? auth.currentUser.getIdToken().then(token=>({'Authorization':`Bearer ${token}`}))
        : Promise.resolve({});
}

async function spotifyUser(action, params={}, options={}){
    const headers=await spotifyAuthHeaders();
    const qs=new URLSearchParams({action,...params});
    const res=await fetch('/.netlify/functions/spotify-user?'+qs.toString(),{
        method: options.method || 'GET',
        headers:{
            ...headers,
            ...(options.body ? {'Content-Type':'application/json'} : {})
        },
        credentials:'include',
        body: options.body ? JSON.stringify(options.body) : undefined
    });

    if(res.status===204) return null;

    const data=await res.json().catch(()=>({}));
    if(!res.ok){
        const err=new Error(data.error || 'Spotify non disponibile');
        err.status=res.status;
        throw err;
    }
    return data;
}

async function startSpotifyLogin(){
    try{
        const headers=await spotifyAuthHeaders();
        const returnTo=location.origin+'/musica.html';
        const res=await fetch('/.netlify/functions/spotify-auth?returnTo='+encodeURIComponent(returnTo),{
            headers,
            credentials:'include'
        });
        const data=await res.json();
        if(!res.ok) throw new Error(data.error||'Impossibile avviare Spotify');
        location.href=data.url;
    }catch(e){
        setError(e.message);
    }
}

async function disconnectSpotify(){
    try{
        await spotifyUser('disconnect',{}, {method:'POST'});
    }catch(_){}
    location.href='musica.html';
}

function setSpotifyConnectionUI(connected){
    spotifyConnected=connected;
    $('connectSpotifyButton')?.classList.toggle('hidden',connected);
    $('disconnectSpotifyButton')?.classList.toggle('hidden',!connected);
    if(!connected && $('spotifyProfile')) $('spotifyProfile').textContent='SPOTIFY NON COLLEGATO';
}

function imageOf(item){
    return item?.album?.images?.[0]?.url || item?.images?.[0]?.url || '';
}
function artistsOf(track){
    return (track?.artists||[]).map(a=>a.name).join(', ');
}
function formatMs(ms){
    if(!Number.isFinite(Number(ms))) return '0:00';
    const s=Math.max(0,Math.floor(Number(ms)/1000));
    return Math.floor(s/60)+':'+String(s%60).padStart(2,'0');
}
function esc(v=''){ return escapeHtml(v); }

function musicCard(item, artist=false){
    const image=imageOf(item);
    const subtitle=artist ? 'Artista' : artistsOf(item);
    const click=artist
        ? `openSpotifyExternal('${esc(item.external_urls?.spotify||'')}')`
        : `playTrackUri('${esc(item.uri||'')}')`;
    return `<article class="music-card ${artist?'artist-card':''}" onclick="${click}">
        ${image?`<img loading="lazy" src="${esc(image)}" alt="">`:'<img src="favicon.png" alt="">'}
        <strong>${esc(item.name||'Senza titolo')}</strong>
        <span>${esc(subtitle||'Spotify')}</span>
    </article>`;
}

function trackRow(track,index=0){
    const image=imageOf(track);
    return `<article class="track-row" onclick="playTrackUri('${esc(track.uri||'')}')">
        <div class="track-number">${index?index:''}</div>
        ${image?`<img loading="lazy" src="${esc(image)}" alt="">`:'<img src="favicon.png" alt="">'}
        <div class="track-main">
            <strong>${esc(track.name||'Senza titolo')}</strong>
            <span>${esc(artistsOf(track)||'')}</span>
        </div>
        <div class="track-album">${esc(track.album?.name||'')}</div>
        <div class="track-time">${formatMs(track.duration_ms)}</div>
        <button class="track-action" onclick="event.stopPropagation();openSpotifyExternal('${esc(track.external_urls?.spotify||'')}')">SPOTIFY</button>
    </article>`;
}

function renderCards(id,items,artist=false){
    const box=$(id); if(!box) return;
    box.innerHTML=items?.length ? items.map(x=>musicCard(x,artist)).join('') : '<div class="empty-state">Nessun dato disponibile.</div>';
}
function renderRows(id,items){
    const box=$(id); if(!box) return;
    box.innerHTML=items?.length ? items.map((x,i)=>trackRow(x,i+1)).join('') : '<div class="empty-state">Nessun brano disponibile.</div>';
}

function setQuickCovers(tracks=[],artists=[]){
    const covers=[
        imageOf(tracks[0]), imageOf(artists[0]), imageOf(tracks[1]),
        imageOf(tracks[2]), imageOf(tracks[3]), imageOf(artists[1])
    ];
    covers.forEach((src,i)=>{
        const img=$('quick'+(i+1)+'Cover');
        if(img && src) img.src=src;
    });
}

async function loadProfile(){
    try{
        const p=await spotifyUser('profile');
        spotifyProfileData=p;
        setSpotifyConnectionUI(true);
        if($('spotifyProfile')){
            $('spotifyProfile').textContent=(p.display_name || 'SPOTIFY').toUpperCase();
        }
        return true;
    }catch(e){
        if(e.status===401 || e.status===403){
            setSpotifyConnectionUI(false);
            return false;
        }
        throw e;
    }
}

async function loadHome(){
    if(!spotifyConnected) return;
    try{
        const [tracks,artists,recent]=await Promise.all([
            spotifyUser('top',{type:'tracks',range:'short_term',limit:'20'}),
            spotifyUser('top',{type:'artists',range:'short_term',limit:'16'}),
            spotifyUser('recent',{limit:'20'}).catch(()=>({items:[]}))
        ]);
        topCache.short_term={tracks:tracks.items||[],artists:artists.items||[]};
        recentTracksCache=(recent.items||[]).map(x=>x.track).filter(Boolean);

        renderCards('rotationGrid',(tracks.items||[]).slice(0,12),false);
        renderCards('homeArtists',(artists.items||[]).slice(0,12),true);
        renderRows('recentTracks',recentTracksCache.slice(0,12));
        setQuickCovers(tracks.items||[],artists.items||[]);
    }catch(e){ setError(e.message); }
}

async function loadTop(range=currentRange){
    if(!spotifyConnected) return;
    currentRange=range;
    document.querySelectorAll('.range-button').forEach(b=>b.classList.toggle('active',b.dataset.range===range));
    try{
        let cached=topCache[range];
        if(!cached){
            const [tracks,artists]=await Promise.all([
                spotifyUser('top',{type:'tracks',range,limit:'50'}),
                spotifyUser('top',{type:'artists',range,limit:'40'})
            ]);
            cached=topCache[range]={tracks:tracks.items||[],artists:artists.items||[]};
        }
        renderRows('topTracks',cached.tracks);
        renderCards('topArtists',cached.artists,true);
    }catch(e){ setError(e.message); }
}

async function searchSpotify(){
    const q=$('musicSearchInput')?.value.trim();
    if(!q) return;
    const box=$('musicSearchResults');
    if(box) box.innerHTML='<div class="loading">Ricerca…</div>';
    try{
        const data=await spotifyUser('search',{q,limit:'30'});
        const tracks=data.tracks?.items||[];
        renderRows('musicSearchResults',tracks);
    }catch(e){ setError(e.message); }
}

async function loadLibrary(){
    if(!spotifyConnected) return;
    try{
        const saved=await spotifyUser('saved-tracks',{limit:'50'});
        const tracks=(saved.items||[]).map(x=>x.track).filter(Boolean);
        renderRows('savedTracks',tracks);

        const albums=new Map();
        const artists=new Map();
        tracks.forEach(t=>{
            if(t.album?.id) albums.set(t.album.id,t.album);
            (t.artists||[]).forEach(a=>{
                if(a.id && !artists.has(a.id)) artists.set(a.id,{...a,images:[]});
            });
        });
        renderCards('savedAlbums',[...albums.values()].slice(0,30),false);
        renderCards('savedArtists',[...artists.values()].slice(0,30),true);
    }catch(e){ setError(e.message); }
}

function openSpotifyExternal(url){
    if(url) window.open(url,'_blank','noopener');
}

async function getPlaybackToken(){
    const data=await spotifyUser('token');
    return data.access_token;
}

function initWebPlayback(){
    if(!spotifyConnected || !window.Spotify || currentPlayer) return;

    currentPlayer=new Spotify.Player({
        name:'AIYDIWDWY Musica',
        getOAuthToken: async cb=>{
            try{ cb(await getPlaybackToken()); }
            catch(e){ setError('Token Spotify non disponibile: '+e.message); }
        },
        volume:0.7
    });

    currentPlayer.addListener('ready',({device_id})=>{
        playerDeviceId=device_id;
        if($('spotifyDeviceLabel')) $('spotifyDeviceLabel').textContent='PLAYER WEB ATTIVO';
        transferPlayback(device_id).catch(()=>{});
    });

    currentPlayer.addListener('not_ready',()=>{
        if($('spotifyDeviceLabel')) $('spotifyDeviceLabel').textContent='PLAYER NON DISPONIBILE';
    });

    currentPlayer.addListener('authentication_error',({message})=>setError(message));
    currentPlayer.addListener('account_error',()=>setError('Per ascoltare direttamente nel sito serve Spotify Premium.'));
    currentPlayer.addListener('playback_error',({message})=>setError(message));

    currentPlayer.addListener('player_state_changed',state=>{
        if(!state) return;
        currentState=state;
        updatePlayerUI(state);
    });

    currentPlayer.connect();
}

async function transferPlayback(deviceId){
    await spotifyUser('transfer',{},{
        method:'POST',
        body:{device_id:deviceId,play:false}
    });
}

async function playTrackUri(uri){
    if(!uri) return;
    if(!spotifyConnected){
        startSpotifyLogin();
        return;
    }
    if(!playerDeviceId){
        showToast('Sto preparando il player Spotify…');
        initWebPlayback();
        return;
    }
    try{
        await spotifyUser('play',{},{
            method:'POST',
            body:{device_id:playerDeviceId,uris:[uri]}
        });
    }catch(e){
        if(e.status===403) setError('Per la riproduzione dentro il sito serve Spotify Premium.');
        else setError(e.message);
    }
}

async function togglePlayback(){
    if(!currentPlayer) return;
    try{ await currentPlayer.togglePlay(); }catch(e){ setError(e.message); }
}
async function nextTrack(){ try{ await currentPlayer?.nextTrack(); }catch(_){} }
async function previousTrack(){ try{ await currentPlayer?.previousTrack(); }catch(_){} }

function updatePlayerUI(state){
    const track=state.track_window?.current_track;
    if(!track) return;

    const img=track.album?.images?.[0]?.url;
    if(img) $('playerCover').src=img;
    $('playerTitle').textContent=track.name||'';
    $('playerArtist').textContent=(track.artists||[]).map(a=>a.name).join(', ');
    $('playerDuration').textContent=formatMs(state.duration);
    $('playerCurrentTime').textContent=formatMs(state.position);
    $('playPauseButton').textContent=state.paused?'PLAY':'PAUSA';

    if($('playerSeek') && state.duration){
        $('playerSeek').value=Math.round((state.position/state.duration)*1000);
    }
}

async function seekFromSlider(){
    if(!currentPlayer || !currentState) return;
    const ratio=Number($('playerSeek').value)/1000;
    const pos=Math.floor((currentState.duration||0)*ratio);
    try{ await currentPlayer.seek(pos); }catch(_){}
}

async function setVolume(){
    if(!currentPlayer) return;
    const v=Number($('playerVolume').value)/100;
    try{ await currentPlayer.setVolume(v); }catch(_){}
}

function setupUIEvents(){
    $('connectSpotifyButton')?.addEventListener('click',startSpotifyLogin);
    $('disconnectSpotifyButton')?.addEventListener('click',disconnectSpotify);
    $('musicSearchButton')?.addEventListener('click',searchSpotify);
    $('musicSearchInput')?.addEventListener('keydown',e=>{if(e.key==='Enter')searchSpotify()});

    document.querySelectorAll('.range-button').forEach(b=>b.addEventListener('click',()=>loadTop(b.dataset.range)));

    document.querySelectorAll('[data-view]').forEach(el=>{
        el.addEventListener('click',()=>{
            const v=el.dataset.view;
            if(v==='top') loadTop(currentRange);
            if(v==='library') loadLibrary();
        });
    });

    document.querySelector('[data-action="top-short"]')?.addEventListener('click',()=>{showView('top');loadTop('short_term')});
    document.querySelector('[data-action="top-medium"]')?.addEventListener('click',()=>{showView('top');loadTop('medium_term')});
    document.querySelector('[data-action="top-long"]')?.addEventListener('click',()=>{showView('top');loadTop('long_term')});
    document.querySelector('[data-action="artists-short"]')?.addEventListener('click',()=>{showView('top');loadTop('short_term')});

    $('playPauseButton')?.addEventListener('click',togglePlayback);
    $('nextButton')?.addEventListener('click',nextTrack);
    $('previousButton')?.addEventListener('click',previousTrack);
    $('playerSeek')?.addEventListener('change',seekFromSlider);
    $('playerVolume')?.addEventListener('input',setVolume);
}

function showView(view){
    document.querySelectorAll('.music-view').forEach(x=>x.classList.remove('active'));
    $('view-'+view)?.classList.add('active');
    document.querySelectorAll('.nav-button').forEach(x=>x.classList.toggle('active',x.dataset.view===view));
    window.scrollTo({top:0,behavior:'smooth'});
}

window.onSpotifyWebPlaybackSDKReady=()=>{
    if(spotifyConnected) initWebPlayback();
};

requireAuth(async()=>{
    setupUIEvents();

    const url=new URL(location.href);
    if(url.searchParams.get('spotify')==='connected'){
        url.searchParams.delete('spotify');
        history.replaceState({},'',url.pathname+url.search);
        showToast('Spotify collegato.');
    }
    if(url.searchParams.get('spotify_error')){
        setError('Spotify: '+url.searchParams.get('spotify_error'));
    }

    try{
        spotifyConnected=await loadProfile();
        if(!spotifyConnected){
            setError('Collega Spotify per vedere i tuoi ascolti personali.');
            return;
        }

        setError('');
        await loadHome();
        await loadTop('short_term');
        if(window.Spotify) initWebPlayback();
    }catch(e){
        setError(e.message);
    }
});
