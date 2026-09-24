
const COL={
  shelves:"archiveShelves",books:"archiveBooks",chapters:"archiveChapters",pages:"archivePages",
  revisions:"archivePageRevisions",folders:"archiveFolders",files:"archiveFiles"
};

let shelves=[],books=[],chapters=[],pages=[],folders=[],files=[];
let currentPageId=null,currentFolderId=null,currentArea="wiki",dirty=false,lastLoadedPageVersion=0;
let entityMode=null,editingEntityId=null;

function nowField(){return firebase.firestore.FieldValue.serverTimestamp()}
function byOrder(a,b){return (a.order||0)-(b.order||0)||String(a.name||a.title||"").localeCompare(String(b.name||b.title||""),"it")}
function pageVersion(p){return p?.updatedAt?.toMillis?p.updatedAt.toMillis():0}
function cleanHtml(html=""){
  const doc=new DOMParser().parseFromString("<div>"+html+"</div>","text/html");
  doc.querySelectorAll("script,iframe,object,embed,style,link,meta").forEach(n=>n.remove());
  doc.querySelectorAll("*").forEach(el=>{
    [...el.attributes].forEach(a=>{
      const n=a.name.toLowerCase(),v=String(a.value||"");
      if(n.startsWith("on")||n==="style"||(n==="href"&&/^\s*javascript:/i.test(v))) el.removeAttribute(a.name);
    });
  });
  return doc.body.firstElementChild?.innerHTML||"";
}
function fmtTime(ts){
  if(!ts)return "—";const d=ts.toDate?ts.toDate():new Date(ts);if(Number.isNaN(d.getTime()))return "—";
  return d.toLocaleString("it-IT",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"});
}
function humanBytes(n=0){
  n=Number(n)||0;if(n<1024)return n+" B";if(n<1048576)return (n/1024).toFixed(1)+" KB";
  if(n<1073741824)return (n/1048576).toFixed(1)+" MB";return (n/1073741824).toFixed(2)+" GB";
}
function labelUser(u){return u==="cucci"?"Cucci":u==="cicci"?"Cicci":u||"—"}
function show(msg){showToast(msg)}

function switchArea(area){
  currentArea=area;
  document.getElementById("wikiArea").style.display=area==="wiki"?"grid":"none";
  document.getElementById("cloudArea").classList.toggle("active",area==="cloud");
  document.getElementById("wikiTab").classList.toggle("active",area==="wiki");
  document.getElementById("cloudTab").classList.toggle("active",area==="cloud");
  if(area==="cloud")renderCloud();
}

function renderTree(){
  const q=(document.getElementById("wikiSearch").value||"").trim().toLowerCase();
  const box=document.getElementById("wikiTree");
  const matchPage=p=>!q||String(p.title||"").toLowerCase().includes(q)||String(p.contentHtml||"").replace(/<[^>]+>/g," ").toLowerCase().includes(q);
  const pageMatches=new Set(pages.filter(matchPage).map(p=>p.id));
  const bookMatches=new Set();
  const chapterMatches=new Set();
  if(q){
    pages.forEach(p=>{if(pageMatches.has(p.id)){bookMatches.add(p.bookId);if(p.chapterId)chapterMatches.add(p.chapterId)}});
    books.forEach(b=>{if(String(b.title||"").toLowerCase().includes(q)){bookMatches.add(b.id)}});
    chapters.forEach(c=>{if(String(c.title||"").toLowerCase().includes(q)){chapterMatches.add(c.id);bookMatches.add(c.bookId)}});
  }

  const html=shelves.slice().sort(byOrder).map(s=>{
    const sb=books.filter(b=>b.shelfId===s.id).sort(byOrder);
    const shelfVisible=!q||String(s.name||"").toLowerCase().includes(q)||sb.some(b=>bookMatches.has(b.id));
    if(!shelfVisible)return "";
    return '<div class="tree-node">'+treeRow("shelf",s.id,s.name,currentPageId===("shelf:"+s.id))+
      '<div class="children">'+sb.map(b=>{
        const bc=chapters.filter(c=>c.bookId===b.id).sort(byOrder);
        const loose=pages.filter(p=>p.bookId===b.id&&!p.chapterId&&(!q||pageMatches.has(p.id))).sort(byOrder);
        const bookVisible=!q||bookMatches.has(b.id)||String(b.title||"").toLowerCase().includes(q);
        if(!bookVisible)return "";
        return '<div class="tree-node">'+treeRow("book",b.id,b.title,false)+
          '<div class="children">'+
          bc.map(c=>{
            const cp=pages.filter(p=>p.chapterId===c.id&&(!q||pageMatches.has(p.id))).sort(byOrder);
            if(q&&!chapterMatches.has(c.id)&&!cp.length)return "";
            return '<div class="tree-node">'+treeRow("chapter",c.id,c.title,false)+'<div class="children">'+cp.map(p=>treeRow("page",p.id,p.title,p.id===currentPageId)).join("")+'</div></div>';
          }).join("")+
          loose.map(p=>treeRow("page",p.id,p.title,p.id===currentPageId)).join("")+
          '</div></div>';
      }).join("")+'</div></div>';
  }).join("");
  box.innerHTML=html||'<div style="padding:18px;color:#756b78;text-align:center">Nessun contenuto.</div>';
  document.getElementById("shelfCount").textContent=shelves.length;
  document.getElementById("bookCount").textContent=books.length;
  document.getElementById("pageCount").textContent=pages.length;
}
function treeRow(kind,id,title,selected){
  const editable=kind!=="page";
  return '<div class="tree-row '+(selected?"selected":"")+'" onclick="selectTree(\''+kind+'\',\''+id+'\')">'+
    '<span class="tree-kind">'+({shelf:"Scaffale",book:"Libro",chapter:"Capitolo",page:"Pagina"}[kind])+'</span>'+
    '<span class="tree-title">'+escapeHtml(title||"Senza titolo")+'</span>'+
    (editable?'<button class="tree-edit" onclick="event.stopPropagation();editEntity(\''+kind+'\',\''+id+'\')">Edit</button>':"")+
  '</div>';
}
function selectTree(kind,id){
  if(kind==="page"){openPage(id);return}
  const obj=kind==="shelf"?shelves.find(x=>x.id===id):kind==="book"?books.find(x=>x.id===id):chapters.find(x=>x.id===id);
  if(!obj)return;
  document.getElementById("wikiHome").classList.add("active");document.getElementById("pageView").classList.remove("active");
  currentPageId=null;dirty=false;
  const title=obj.name||obj.title||"";
  const desc=obj.description||"";
  const home=document.getElementById("wikiHome");
  home.innerHTML='<div class="empty-page"><div style="font-family:var(--display);font-size:10px;color:#a373ac;letter-spacing:.15em">'+({shelf:"SCAFFALE",book:"LIBRO",chapter:"CAPITOLO"}[kind])+'</div><h1>'+escapeHtml(title)+'</h1><p>'+escapeHtml(desc||"Nessuna descrizione.")+'</p><button class="btn primary" onclick="editEntity(\''+kind+'\',\''+id+'\')">Modifica</button></div>';
  renderTree();
}

function openEntityModal(kind){
  entityMode=kind;editingEntityId=null;
  document.getElementById("entityTitle").textContent={shelf:"Nuovo scaffale",book:"Nuovo libro",chapter:"Nuovo capitolo"}[kind];
  document.getElementById("entityName").value="";
  document.getElementById("entityDescription").value="";
  document.getElementById("parentShelfRow").classList.toggle("hidden",kind!=="book");
  document.getElementById("parentBookRow").classList.toggle("hidden",kind!=="chapter");
  populateEntityParents();
  document.getElementById("entityModal").classList.add("open");
}
function editEntity(kind,id){
  entityMode=kind;editingEntityId=id;
  const obj=kind==="shelf"?shelves.find(x=>x.id===id):kind==="book"?books.find(x=>x.id===id):chapters.find(x=>x.id===id);
  if(!obj)return;
  document.getElementById("entityTitle").textContent="Modifica "+({shelf:"scaffale",book:"libro",chapter:"capitolo"}[kind]);
  document.getElementById("entityName").value=obj.name||obj.title||"";
  document.getElementById("entityDescription").value=obj.description||"";
  document.getElementById("parentShelfRow").classList.toggle("hidden",kind!=="book");
  document.getElementById("parentBookRow").classList.toggle("hidden",kind!=="chapter");
  populateEntityParents();
  if(kind==="book")document.getElementById("entityShelf").value=obj.shelfId||"";
  if(kind==="chapter")document.getElementById("entityBook").value=obj.bookId||"";
  document.getElementById("entityModal").classList.add("open");
}
function populateEntityParents(){
  document.getElementById("entityShelf").innerHTML=shelves.slice().sort(byOrder).map(s=>'<option value="'+s.id+'">'+escapeHtml(s.name)+'</option>').join("");
  document.getElementById("entityBook").innerHTML=books.slice().sort(byOrder).map(b=>'<option value="'+b.id+'">'+escapeHtml(b.title)+'</option>').join("");
}
function closeEntityModal(){document.getElementById("entityModal").classList.remove("open")}
async function saveEntity(){
  const name=document.getElementById("entityName").value.trim(),description=document.getElementById("entityDescription").value.trim();
  if(!name)return alert("Inserisci un titolo.");
  let coll,payload;
  if(entityMode==="shelf"){coll=COL.shelves;payload={name,description}}
  if(entityMode==="book"){const shelfId=document.getElementById("entityShelf").value;if(!shelfId)return alert("Crea prima uno scaffale.");coll=COL.books;payload={title:name,description,shelfId}}
  if(entityMode==="chapter"){const bookId=document.getElementById("entityBook").value;if(!bookId)return alert("Crea prima un libro.");coll=COL.chapters;payload={title:name,description,bookId}}
  payload.updatedAt=nowField();payload.updatedBy=currentUsername;
  try{
    if(editingEntityId)await db.collection(coll).doc(editingEntityId).set(payload,{merge:true});
    else{payload.createdAt=nowField();payload.createdBy=currentUsername;payload.order=Date.now();await db.collection(coll).add(payload)}
    closeEntityModal();show("Salvato");
  }catch(e){alert("Errore: "+e.message)}
}

function defaultBookId(){
  if(currentPageId){const p=pages.find(x=>x.id===currentPageId);if(p)return p.bookId}
  return books[0]?.id||"";
}
async function newPage(){
  if(!books.length){alert("Crea prima almeno uno scaffale e un libro.");return}
  const bookId=defaultBookId();
  try{
    const ref=await db.collection(COL.pages).add({
      title:"Nuova pagina",contentHtml:"<p>Inizia a scrivere qui...</p>",bookId,chapterId:null,order:Date.now(),
      createdBy:currentUsername,createdAt:nowField(),updatedBy:currentUsername,updatedAt:nowField()
    });
    setTimeout(()=>openPage(ref.id),150);
  }catch(e){alert("Errore: "+e.message)}
}
function openPage(id){
  const p=pages.find(x=>x.id===id);if(!p)return;
  currentPageId=id;dirty=false;lastLoadedPageVersion=pageVersion(p);
  document.getElementById("wikiHome").classList.remove("active");document.getElementById("pageView").classList.add("active");
  document.getElementById("pageTitle").value=p.title||"";
  document.getElementById("pageEditor").innerHTML=cleanHtml(p.contentHtml||"");
  document.getElementById("pageMeta").textContent="Ultima modifica: "+fmtTime(p.updatedAt)+" · "+labelUser(p.updatedBy);
  document.getElementById("syncWarning").style.display="none";
  renderTree();
}
document.getElementById("pageTitle").addEventListener("input",()=>dirty=true);
document.getElementById("pageEditor").addEventListener("input",()=>dirty=true);

function formatDoc(cmd,value=null){document.getElementById("pageEditor").focus();document.execCommand(cmd,false,value);dirty=true}
function formatBlock(tag){formatDoc("formatBlock","<"+tag+">")}
function insertLink(){const u=prompt("Indirizzo del link:","https://");if(u)formatDoc("createLink",u)}
async function saveCurrentPage(){
  const p=pages.find(x=>x.id===currentPageId);if(!p)return;
  const title=document.getElementById("pageTitle").value.trim()||"Senza titolo";
  const contentHtml=cleanHtml(document.getElementById("pageEditor").innerHTML);
  const btn=document.getElementById("savePageBtn");btn.disabled=true;btn.textContent="Salvataggio...";
  try{
    await db.collection(COL.revisions).add({
      pageId:p.id,title:p.title||"",contentHtml:p.contentHtml||"",bookId:p.bookId,chapterId:p.chapterId||null,
      savedBy:currentUsername,savedAt:nowField()
    });
    await db.collection(COL.pages).doc(p.id).set({title,contentHtml,updatedBy:currentUsername,updatedAt:nowField()},{merge:true});
    dirty=false;document.getElementById("syncWarning").style.display="none";show("Pagina salvata");
  }catch(e){alert("Errore: "+e.message)}
  finally{btn.disabled=false;btn.textContent="Salva pagina"}
}
async function deleteCurrentPage(){
  const p=pages.find(x=>x.id===currentPageId);if(!p||!confirm("Eliminare questa pagina?"))return;
  try{await db.collection(COL.pages).doc(p.id).delete();currentPageId=null;document.getElementById("pageView").classList.remove("active");resetWikiHome();show("Pagina eliminata")}catch(e){alert(e.message)}
}
function resetWikiHome(){
  const h=document.getElementById("wikiHome");h.classList.add("active");
  h.innerHTML='<div class="empty-page"><div style="font-family:var(--display);font-size:10px;color:#a373ac;letter-spacing:.15em">SPAZIO UNICO CONDIVISO</div><h1>La nostra biblioteca</h1><p>Scaffali, libri, capitoli e pagine sono gli stessi per entrambi. Cucci e Cicci possono creare e modificare qualsiasi contenuto.</p><div class="dashboard"><div class="stat"><strong id="shelfCount">'+shelves.length+'</strong><span>scaffali</span></div><div class="stat"><strong id="bookCount">'+books.length+'</strong><span>libri</span></div><div class="stat"><strong id="pageCount">'+pages.length+'</strong><span>pagine</span></div></div></div>';
}
function moveCurrentPage(){
  const p=pages.find(x=>x.id===currentPageId);if(!p)return;
  document.getElementById("moveBook").innerHTML=books.map(b=>'<option value="'+b.id+'">'+escapeHtml(b.title)+'</option>').join("");
  document.getElementById("moveBook").value=p.bookId||books[0]?.id||"";
  populateMoveChapters();
  document.getElementById("moveChapter").value=p.chapterId||"";
  document.getElementById("moveModal").classList.add("open");
}
function populateMoveChapters(){
  const bookId=document.getElementById("moveBook").value;
  document.getElementById("moveChapter").innerHTML='<option value="">Senza capitolo</option>'+chapters.filter(c=>c.bookId===bookId).sort(byOrder).map(c=>'<option value="'+c.id+'">'+escapeHtml(c.title)+'</option>').join("");
}
function closeMoveModal(){document.getElementById("moveModal").classList.remove("open")}
async function confirmMovePage(){
  if(!currentPageId)return;
  try{await db.collection(COL.pages).doc(currentPageId).set({bookId:document.getElementById("moveBook").value,chapterId:document.getElementById("moveChapter").value||null,updatedBy:currentUsername,updatedAt:nowField()},{merge:true});closeMoveModal();show("Pagina spostata")}catch(e){alert(e.message)}
}
async function showPageRevisions(){
  if(!currentPageId)return;
  const snap=await db.collection(COL.revisions).where("pageId","==",currentPageId).get();
  const list=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.savedAt?.toMillis?b.savedAt.toMillis():0)-(a.savedAt?.toMillis?a.savedAt.toMillis():0));
  document.getElementById("revisionList").innerHTML=list.length?list.slice(0,40).map(r=>'<div class="revision"><strong>'+escapeHtml(fmtTime(r.savedAt))+' · '+escapeHtml(labelUser(r.savedBy))+'</strong><div style="margin-top:5px">'+escapeHtml(r.title||"Senza titolo")+'</div><button class="tiny" style="margin-top:6px" onclick="restoreRevision(\''+r.id+'\')">Ripristina</button></div>').join(""):'<div class="empty">Nessuna versione precedente.</div>';
  document.getElementById("revisionModal").classList.add("open");
}
function closeRevisionModal(){document.getElementById("revisionModal").classList.remove("open")}
async function restoreRevision(id){
  const d=await db.collection(COL.revisions).doc(id).get();if(!d.exists||!currentPageId)return;const r=d.data();
  if(!confirm("Ripristinare questa versione?"))return;
  await db.collection(COL.pages).doc(currentPageId).set({title:r.title||"Senza titolo",contentHtml:r.contentHtml||"",bookId:r.bookId,chapterId:r.chapterId||null,updatedBy:currentUsername,updatedAt:nowField()},{merge:true});
  closeRevisionModal();show("Versione ripristinata");
}

/* ---------- CLOUD CONDIVISO ---------- */
function folderChildren(parent){return folders.filter(f=>(f.parentId||null)===(parent||null)).sort((a,b)=>String(a.name).localeCompare(String(b.name),"it"))}
function fileChildren(parent){return files.filter(f=>(f.folderId||null)===(parent||null)).sort((a,b)=>String(a.name).localeCompare(String(b.name),"it"))}
function renderCloud(){
  renderBreadcrumbs();
  const q=(document.getElementById("fileSearch").value||"").trim().toLowerCase();
  const fs=folderChildren(currentFolderId).filter(f=>!q||String(f.name).toLowerCase().includes(q));
  const fl=fileChildren(currentFolderId).filter(f=>!q||String(f.name).toLowerCase().includes(q));
  const rows=[];
  fs.forEach(f=>rows.push('<tr class="file-row"><td class="name-cell" onclick="openFolder(\''+f.id+'\')"><span class="kind-badge">Cartella</span><strong>'+escapeHtml(f.name)+'</strong></td><td>cartella</td><td>'+escapeHtml(fmtTime(f.updatedAt||f.createdAt))+'</td><td class="file-actions"><button class="tiny" onclick="renameFolder(\''+f.id+'\')">Rinomina</button><button class="tiny" onclick="deleteFolder(\''+f.id+'\')">Elimina</button></td></tr>'));
  fl.forEach(f=>rows.push('<tr class="file-row"><td class="name-cell" onclick="openCloudFile(\''+f.id+'\')"><span class="kind-badge">File</span><strong>'+escapeHtml(f.name)+'</strong></td><td>'+escapeHtml(f.mimeType||f.resourceType||"file")+'</td><td>'+escapeHtml(fmtTime(f.createdAt))+' · '+escapeHtml(labelUser(f.uploadedBy))+'</td><td class="file-actions"><button class="tiny" onclick="renameFile(\''+f.id+'\')">Rinomina</button><button class="tiny" onclick="openCloudFile(\''+f.id+'\')">Apri</button><button class="tiny" onclick="deleteCloudFile(\''+f.id+'\')">Elimina</button></td></tr>'));
  document.getElementById("fileList").innerHTML=rows.join("")||'<tr><td colspan="4" style="padding:26px;text-align:center;color:#776d7a">Cartella vuota.</td></tr>';
  const total=files.reduce((n,f)=>n+(Number(f.bytes)||0),0);
  document.getElementById("storageInfo").textContent=files.length+" file · "+humanBytes(total)+" indicizzati nel cloud condiviso";
}
function renderBreadcrumbs(){
  const chain=[];let id=currentFolderId,guard=0;
  while(id&&guard++<50){const f=folders.find(x=>x.id===id);if(!f)break;chain.unshift(f);id=f.parentId||null}
  document.getElementById("breadcrumbs").innerHTML='<button class="crumb" onclick="openFolder(null)">Cloud</button>'+chain.map(f=>' / <button class="crumb" onclick="openFolder(\''+f.id+'\')">'+escapeHtml(f.name)+'</button>').join("");
}
function openFolder(id){currentFolderId=id||null;renderCloud()}
async function createFolder(){
  const name=(prompt("Nome della nuova cartella:")||"").trim();if(!name)return;
  try{await db.collection(COL.folders).add({name,parentId:currentFolderId||null,createdBy:currentUsername,createdAt:nowField(),updatedBy:currentUsername,updatedAt:nowField()});show("Cartella creata")}catch(e){alert(e.message)}
}
async function renameFolder(id){
  const f=folders.find(x=>x.id===id);if(!f)return;const name=(prompt("Nuovo nome:",f.name)||"").trim();if(!name||name===f.name)return;
  await db.collection(COL.folders).doc(id).set({name,updatedBy:currentUsername,updatedAt:nowField()},{merge:true});
}
async function deleteFolder(id){
  const hasFolders=folders.some(f=>f.parentId===id),hasFiles=files.some(f=>f.folderId===id);
  if(hasFolders||hasFiles)return alert("La cartella non è vuota. Elimina o sposta prima il contenuto.");
  if(!confirm("Eliminare questa cartella?"))return;
  await db.collection(COL.folders).doc(id).delete();if(currentFolderId===id)currentFolderId=null;
}
async function renameFile(id){
  const f=files.find(x=>x.id===id);if(!f)return;const name=(prompt("Nuovo nome file:",f.name)||"").trim();if(!name||name===f.name)return;
  await db.collection(COL.files).doc(id).set({name,updatedBy:currentUsername,updatedAt:nowField()},{merge:true});
}
function openCloudFile(id){const f=files.find(x=>x.id===id);if(!f?.url)return;window.open(f.url,"_blank","noopener")}
async function getCloudSignature(){
  const token=await auth.currentUser.getIdToken();
  const r=await fetch("/.netlify/functions/cloudinary-sign",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+token},body:JSON.stringify({scope:"shared-files"})});
  const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||"Firma Cloudinary non disponibile");return d;
}
async function uploadOne(file){
  const sig=await getCloudSignature(),form=new FormData();
  form.append("file",file);form.append("api_key",sig.apiKey);form.append("timestamp",String(sig.timestamp));form.append("signature",sig.signature);form.append("folder",sig.folder);
  const r=await fetch("https://api.cloudinary.com/v1_1/"+encodeURIComponent(sig.cloudName)+"/auto/upload",{method:"POST",body:form});
  const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error?.message||"Upload non riuscito");
  await db.collection(COL.files).add({
    name:file.name,folderId:currentFolderId||null,url:d.secure_url,publicId:d.public_id,resourceType:d.resource_type||"raw",
    mimeType:file.type||"",bytes:d.bytes||file.size||0,format:d.format||"",uploadedBy:currentUsername,
    createdAt:nowField(),updatedAt:nowField()
  });
}
async function uploadFiles(fileList){
  const arr=Array.from(fileList||[]);if(!arr.length)return;
  const dz=document.getElementById("dropzone");const old=dz.textContent;
  try{for(let i=0;i<arr.length;i++){dz.textContent="Caricamento "+(i+1)+"/"+arr.length+" · "+arr[i].name;await uploadOne(arr[i])}show(arr.length+" file caricati")}
  catch(e){alert("Errore upload: "+e.message)}
  finally{dz.textContent=old;document.getElementById("fileInput").value=""}
}
async function deleteCloudFile(id){
  const f=files.find(x=>x.id===id);if(!f||!confirm("Eliminare "+f.name+"?"))return;
  try{
    if(f.publicId){
      const token=await auth.currentUser.getIdToken();
      const r=await fetch("/.netlify/functions/cloudinary-delete",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+token},body:JSON.stringify({publicId:f.publicId,resourceType:f.resourceType||"raw"})});
      const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||"Eliminazione cloud non riuscita");
    }
    await db.collection(COL.files).doc(id).delete();show("File eliminato");
  }catch(e){alert(e.message)}
}
const dz=document.getElementById("dropzone");
["dragenter","dragover"].forEach(ev=>dz.addEventListener(ev,e=>{e.preventDefault();dz.classList.add("drag")}));
["dragleave","drop"].forEach(ev=>dz.addEventListener(ev,e=>{e.preventDefault();dz.classList.remove("drag")}));
dz.addEventListener("drop",e=>uploadFiles(e.dataTransfer.files));

function subscribeCollection(name,setter){
  return db.collection(name).onSnapshot(s=>{setter(s.docs.map(d=>({id:d.id,...d.data()})));renderTree();if(currentArea==="cloud")renderCloud()},e=>console.error(name,e));
}
function handlePagesSnapshot(next){
  const before=pages.find(p=>p.id===currentPageId),oldVersion=pageVersion(before);
  pages=next;
  const p=pages.find(x=>x.id===currentPageId);
  if(p){
    const v=pageVersion(p);
    if(!dirty&&v!==lastLoadedPageVersion){openPage(p.id)}
    else if(dirty&&v>lastLoadedPageVersion&&p.updatedBy!==currentUsername){document.getElementById("syncWarning").style.display="block"}
    lastLoadedPageVersion=Math.max(lastLoadedPageVersion,v,oldVersion);
  }
}
requireAuth(async function(){
  subscribeCollection(COL.shelves,v=>shelves=v);
  subscribeCollection(COL.books,v=>books=v);
  subscribeCollection(COL.chapters,v=>chapters=v);
  db.collection(COL.pages).onSnapshot(s=>{handlePagesSnapshot(s.docs.map(d=>({id:d.id,...d.data()})));renderTree()},e=>console.error(e));
  subscribeCollection(COL.folders,v=>folders=v);
  subscribeCollection(COL.files,v=>files=v);
  switchArea("wiki");
});
document.addEventListener("keydown",e=>{
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="s"&&currentPageId){e.preventDefault();saveCurrentPage()}
  if(e.key==="Escape"){closeEntityModal();closeMoveModal();closeRevisionModal()}
});
