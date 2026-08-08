let myBooks={},otherBooks={},bookSearchPage=1,lastBookQuery='',selectedBook=null,searchCache={};
let editingBook=false,coverFileToUpload=null;
let bookSortMode=localStorage.getItem('booksSortMode')||'added';

requireAuth(async u=>{
    document.getElementById('otherOnlyTitle').textContent=`Letti da ${labelFor(otherUser(u))} ma non da te`;
    document.getElementById('searchInput').addEventListener('keydown',e=>{if(e.key==='Enter')searchBooks(true)});
    const sortSelect=document.getElementById('bookSort'); if(sortSelect) sortSelect.value=bookSortMode;
    await refreshLibraries();
});

function coverUrl(id,size='L'){return id?`https://covers.openlibrary.org/b/id/${id}-${size}.jpg`:''}
function splitList(value){return String(value||'').split(',').map(x=>x.trim()).filter(Boolean)}
function safeId(v){return String(v||'').replace(/[^A-Za-z0-9_-]/g,'_')}
function makeManualId(){return `manual_${Date.now()}_${Math.random().toString(36).slice(2,8)}`}

async function searchBooks(reset){
    const q=document.getElementById('searchInput').value.trim();if(!q)return;
    if(reset){lastBookQuery=q;bookSearchPage=1;searchCache={};document.getElementById('searchResults').innerHTML='<div class="loading">Ricerca…</div>'}else bookSearchPage++;
    try{
        const fields=['key','title','subtitle','author_name','author_key','first_publish_year','cover_i','number_of_pages_median','edition_count','isbn','publisher','language','subject','ratings_average','ratings_count','readinglog_count','ebook_access'].join(',');
        const url=`https://openlibrary.org/search.json?q=${encodeURIComponent(lastBookQuery)}&page=${bookSearchPage}&limit=24&lang=it&fields=${encodeURIComponent(fields)}`;
        const r=await fetch(url);if(!r.ok)throw new Error('Open Library non raggiungibile');
        const d=await r.json();const box=document.getElementById('searchResults');if(reset)box.innerHTML='';
        for(const b of d.docs||[]){const key=(b.key||'').replace('/works/','');if(key)searchCache[key]=b}
        box.insertAdjacentHTML('beforeend',(d.docs||[]).map(searchCard).join('')||'<div class="empty">Nessun risultato. Puoi aggiungerlo manualmente.</div>');
        document.getElementById('searchSection').classList.remove('hidden');document.getElementById('searchCount').textContent=`${d.num_found||0} risultati`;
        document.getElementById('moreSearch').style.display=(d.num_found||0)>bookSearchPage*24?'inline-block':'none';
        document.getElementById('searchSection').scrollIntoView({behavior:'smooth'});
    }catch(e){setError(e.message)}
}

function bookKeyFromDoc(b){return (b.key||'').replace('/works/','')}
function searchCard(b){
    const k=bookKeyFromDoc(b),img=coverUrl(b.cover_i,'M'),authors=(b.author_name||[]).slice(0,2).join(', ');
    return `<article class="poster-card" onclick="openBook('${escapeHtml(k)}')">${img?`<img loading="lazy" src="${img}" alt="" onerror="this.outerHTML='<div class=&quot;poster-fallback&quot;>${escapeHtml(b.title||'Libro')}</div>'">`:`<div class="poster-fallback">${escapeHtml(b.title||'Libro')}</div>`}<div class="card-info"><div class="card-title">${escapeHtml(b.title||'Senza titolo')}</div><div class="card-meta">${escapeHtml(authors||'Autore sconosciuto')} · ${b.first_publish_year||'—'}</div></div></article>`
}

function libraryCard(x,owner=currentUsername){
    const m=x.metadata||{},img=m.coverUrl||'',p=bookProgressText(x);const canEdit=owner===currentUsername;
    return `<article class="poster-card" onclick="openBook('${escapeHtml(x.openLibraryId||x.id)}')">${canEdit?`<button class="card-edit" onclick="event.stopPropagation();openBook('${escapeHtml(x.openLibraryId||x.id)}',true)">EDIT</button>`:''}${img?`<img loading="lazy" src="${escapeHtml(img)}" alt="">`:`<div class="poster-fallback">${escapeHtml(m.title||'Libro')}</div>`}<span class="author-dot ${owner}" title="${labelFor(owner)}"></span><div class="card-info"><div class="card-title">${escapeHtml(m.title||'Senza titolo')}</div><div class="card-meta">${escapeHtml(p||m.authors?.join(', ')||'')}</div>${x.status==='want'?`<div class="ownership-chip">${x.purchaseState==='owned'?'GIÀ COMPRATO':'DA COMPRARE'}</div>`:''}${x.status==='read'&&x.readDate?`<div class="read-date-chip">LETTO ${formatReadDate(x.readDate)}</div>`:''}${bookProgressPercent(x)>0?`<div class="progress-line"><i style="width:${bookProgressPercent(x)}%"></i></div>`:''}</div></article>`
}

function bookProgressText(x){if(x.status==='read')return 'Completato';if(x.status!=='reading')return '';const bits=[];if(x.progressPage)bits.push(`pag. ${x.progressPage}`);if(x.progressChapter)bits.push(`cap. ${x.progressChapter}`);return bits.join(' · ')}
function bookProgressPercent(x){if(x.status==='read')return 100;if(x.status!=='reading')return 0;const total=x.metadata?.pages||0;return total&&x.progressPage?Math.min(98,Math.round(x.progressPage/total*100)):20}

async function refreshLibraries(){[myBooks,otherBooks]=await Promise.all([readLibrary('books',currentUsername),readLibrary('books',otherUser(currentUsername))]);renderPersonalSections()}
function timestampMillis(v){if(!v)return 0;if(v.toMillis)return v.toMillis();const d=new Date(v);return Number.isNaN(d.getTime())?0:d.getTime()}
function readDateMillis(v){if(!v)return 0;const d=new Date(String(v)+'T12:00:00');return Number.isNaN(d.getTime())?0:d.getTime()}
function formatReadDate(v){if(!v)return '';const d=new Date(String(v)+'T12:00:00');return Number.isNaN(d.getTime())?'':d.toLocaleDateString('it-IT',{day:'2-digit',month:'2-digit',year:'numeric'})}
function sortBooks(items){
    const arr=[...items];
    if(bookSortMode==='alpha') return arr.sort((a,b)=>(a.metadata?.title||'').localeCompare(b.metadata?.title||'','it',{sensitivity:'base'}));
    if(bookSortMode==='read') return arr.sort((a,b)=>readDateMillis(b.readDate)-readDateMillis(a.readDate) || timestampMillis(b.createdAt)-timestampMillis(a.createdAt));
    return arr.sort((a,b)=>timestampMillis(b.createdAt)-timestampMillis(a.createdAt));
}
function setBookSort(mode){bookSortMode=['added','alpha','read'].includes(mode)?mode:'added';localStorage.setItem('booksSortMode',bookSortMode);renderPersonalSections()}
function renderPersonalSections(){
    const mine=Object.values(myBooks),other=Object.values(otherBooks);
    renderRail('wantBuyRail',mine.filter(x=>x.status==='want'&&x.purchaseState!=='owned'));
    renderRail('wantOwnedRail',mine.filter(x=>x.status==='want'&&x.purchaseState==='owned'));
    renderRail('readingRail',mine.filter(x=>x.status==='reading'));
    renderRail('readRail',mine.filter(x=>x.status==='read'));
    renderRail('favoritesRail',mine.filter(x=>x.favorite));
    renderRail('otherOnlyRail',other.filter(x=>x.status==='read'&&myBooks[x.id]?.status!=='read'),otherUser(currentUsername));
    renderRail('bothRail',mine.filter(x=>x.status==='read'&&otherBooks[x.id]?.status==='read'));
}
function renderRail(id,items,owner=currentUsername){const el=document.getElementById(id);items=sortBooks(items);if(!items.length){el.innerHTML='<div class="empty">Ancora niente qui.</div>';return}el.innerHTML=items.map(x=>libraryCard(x,owner)).join('')}

async function openBook(workId,startEdit=false){
    document.getElementById('detailModal').classList.add('open');
    document.getElementById('modalContent').innerHTML='<div class="loading">Caricamento dettagli…</div>';
    editingBook=false;coverFileToUpload=null;
    try{
        const saved=myBooks[workId]||otherBooks[workId]||null;
        if(saved?.metadata?.manual || String(workId).startsWith('manual_')){
            selectedBook={...(saved?.metadata||{}),openLibraryId:workId,manual:true};
        }else{
            let base=searchCache[workId]||saved?.metadata?.searchSnapshot||{};
            let work={};
            try{const r=await fetch(`https://openlibrary.org/works/${encodeURIComponent(workId)}.json`);if(r.ok)work=await r.json()}catch(_){}
            const official=normalizeBook(workId,base,work);
            selectedBook=saved?.metadata?{...official,...saved.metadata,openLibraryId:workId}:official;
        }
        renderDetail();
        if(startEdit && myBooks[workId]) toggleBookEdit(true);
    }catch(e){document.getElementById('modalContent').innerHTML=`<div class="empty">${escapeHtml(e.message)}</div>`}
}

function openManualBook(){
    const id=makeManualId();
    selectedBook={openLibraryId:id,manual:true,title:'',subtitle:'',authors:[],description:'',coverUrl:'',pages:null,totalChapters:null,firstPublishYear:'',firstPublishDate:'',isbn:[],publishers:[],languages:[],subjects:[],editionCount:null,externalLink:'',searchSnapshot:{}};
    editingBook=true;coverFileToUpload=null;
    document.getElementById('detailModal').classList.add('open');renderDetail();
}

function desc(v){if(!v)return'';return typeof v==='string'?v:(v.value||'')}
function normalizeBook(id,s,w){
    const title=w.title||s.title||'Senza titolo';const coverId=(w.covers||[])[0]||s.cover_i||null;
    return {openLibraryId:id,manual:false,title,subtitle:s.subtitle||'',authors:s.author_name||[],authorKeys:s.author_key||[],firstPublishYear:s.first_publish_year||'',firstPublishDate:w.first_publish_date||'',description:desc(w.description),coverUrl:coverUrl(coverId,'L'),pages:s.number_of_pages_median||null,totalChapters:null,editionCount:s.edition_count||null,isbn:(s.isbn||[]).slice(0,8),publishers:(s.publisher||[]).slice(0,8),languages:(s.language||[]).slice(0,8),subjects:(w.subjects||s.subject||[]).slice(0,25),ratingsAverage:s.ratings_average||null,ratingsCount:s.ratings_count||null,readingLogCount:s.readinglog_count||null,ebookAccess:s.ebook_access||'',links:(w.links||[]).slice(0,5),externalLink:`https://openlibrary.org/works/${id}`,searchSnapshot:s};
}

function renderDetail(){
    const m=selectedBook,k=m.openLibraryId,saved=myBooks[k]||{};
    document.getElementById('modalHero').style.backgroundImage=m.coverUrl?`url('${String(m.coverUrl).replace(/'/g,"\\'")}')`:'';
    const source=m.manual?'Inserito manualmente':'Open Library + modifiche personali';
    document.getElementById('modalContent').innerHTML=`
      <h2>${escapeHtml(m.title||'Nuovo libro')}</h2>
      ${m.subtitle?`<div style="font-size:18px;color:#bbb">${escapeHtml(m.subtitle)}</div>`:''}
      <span class="book-source">${escapeHtml(source)}</span>
      <div class="chips">${m.firstPublishYear?`<span class="chip">${escapeHtml(m.firstPublishYear)}</span>`:''}${m.pages?`<span class="chip">${m.pages} pagine</span>`:''}${m.totalChapters?`<span class="chip">${m.totalChapters} capitoli</span>`:''}${(m.subjects||[]).slice(0,6).map(x=>`<span class="chip">${escapeHtml(x)}</span>`).join('')}</div>
      <p class="synopsis">${escapeHtml(m.description||'Nessuna descrizione disponibile.')}</p>
      <div class="metadata"><div><b>Autore/i:</b> ${escapeHtml((m.authors||[]).join(', ')||'—')}</div><div><b>Prima pubblicazione:</b> ${escapeHtml(m.firstPublishDate||m.firstPublishYear||'—')}</div><div><b>Editori:</b> ${escapeHtml((m.publishers||[]).join(', ')||'—')}</div><div><b>Lingue:</b> ${escapeHtml((m.languages||[]).join(', ')||'—')}</div><div><b>ISBN:</b> ${escapeHtml((m.isbn||[]).join(', ')||'—')}</div><div><b>Generi / argomenti:</b> ${escapeHtml((m.subjects||[]).slice(0,10).join(', ')||'—')}</div></div>
      <div class="save-row"><button class="save-btn" onclick="toggleBookEdit()">EDIT</button>${m.externalLink?`<button class="nav-btn" onclick="window.open('${escapeHtml(m.externalLink)}','_blank')">SCHEDA ESTERNA</button>`:''}</div>
      <div id="bookEditArea">${editingBook?editorHtml(m):''}</div>
      ${!editingBook?personalHtml(saved,m):''}`;
    if(editingBook) bindCoverPreview(); else setTimeout(toggleStatusFields,0);
}

function personalHtml(saved,m){
    return `<div class="personal-box"><h3>La tua scheda</h3><div class="form-grid"><div class="field"><label>Stato</label><select id="detailStatus" onchange="toggleStatusFields()"><option value="want" ${saved.status==='want'||!saved.status?'selected':''}>Vuoi leggere</option><option value="reading" ${saved.status==='reading'?'selected':''}>Stai leggendo</option><option value="read" ${saved.status==='read'?'selected':''}>Letto</option></select></div><div class="field" id="purchaseField"><label>Acquisto</label><select id="detailPurchase"><option value="buy" ${saved.purchaseState!=='owned'?'selected':''}>Da comprare</option><option value="owned" ${saved.purchaseState==='owned'?'selected':''}>Già comprato</option></select></div><div class="field" id="readDateField"><label>Data in cui l'hai letto</label><input id="detailReadDate" type="date" value="${escapeHtml(saved.readDate||'')}"></div><div class="field favorite-toggle"><label><input id="detailFavorite" type="checkbox" ${saved.favorite?'checked':''}> Preferito</label></div><div class="field"><label>Pagina raggiunta ${m.pages?`(${m.pages} totali)`:''}</label><input id="progressPage" type="number" min="0" ${m.pages?`max="${m.pages}"`:''} value="${Number(saved.progressPage||0)}"></div><div class="field"><label>Capitolo raggiunto</label><input id="progressChapter" type="text" value="${escapeHtml(saved.progressChapter||'')}"></div><div class="field"><label>Il tuo voto (0-10)</label><input id="detailRating" type="number" min="0" max="10" step="0.5" value="${saved.rating??''}"></div><div class="field full"><label>Note personali</label><textarea id="detailNotes">${escapeHtml(saved.notes||'')}</textarea></div></div><div class="save-row"><button class="save-btn" onclick="saveCurrentBook()">SALVA</button>${saved.id?`<button class="danger-btn" onclick="removeCurrentBook()">RIMUOVI</button>`:''}</div></div>`;
}

function editorHtml(m){
    return `<div class="edit-panel"><h3>Modifica informazioni del libro</h3><div class="edit-cover-row"><div><img id="editCoverPreview" class="edit-cover-preview" src="${escapeHtml(m.coverUrl||'favicon.png')}" alt=""><div class="small-help">Puoi usare un URL oppure caricare una nuova immagine. L'immagine caricata viene salvata su Cloudinary.</div></div><div class="edit-grid"><div class="field full"><label>Nuova copertina dal dispositivo</label><input id="editCoverFile" type="file" accept="image/*"></div><div class="field full"><label>URL copertina</label><input id="editCoverUrl" value="${escapeHtml(m.coverUrl||'')}"></div></div></div><div class="edit-grid" style="margin-top:15px"><div class="field"><label>Titolo</label><input id="editTitle" value="${escapeHtml(m.title||'')}"></div><div class="field"><label>Sottotitolo</label><input id="editSubtitle" value="${escapeHtml(m.subtitle||'')}"></div><div class="field full"><label>Autori, separati da virgola</label><input id="editAuthors" value="${escapeHtml((m.authors||[]).join(', '))}"></div><div class="field full"><label>Descrizione</label><textarea id="editDescription">${escapeHtml(m.description||'')}</textarea></div><div class="field"><label>Pagine totali</label><input id="editPages" type="number" min="0" value="${m.pages||''}"></div><div class="field"><label>Capitoli totali</label><input id="editChapters" type="number" min="0" value="${m.totalChapters||''}"></div><div class="field"><label>Anno prima pubblicazione</label><input id="editYear" value="${escapeHtml(m.firstPublishYear||'')}"></div><div class="field"><label>Data prima pubblicazione</label><input id="editPublishDate" value="${escapeHtml(m.firstPublishDate||'')}"></div><div class="field full"><label>Editori, separati da virgola</label><input id="editPublishers" value="${escapeHtml((m.publishers||[]).join(', '))}"></div><div class="field full"><label>ISBN, separati da virgola</label><input id="editIsbn" value="${escapeHtml((m.isbn||[]).join(', '))}"></div><div class="field"><label>Lingue, separate da virgola</label><input id="editLanguages" value="${escapeHtml((m.languages||[]).join(', '))}"></div><div class="field"><label>Numero edizioni</label><input id="editEditionCount" type="number" min="0" value="${m.editionCount||''}"></div><div class="field full"><label>Generi / argomenti, separati da virgola</label><input id="editSubjects" value="${escapeHtml((m.subjects||[]).join(', '))}"></div><div class="field full"><label>Link esterno</label><input id="editExternalLink" value="${escapeHtml(m.externalLink||'')}"></div></div><div class="editor-actions"><button class="save-btn" onclick="saveBookMetadataEdits()">SALVA MODIFICHE</button><button class="nav-btn" onclick="cancelBookEdit()">ANNULLA</button></div></div>`;
}

function toggleBookEdit(force){editingBook=typeof force==='boolean'?force:!editingBook;renderDetail()}
function cancelBookEdit(){editingBook=false;coverFileToUpload=null;renderDetail()}
function bindCoverPreview(){
    const file=document.getElementById('editCoverFile'),url=document.getElementById('editCoverUrl'),preview=document.getElementById('editCoverPreview');
    file?.addEventListener('change',()=>{coverFileToUpload=file.files?.[0]||null;if(coverFileToUpload){const r=new FileReader();r.onload=e=>preview.src=e.target.result;r.readAsDataURL(coverFileToUpload)}});
    url?.addEventListener('input',()=>{if(!coverFileToUpload&&url.value.trim())preview.src=url.value.trim()});
}

async function getCloudinarySignatureForBooks(){
    const token=await auth.currentUser.getIdToken();
    const response=await fetch('/.netlify/functions/cloudinary-sign',{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`},body:JSON.stringify({date:'books'})});
    const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||'Cloudinary non disponibile');return data;
}
async function uploadBookCover(file){
    const signed=await getCloudinarySignatureForBooks();const form=new FormData();form.append('file',file);form.append('api_key',signed.apiKey);form.append('timestamp',String(signed.timestamp));form.append('signature',signed.signature);form.append('folder',signed.folder);
    const response=await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(signed.cloudName)}/image/upload`,{method:'POST',body:form});const result=await response.json().catch(()=>({}));if(!response.ok)throw new Error(result.error?.message||'Upload copertina non riuscito');return result;
}

async function saveBookMetadataEdits(){
    const id=selectedBook.openLibraryId;const btn=event?.target;if(btn)btn.disabled=true;
    try{
        let cover=document.getElementById('editCoverUrl').value.trim();let cloudinaryPublicId=selectedBook.coverCloudinaryPublicId||null;
        if(coverFileToUpload){const uploaded=await uploadBookCover(coverFileToUpload);cover=uploaded.secure_url;cloudinaryPublicId=uploaded.public_id}
        const updated={...selectedBook,manual:selectedBook.manual||String(id).startsWith('manual_'),title:document.getElementById('editTitle').value.trim()||'Senza titolo',subtitle:document.getElementById('editSubtitle').value.trim(),authors:splitList(document.getElementById('editAuthors').value),description:document.getElementById('editDescription').value.trim(),coverUrl:cover,pages:Number(document.getElementById('editPages').value)||null,totalChapters:Number(document.getElementById('editChapters').value)||null,firstPublishYear:document.getElementById('editYear').value.trim(),firstPublishDate:document.getElementById('editPublishDate').value.trim(),publishers:splitList(document.getElementById('editPublishers').value),isbn:splitList(document.getElementById('editIsbn').value),languages:splitList(document.getElementById('editLanguages').value),editionCount:Number(document.getElementById('editEditionCount').value)||null,subjects:splitList(document.getElementById('editSubjects').value),externalLink:document.getElementById('editExternalLink').value.trim(),coverCloudinaryPublicId:cloudinaryPublicId,customized:true};
        const old=myBooks[id]||{};
        const payload={openLibraryId:id,status:old.status||'want',purchaseState:old.purchaseState||'buy',favorite:!!old.favorite,progressPage:Number(old.progressPage||0),progressChapter:old.progressChapter||'',rating:old.rating??null,notes:old.notes||'',readDate:old.readDate||'',metadata:updated,createdAt:old.createdAt||firebase.firestore.FieldValue.serverTimestamp()};
        await saveLibraryItem('books',id,payload);selectedBook=updated;editingBook=false;coverFileToUpload=null;showToast('Modifiche salvate');await refreshLibraries();renderDetail();
    }catch(e){setError(e.message)}finally{if(btn)btn.disabled=false}
}

function toggleStatusFields(){const s=document.getElementById('detailStatus');const purchase=document.getElementById('purchaseField');const readDate=document.getElementById('readDateField');if(!s)return;if(purchase)purchase.style.display=s.value==='want'?'flex':'none';if(readDate)readDate.style.display=s.value==='read'?'flex':'none'}
function togglePurchaseField(){toggleStatusFields()}


function calendarDateKey(date){
    if(!date)return '';
    const p=String(date).split('-').map(Number);
    if(p.length!==3||p.some(Number.isNaN))return '';
    return `${p[0]}-${p[1]}-${p[2]}`;
}
function readingEventKey(bookId){return `${currentUsername}_${safeId(bookId)}`}
async function updateCalendarReadingEvents(dayKey,mutator){
    if(!dayKey)return;
    const ref=db.collection('calendar').doc(dayKey);
    await db.runTransaction(async tx=>{
        const snap=await tx.get(ref);
        const data=snap.exists?(snap.data()||{}):{};
        const events={...(data.readingEvents||{})};
        mutator(events);
        tx.set(ref,{readingEvents:events},{merge:true});
    });
}
async function syncBookCalendarEvent(bookId,title,oldDate,newDate,status){
    const key=readingEventKey(bookId);
    const oldKey=calendarDateKey(oldDate);
    const newKey=status==='read'?calendarDateKey(newDate):'';
    if(oldKey && oldKey!==newKey){
        await updateCalendarReadingEvents(oldKey,events=>{delete events[key]});
    }
    if(newKey){
        await updateCalendarReadingEvents(newKey,events=>{
            events[key]={type:'book-read',bookId,user:currentUsername,title:title||'Libro',readDate:newDate,updatedAt:Date.now()};
        });
    } else if(oldKey){
        await updateCalendarReadingEvents(oldKey,events=>{delete events[key]});
    }
}

async function saveCurrentBook(){
    const m=selectedBook,k=m.openLibraryId;
    const status=document.getElementById('detailStatus').value;
    const old=myBooks[k]||{};
    const readDate=status==='read'?(document.getElementById('detailReadDate')?.value||old.readDate||''):'';
    const payload={openLibraryId:k,status,purchaseState:status==='want'?(document.getElementById('detailPurchase')?.value||'buy'):(old.purchaseState||'owned'),favorite:document.getElementById('detailFavorite').checked,progressPage:Number(document.getElementById('progressPage').value)||0,progressChapter:document.getElementById('progressChapter').value.trim(),rating:Number(document.getElementById('detailRating').value)||null,notes:document.getElementById('detailNotes').value.trim(),readDate,metadata:m,createdAt:old.createdAt||firebase.firestore.FieldValue.serverTimestamp()};
    await saveLibraryItem('books',k,payload);
    await syncBookCalendarEvent(k,m.title,old.readDate||'',readDate,status);
    showToast('Salvato');await refreshLibraries();renderDetail();toggleStatusFields();
}
async function removeCurrentBook(){const k=selectedBook.openLibraryId;if(!confirm('Rimuovere questo libro dalla tua libreria?'))return;const old=myBooks[k]||{};await syncBookCalendarEvent(k,old.metadata?.title||selectedBook.title,old.readDate||'','', 'removed');await deleteLibraryItem('books',k);showToast('Rimosso');await refreshLibraries();closeDetail()}
function closeDetail(){document.getElementById('detailModal').classList.remove('open');selectedBook=null;editingBook=false;coverFileToUpload=null}
