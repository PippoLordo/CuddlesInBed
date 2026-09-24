
const GEOJSON_URL="https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson";
let map,countriesLayer,markersLayer,geoData;
let visits=[],photos=[],selectedCountryCode="",selectedCountryName="",selectedCity="",selectedRegion="",editingVisitId=null,draftVisitors=[],clickedLatLng=null;
const countryByCode=new Map();

function esc(v){return String(v==null?"":v).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})}
function mapDataError(label,error){
  console.error(label,error);
  const panel=document.getElementById("sidePanel");
  if(!panel)return;
  const detail=error&&error.code==="permission-denied"
    ?"Permessi Firestore non ancora pubblicati."
    :(error?.message||"errore di caricamento");
  panel.innerHTML='<div class="eyebrow">Mappa</div><h2>Caricamento non riuscito</h2><div class="empty">'+esc(label+": "+detail)+'</div>';
}
function norm(v){return String(v||"").trim().toLowerCase()}
function props(f){const p=f&&f.properties||{};return {name:p.name||p.ADMIN||p.NAME||"Paese",code:String(p["ISO3166-1-Alpha-2"]||p.ISO_A2||p.iso_a2||"").toUpperCase()}}
function pdate(v){if(!v)return null;const d=new Date(String(v).slice(0,10)+"T12:00:00");return isNaN(d)?null:d}
function fmt(v){const d=pdate(v);return d?d.toLocaleDateString("it-IT",{day:"2-digit",month:"2-digit",year:"numeric"}):"—"}
function uploaded(v){if(!v)return "data caricamento non disponibile";const d=v.toDate?v.toDate():new Date(v);return isNaN(d)?"data caricamento non disponibile":d.toLocaleString("it-IT",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"})}
function status(list){const u=new Set();list.forEach(function(v){(v.visitors||[]).forEach(function(x){u.add(x)})});return u.has("cucci")&&u.has("cicci")?"both":u.has("cucci")?"cucci":u.has("cicci")?"cicci":""}
function who(v){const a=Array.isArray(v)?v:[];return a.includes("cucci")&&a.includes("cicci")?"Cucci e Cicci":a.includes("cucci")?"Cucci":a.includes("cicci")?"Cicci":"—"}
function color(st,country){return st==="cucci"?"#b3132b":st==="cicci"?"#6d1b7b":st==="both"?"#123d2b":"#555158"}
function countryVisits(c){return visits.filter(function(v){return String(v.countryCode||"").toUpperCase()===String(c||"").toUpperCase()})}
function locationVisits(c,city,region){const cc=norm(city),rr=norm(region);return countryVisits(c).filter(function(v){if(cc)return norm(v.city)===cc;if(rr)return norm(v.region)===rr&&!v.city;return true})}
function hasDate(v,k){const d=pdate(k),a=pdate(v.startDate),b=pdate(v.endDate||v.startDate);return !!(d&&a&&b&&d>=a&&d<=b)}
function mediaFor(list){return photos.filter(function(p){return list.some(function(v){return hasDate(v,p.date)})}).sort(function(a,b){const da=String(a.date||""),db=String(b.date||"");if(da!==db)return db.localeCompare(da);return (b.createdAt&&b.createdAt.toMillis?b.createdAt.toMillis():0)-(a.createdAt&&a.createdAt.toMillis?a.createdAt.toMillis():0)})}
function dateRange(a,b){let x=pdate(a),z=pdate(b||a),out=[],n=0;if(!x||!z)return out;while(x<=z&&n<3700){out.push(x.getFullYear()+"-"+(x.getMonth()+1)+"-"+x.getDate());x.setDate(x.getDate()+1);n++}return out}

async function loadGeo(){
  const r=await fetch(GEOJSON_URL,{cache:"force-cache"});if(!r.ok)throw new Error("Non riesco a caricare i confini dei paesi.");
  geoData=await r.json();
  (geoData.features||[]).forEach(function(f){const i=props(f);if(i.code)countryByCode.set(i.code,{feature:f,name:i.name,code:i.code})});
  const list=[...countryByCode.values()].sort(function(a,b){return a.name.localeCompare(b.name,"it")});
  document.getElementById("countrySelect").innerHTML='<option value="">Scegli un paese</option>'+list.map(function(c){return '<option value="'+esc(c.code)+'">'+esc(c.name)+'</option>'}).join("");
}

function initMap(){
  map=L.map("worldMap",{worldCopyJump:true,minZoom:2,maxZoom:15,attributionControl:false}).setView([24,8],2);
  markersLayer=L.layerGroup().addTo(map);
  map.on("click",function(e){if(selectedCountryCode)clickedLatLng=e.latlng});
}
function drawCountries(){
  if(countriesLayer)countriesLayer.remove();
  countriesLayer=L.geoJSON(geoData,{
    style:function(f){const i=props(f),st=status(countryVisits(i.code)),sel=i.code===selectedCountryCode;return {color:sel?"#e6d9e8":"#171218",weight:sel?2:.8,fillColor:color(st,true),fillOpacity:st?.92:.78}},
    onEachFeature:function(f,l){const i=props(f);l.bindTooltip(i.name,{sticky:true,className:"country-tooltip"});l.on("click",function(){openCountry(i.code,i.name,f)})}
  }).addTo(map);
}
function drawMarkers(list){
  markersLayer.clearLayers();const g=new Map();
  list.forEach(function(v){if(v.lat==null||v.lng==null)return;const k=[norm(v.city),norm(v.region),Number(v.lat).toFixed(4),Number(v.lng).toFixed(4)].join("|");if(!g.has(k))g.set(k,[]);g.get(k).push(v)});
  g.forEach(function(group){const v=group[0],st=status(group),m=L.circleMarker([Number(v.lat),Number(v.lng)],{radius:9,color:"#eee",weight:1.3,fillColor:color(st,false),fillOpacity:1}).addTo(markersLayer);m.bindTooltip((v.city||v.region||v.countryName)+" · "+who([].concat.apply([],group.map(function(x){return x.visitors||[]}))),{className:"country-tooltip"});m.on("click",function(e){L.DomEvent.stopPropagation(e);openLocation(v.countryCode,v.countryName,v.city||"",v.region||"")})});
}

function showWorld(){
  selectedCountryCode="";selectedCountryName="";selectedCity="";selectedRegion="";clickedLatLng=null;drawCountries();markersLayer.clearLayers();map.setView([24,8],2);renderWorld();history.replaceState(null,"","mappa.html");
}
function openCountry(code,name,feature){
  if(!code)return;selectedCountryCode=code;selectedCountryName=name||countryByCode.get(code)?.name||code;selectedCity="";selectedRegion="";clickedLatLng=null;drawCountries();drawMarkers(countryVisits(code));
  const f=feature||countryByCode.get(code)?.feature;if(f)map.fitBounds(L.geoJSON(f).getBounds(),{padding:[22,22],maxZoom:6});
  renderCountry(code,selectedCountryName);const u=new URL(location.href);u.searchParams.set("country",code);u.searchParams.delete("city");u.searchParams.delete("region");history.replaceState(null,"",u);
}
function openLocation(code,name,city,region){
  selectedCountryCode=code;selectedCountryName=name||countryByCode.get(code)?.name||code;selectedCity=city||"";selectedRegion=region||"";clickedLatLng=null;drawCountries();
  const list=locationVisits(code,selectedCity,selectedRegion);drawMarkers(list);const first=list.find(function(v){return v.lat!=null&&v.lng!=null});if(first)map.setView([Number(first.lat),Number(first.lng)],10);
  renderLocation(code,selectedCountryName,selectedCity,selectedRegion);
  const u=new URL(location.href);u.searchParams.set("country",code);selectedCity?u.searchParams.set("city",selectedCity):u.searchParams.delete("city");selectedRegion?u.searchParams.set("region",selectedRegion):u.searchParams.delete("region");history.replaceState(null,"",u);
}

function renderWorld(){
  const by=new Map();visits.forEach(function(v){const c=String(v.countryCode||"").toUpperCase();if(!c)return;if(!by.has(c))by.set(c,[]);by.get(c).push(v)});
  const cityCount=new Set(visits.filter(function(v){return v.city}).map(function(v){return v.countryCode+"|"+norm(v.city)})).size;
  const days=new Set([].concat.apply([],visits.map(function(v){return dateRange(v.startDate,v.endDate||v.startDate)}))).size;
  const rows=[...by.entries()].sort(function(a,b){return (a[1][0].countryName||a[0]).localeCompare(b[1][0].countryName||b[0],"it")}).map(function(x){const c=x[0],l=x[1],n=l[0].countryName||c,st=status(l);return '<div class="visit-card '+st+'" onclick="openCountry(\''+esc(c)+'\',\''+esc(n)+'\')"><div class="visit-title">'+esc(n)+'</div><div class="visit-meta">'+l.length+' '+(l.length===1?"permanenza":"permanenze")+' · '+esc(who([].concat.apply([],l.map(function(v){return v.visitors||[]}))))+'</div></div>'}).join("");
  document.getElementById("sidePanel").innerHTML='<div class="eyebrow">Mappa condivisa</div><h2>Mondo</h2><p class="muted">Rosso = solo Cucci, viola = solo Cicci, verde scuro = entrambi. Apri un paese per vedere regioni e città.</p><div class="summary"><div class="stat"><strong>'+by.size+'</strong><span>paesi</span></div><div class="stat"><strong>'+cityCount+'</strong><span>città</span></div><div class="stat"><strong>'+days+'</strong><span>giorni segnati</span></div></div><div class="section-title">Paesi visitati</div>'+(rows||'<div class="empty">Ancora nessun paese segnato.</div>');
}
function renderCountry(code,name){
  const list=countryVisits(code),media=mediaFor(list),g=new Map();
  list.forEach(function(v){const k=norm(v.city)+"|"+norm(v.region),label=v.city||v.region||"Paese";if(!g.has(k))g.set(k,{label:label,city:v.city||"",region:v.region||"",items:[]});g.get(k).items.push(v)});
  const places=[...g.values()].sort(function(a,b){return a.label.localeCompare(b.label,"it")}).map(function(x){const st=status(x.items);return '<div class="visit-card '+st+'" onclick="openLocation(\''+esc(code)+'\',\''+esc(name)+'\',\''+esc(x.city)+'\',\''+esc(x.region)+'\')"><div class="visit-title">'+esc(x.label)+'</div><div class="visit-meta">'+esc(who([].concat.apply([],x.items.map(function(v){return v.visitors||[]}))))+' · '+x.items.length+' '+(x.items.length===1?"visita":"visite")+'</div></div>'}).join("");
  document.getElementById("sidePanel").innerHTML='<button class="mini detail-back" onclick="showWorld()">← Mondo</button><div class="eyebrow">Paese</div><h2>'+esc(name)+'</h2><p class="muted">Qui trovi insieme tutti i ricordi del paese. Scegli una città o regione per filtrare.</p><div class="summary"><div class="stat"><strong>'+g.size+'</strong><span>luoghi</span></div><div class="stat"><strong>'+list.length+'</strong><span>visite</span></div><div class="stat"><strong>'+media.length+'</strong><span>foto/video</span></div></div><button class="action primary" style="width:100%" onclick="openVisitModal(\''+esc(code)+'\')">Aggiungi un luogo in '+esc(name)+'</button><div class="section-title">Città e regioni</div>'+(places||'<div class="empty">Nessuna città o regione registrata.</div>')+'<div class="section-title">Tutte le note del paese</div>'+renderNotes(list)+'<div class="section-title">Foto e video del paese</div>'+renderMedia(media);
}
function renderLocation(code,name,city,region){
  const list=locationVisits(code,city,region),media=mediaFor(list),label=city||region||name,st=status(list);
  const cards=list.slice().sort(function(a,b){return String(b.startDate).localeCompare(String(a.startDate))}).map(function(v){return visitCard(v,true)}).join("");
  document.getElementById("sidePanel").innerHTML='<button class="mini detail-back" onclick="openCountry(\''+esc(code)+'\',\''+esc(name)+'\')">← '+esc(name)+'</button><div class="eyebrow">'+(city?"Città":"Regione")+'</div><h2>'+esc(label)+'</h2><p class="muted">Qui vedi solo note, date, foto e video associati a questo luogo.</p><div class="summary"><div class="stat"><strong>'+list.length+'</strong><span>visite</span></div><div class="stat"><strong>'+media.length+'</strong><span>foto/video</span></div><div class="stat"><strong>'+(st==="both"?2:st?1:0)+'</strong><span>persone</span></div></div><div class="section-title">Permanenze</div>'+(cards||'<div class="empty">Nessuna permanenza registrata.</div>')+'<div class="section-title">Note</div>'+renderNotes(list)+'<div class="section-title">Foto e video</div>'+renderMedia(media);
}
function visitCard(v,actions){
  const period=v.startDate===v.endDate||!v.endDate?fmt(v.startDate):fmt(v.startDate)+" → "+fmt(v.endDate);
  return '<div class="visit-card '+status([v])+'"><div class="visit-title">'+esc(v.city||v.region||v.countryName||"Luogo")+'</div><div class="visit-meta">'+esc(period)+' · '+esc(who(v.visitors))+'</div>'+(v.notes?'<div class="visit-note">'+esc(v.notes)+'</div>':"")+(actions?'<div class="card-actions"><button class="mini" onclick="editVisit(\''+v.id+'\')">Edit</button><button class="mini danger" onclick="deleteVisit(\''+v.id+'\')">Elimina</button></div>':"")+'</div>';
}
function renderNotes(list){
  const n=list.filter(function(v){return String(v.notes||"").trim()}).sort(function(a,b){return String(b.startDate).localeCompare(String(a.startDate))});
  return n.length?n.map(function(v){return '<div class="note-card"><div class="visit-title">'+esc(v.city||v.region||v.countryName||"Luogo")+'</div><div class="visit-meta">'+esc(fmt(v.startDate))+(v.endDate&&v.endDate!==v.startDate?" → "+esc(fmt(v.endDate)):"")+'</div><div class="visit-note">'+esc(v.notes)+'</div></div>'}).join(""):'<div class="empty">Nessuna nota per questo luogo.</div>';
}
function renderMedia(items){
  if(!items.length)return '<div class="empty">Nessuna foto o video collegato alle date di questo luogo.</div>';
  return '<div class="media-grid">'+items.map(function(p){const video=(p.mimeType||"").startsWith("video/")||/\.(mp4|mov|webm)(\?|$)/i.test(p.url||"");return '<div class="media-card" onclick="openMediaViewer(\''+p.id+'\')">'+(video?'<video src="'+esc(p.url||"")+'" muted playsinline preload="metadata"></video>':'<img src="'+esc(p.url||"")+'" loading="lazy" alt="">')+'<div class="media-info">Data ricordo: '+esc(fmt(p.date))+'<br>Caricata: '+esc(uploaded(p.createdAt))+(p.note?'<br>'+esc(p.note):"")+'</div></div>'}).join("")+'</div>';
}
function openMediaViewer(id){const p=photos.find(function(x){return x.id===id});if(!p)return;const video=(p.mimeType||"").startsWith("video/")||/\.(mp4|mov|webm)(\?|$)/i.test(p.url||"");document.getElementById("viewerMedia").innerHTML=video?'<video src="'+esc(p.url||"")+'" controls autoplay playsinline></video>':'<img src="'+esc(p.url||"")+'" alt="">';document.getElementById("viewerMeta").innerHTML='Data associata: <strong>'+esc(fmt(p.date))+'</strong> · Pubblicata: <strong>'+esc(uploaded(p.createdAt))+'</strong>'+(p.note?"<br>"+esc(p.note):"");document.getElementById("mediaViewer").classList.add("open")}
function closeMediaViewer(){document.getElementById("mediaViewer").classList.remove("open");document.getElementById("viewerMedia").innerHTML=""}

function openVisitModal(code){
  editingVisitId=null;draftVisitors=[];document.getElementById("visitModalTitle").textContent="Aggiungi un posto";["regionInput","cityInput","startDateInput","endDateInput","notesInput"].forEach(function(id){document.getElementById(id).value=""});document.getElementById("countrySelect").value=code||selectedCountryCode||"";document.getElementById("latInput").value=clickedLatLng?clickedLatLng.lat.toFixed(6):"";document.getElementById("lngInput").value=clickedLatLng?clickedLatLng.lng.toFixed(6):"";updateWhoUI();document.getElementById("visitModal").classList.add("open")
}
function closeVisitModal(){document.getElementById("visitModal").classList.remove("open")}
function toggleVisitor(u){const s=new Set(draftVisitors);s.has(u)?s.delete(u):s.add(u);draftVisitors=[...s];updateWhoUI()}
function updateWhoUI(){document.getElementById("whoCucci").classList.toggle("active",draftVisitors.includes("cucci"));document.getElementById("whoCicci").classList.toggle("active",draftVisitors.includes("cicci"))}
function editVisit(id){const v=visits.find(function(x){return x.id===id});if(!v)return;editingVisitId=id;draftVisitors=[...(v.visitors||[])];document.getElementById("visitModalTitle").textContent="Modifica posto";document.getElementById("countrySelect").value=v.countryCode||"";document.getElementById("regionInput").value=v.region||"";document.getElementById("cityInput").value=v.city||"";document.getElementById("startDateInput").value=v.startDate||"";document.getElementById("endDateInput").value=v.endDate||v.startDate||"";document.getElementById("latInput").value=v.lat==null?"":v.lat;document.getElementById("lngInput").value=v.lng==null?"":v.lng;document.getElementById("notesInput").value=v.notes||"";updateWhoUI();document.getElementById("visitModal").classList.add("open")}

async function saveVisit(){
  const code=document.getElementById("countrySelect").value,c=countryByCode.get(code),region=document.getElementById("regionInput").value.trim(),city=document.getElementById("cityInput").value.trim(),start=document.getElementById("startDateInput").value,end=document.getElementById("endDateInput").value||start,notes=document.getElementById("notesInput").value.trim(),la=document.getElementById("latInput").value,lo=document.getElementById("lngInput").value;
  if(!c)return alert("Scegli un paese.");if(!city&&!region)return alert("Inserisci almeno una città o una regione.");if(!start||!end)return alert("Inserisci le date.");if(pdate(end)<pdate(start))return alert("La data finale non può essere precedente a quella iniziale.");if(!draftVisitors.length)return alert("Seleziona almeno Cucci o Cicci.");
  const payload={countryCode:code,countryName:c.name,region:region,city:city,startDate:start,endDate:end,visitors:[...draftVisitors],notes:notes,lat:la===""?null:Number(la),lng:lo===""?null:Number(lo),updatedBy:currentUsername,updatedAt:firebase.firestore.FieldValue.serverTimestamp()};
  try{
    if(editingVisitId){const old=visits.find(function(v){return v.id===editingVisitId});if(old)await removeCalendarEvents(old);await db.collection("travelPlaces").doc(editingVisitId).set(payload,{merge:true});await writeCalendarEvents(editingVisitId,payload)}
    else{payload.createdBy=currentUsername;payload.createdAt=firebase.firestore.FieldValue.serverTimestamp();const ref=await db.collection("travelPlaces").add(payload);await writeCalendarEvents(ref.id,payload)}
    closeVisitModal();
  }catch(e){alert("Errore nel salvataggio: "+e.message)}
}
async function writeCalendarEvents(id,v){
  const days=dateRange(v.startDate,v.endDate||v.startDate);
  for(let i=0;i<days.length;i+=350){const batch=db.batch();days.slice(i,i+350).forEach(function(day){const ev={id:id,countryCode:v.countryCode,countryName:v.countryName,region:v.region||"",city:v.city||"",visitors:v.visitors||[],startDate:v.startDate,endDate:v.endDate||v.startDate,label:who(v.visitors)+" · "+(v.city||v.region||v.countryName)};const obj={travelEvents:{}};obj.travelEvents[id]=ev;batch.set(db.collection("calendar").doc(day),obj,{merge:true})});await batch.commit()}
}
async function removeCalendarEvents(v){
  const days=dateRange(v.startDate,v.endDate||v.startDate);
  for(let i=0;i<days.length;i+=350){const batch=db.batch();days.slice(i,i+350).forEach(function(day){const obj={};obj["travelEvents."+v.id]=firebase.firestore.FieldValue.delete();batch.update(db.collection("calendar").doc(day),obj)});await batch.commit()}
}
async function deleteVisit(id){const v=visits.find(function(x){return x.id===id});if(!v||!confirm("Eliminare "+(v.city||v.region||v.countryName)+" dalla mappa?"))return;try{await removeCalendarEvents(v);await db.collection("travelPlaces").doc(id).delete()}catch(e){alert("Non riesco a eliminare il posto: "+e.message)}}

function refresh(){if(!geoData)return;drawCountries();if(selectedCountryCode){if(selectedCity||selectedRegion)openLocation(selectedCountryCode,selectedCountryName,selectedCity,selectedRegion);else openCountry(selectedCountryCode,selectedCountryName)}else renderWorld()}
function deepLink(){const q=new URLSearchParams(location.search),code=(q.get("country")||"").toUpperCase();if(!code||!countryByCode.has(code))return showWorld();const c=countryByCode.get(code),city=q.get("city")||"",region=q.get("region")||"";if(city||region)openLocation(code,c.name,city,region);else openCountry(code,c.name,c.feature)}

requireAuth(async function(){
  initMap();
  try{
    await loadGeo();drawCountries();
    db.collection("travelPlaces").onSnapshot(
      function(s){visits=s.docs.map(function(d){return Object.assign({id:d.id},d.data())});refresh()},
      function(e){mapDataError("Luoghi condivisi",e)}
    );
    db.collection("photos").onSnapshot(
      function(s){photos=s.docs.map(function(d){return Object.assign({id:d.id},d.data())});refresh()},
      function(e){mapDataError("Foto e video",e)}
    );
    deepLink();
  }catch(e){document.getElementById("sidePanel").innerHTML='<div class="empty">'+esc(e.message)+'</div>'}
});
document.addEventListener("keydown",function(e){if(e.key==="Escape"){closeVisitModal();closeMediaViewer()}});
