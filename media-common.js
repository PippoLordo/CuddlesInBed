const firebaseConfig={apiKey:"AIzaSyCEtnsKsL6EkGmZsgx4lHEHv-CiZ5L3H98",authDomain:"aiydiwdwy-aiygiwgwy.firebaseapp.com",projectId:"aiydiwdwy-aiygiwgwy",storageBucket:"aiydiwdwy-aiygiwgwy.firebasestorage.app",messagingSenderId:"510624883472",appId:"1:510624883472:web:d85e00839e26c8e41c3b95"};
if(!firebase.apps.length)firebase.initializeApp(firebaseConfig);const auth=firebase.auth(),db=firebase.firestore();
const ACCOUNTS={"cucci@cuddles.app":"cucci","cicci@cuddles.app":"cicci"};let currentUsername=null;
function labelFor(u){return u==='cucci'?'Cucci':'Cicci'}function otherUser(u){return u==='cucci'?'cicci':'cucci'}
function escapeHtml(v=''){return String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function fmtDate(v){if(!v)return '—';const d=v.toDate?v.toDate():new Date(v);return Number.isNaN(d.getTime())?'—':d.toLocaleDateString('it-IT')}
function showToast(msg){const t=document.getElementById('toast');if(!t)return;t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),1900)}
function setError(msg=''){const el=document.getElementById('statusBanner');if(!el)return;el.textContent=msg;el.classList.toggle('show',!!msg)}
async function requireAuth(onReady){auth.onAuthStateChanged(async user=>{if(!user){location.href='index.html';return}const u=ACCOUNTS[(user.email||'').toLowerCase()];if(!u){await auth.signOut();location.href='index.html';return}currentUsername=u;const pill=document.getElementById('accountPill');if(pill){pill.textContent=labelFor(u);pill.className='account-pill '+u}await onReady(u)})}
function userCollection(username,kind){return db.collection('users').doc(username).collection(kind)}
async function readLibrary(kind,username=currentUsername){const snap=await userCollection(username,kind).get();const out={};snap.forEach(d=>out[d.id]={id:d.id,...d.data()});return out}
async function saveLibraryItem(kind,id,data){if(!currentUsername)throw new Error('Non autenticato');await userCollection(currentUsername,kind).doc(id).set({...data,owner:currentUsername,updatedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true})}
async function deleteLibraryItem(kind,id){await userCollection(currentUsername,kind).doc(id).delete()}
