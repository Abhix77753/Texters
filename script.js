// ================= TextThreads — UI + Firebase logic =================
// Put your Firebase config here (replace the placeholder)
const firebaseConfig = {
  apiKey: "AIzaSyB1BoVi4GzhoneHWhK36QrmS602DR5zH_E",
  authDomain: "abhilashks-f7d2b.firebaseapp.com",
  projectId: "abhilashks-f7d2b",
  storageBucket: "abhilashks-f7d2b.firebasestorage.app",
  messagingSenderId: "419691577962",
  appId: "1:419691577962:web:5c7eb2b102a4140fe08013"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// SIMPLE NAV
function navigate(page){
  document.querySelectorAll('.page').forEach(p=>p.style.display='none');
  document.getElementById('page-' + page).style.display = 'block';
  // highlight nav
  ['post','feed','me','messages'].forEach(key=>{
    const btn = document.getElementById('nav-'+key);
    if(btn) btn.classList.toggle('active', key===page);
  });
  if(page==='feed') loadFeed();
  if(page==='me') loadMyProfile();
  if(page==='messages') loadDMList();
}
function toggleFollowingFeed(){
  followingOnly = !followingOnly;
  loadFeed();
}

// AUTH
auth.onAuthStateChanged(async user=>{
  if(user){
    document.getElementById('auth').style.display='none';
    document.getElementById('main').style.display='block';
    document.getElementById('top-info').innerHTML = `<span>${user.email}</span> <button class="btn small" onclick="logout()">Logout</button>`;
    // prepare DM select etc
    await loadCurrentUserDoc();
    loadDMList();
    navigate('feed');
  } else {
    document.getElementById('auth').style.display='block';
    document.getElementById('main').style.display='none';
    document.getElementById('top-info').innerHTML = '';
  }
});

async function signup(){
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  const username = document.getElementById('username').value.trim();
  const emoji = document.getElementById('profileEmoji').value;
  if(!email||!password||!username){document.getElementById('auth-message').innerText='Fill all fields'; return;}
  try{
    const userCredential = await auth.createUserWithEmailAndPassword(email,password);
    const uid = userCredential.user.uid;
    await db.collection('users').doc(uid).set({
      username, emoji, bio:'', coins: 0, followers: [], following: []
    });
    document.getElementById('auth-message').innerText='Account created — please login';
  }catch(e){document.getElementById('auth-message').innerText = e.message}
}
function login(){ const email=document.getElementById('email').value.trim(); const pw=document.getElementById('password').value; auth.signInWithEmailAndPassword(email,pw).catch(e=>document.getElementById('auth-message').innerText=e.message) }
function logout(){ auth.signOut() }

// ----------------- USER CONTEXT ------------------
let currentUserDoc = null;
let followingOnly = false;

async function loadCurrentUserDoc(){
  const u = auth.currentUser;
  if(!u) return;
  const doc = await db.collection('users').doc(u.uid).get();
  currentUserDoc = doc.exists? doc.data(): null;
  // fill dm select
  await populateDMSelect();
}

// ----------------- POSTS / THREADS -----------------
async function postThread(){
  const user = auth.currentUser;
  if(!user) return alert('Login first');
  const text = document.getElementById('thread-input').value.trim();
  if(!text) return alert('Write something');
  try{
    await db.collection('threads').add({
      authorId: user.uid,
      text, timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      likes: [], commentsCount: 0
    });
    // give coin for posting
    await db.collection('users').doc(user.uid).update({ coins: firebase.firestore.FieldValue.increment(1) });
    document.getElementById('thread-input').value = '';
  }catch(e){alert(e.message)}
}

function renderThread(doc){
  const data = doc.data();
  const id = doc.id;
  const container = document.createElement('div'); container.className='thread';
  const meta = document.createElement('div'); meta.className='meta';
  const time = data.timestamp && data.timestamp.toDate ? timeAgo(data.timestamp.toDate()) : '';
  meta.innerHTML = `<span id="author-${id}">loading...</span><span>${time}</span>`;

  const text = document.createElement('div'); text.className='text'; text.innerText = data.text;

  const actions = document.createElement('div'); actions.className='actions';
  const likeBtn = document.createElement('button'); likeBtn.className='btn small'; likeBtn.innerText = `Like (${(data.likes||[]).length})`;
  likeBtn.onclick = ()=>toggleLike(id, data.likes || []);
  const openBtn = document.createElement('button'); openBtn.className='btn small'; openBtn.innerText='Open';
  openBtn.onclick = ()=>openProfile(data.authorId);

  actions.appendChild(likeBtn); actions.appendChild(openBtn);

  container.appendChild(meta); container.appendChild(text); container.appendChild(actions);

  // load author username + emoji
  db.collection('users').doc(data.authorId).get().then(a=>{
    if(a.exists){
      const ad = a.data();
      const s = `${ad.emoji} ${ad.username} · ${ad.coins||0} coins`;
      const el = container.querySelector(`#author-${id}`);
      if(el) el.innerHTML = s;
    }
  }).catch(()=>{});
  return container;
}

let feedUnsub = null;
async function loadFeed(){
  const feed = document.getElementById('feed-list'); feed.innerHTML='Loading...';
  if(feedUnsub) feedUnsub(); // detach previous
  const q = db.collection('threads').orderBy('timestamp','desc').limit(200);
  feedUnsub = q.onSnapshot(snap=>{
    feed.innerHTML='';
    if(snap.empty){ feed.innerHTML = '<em>No threads yet</em>'; return; }
    snap.forEach(doc=>{
      const node = renderThread(doc);
      feed.appendChild(node);
    });
  }, err=>{ feed.innerHTML = 'Error: '+err.message });
}

async function toggleLike(threadId, likes){
  const user = auth.currentUser; if(!user) return alert('login to like');
  const uid = user.uid;
  const threadRef = db.collection('threads').doc(threadId);
  if(likes.includes(uid)){
    // unlike
    const newLikes = likes.filter(x=>x!==uid);
    await threadRef.update({ likes: newLikes });
  } else {
    await threadRef.update({ likes: [...likes, uid] });
    // give small coin to author for receiving a like (increment)
    const threadDoc = await threadRef.get();
    const authorId = threadDoc.data().authorId;
    if(authorId) await db.collection('users').doc(authorId).update({ coins: firebase.firestore.FieldValue.increment(0.2) });
  }
}

// ----------------- PROFILE / FOLLOW -----------------
async function openProfile(uid){
  const prof = await db.collection('users').doc(uid).get();
  if(!prof.exists) return alert('User not found');
  const d = prof.data();
  // show a modal-like screen using navigate('me') but fill with other user's info
  document.getElementById('page-me').style.display='block';
  document.getElementById('page-post').style.display='none';
  document.getElementById('page-feed').style.display='none';
  document.getElementById('page-messages').style.display='none';

  const mediv = document.getElementById('me-profile'); mediv.innerHTML='';
  const card = document.createElement('div'); card.className='profile-card';
  card.innerHTML = `<div class="emoji">${d.emoji}</div>
    <div><div class="meta">${d.username}</div><div class="hint">${d.bio||''}</div><div class="hint">${d.coins||0} coins</div></div>`;
  const followBtn = document.createElement('button'); followBtn.className='btn';
  const cur = auth.currentUser;
  if(cur && cur.uid === uid) followBtn.innerText='This is you';
  else {
    const curDoc = await db.collection('users').doc(cur.uid).get();
    const curData = curDoc.data();
    const isFollowing = (curData.following || []).includes(uid);
    followBtn.innerText = isFollowing ? 'Unfollow' : 'Follow';
    followBtn.onclick = ()=> toggleFollow(cur.uid, uid);
  }
  mediv.appendChild(card);
  mediv.appendChild(followBtn);

  // show user's threads under my-threads box
  const mythreads = document.getElementById('my-threads'); mythreads.innerHTML='Loading...';
  const snap = await db.collection('threads').where('authorId','==',uid).orderBy('timestamp','desc').get();
  mythreads.innerHTML='';
  snap.forEach(doc=>{
    mythreads.appendChild(renderThread(doc));
  });
}

// follow/unfollow
async function toggleFollow(meUid, otherUid){
  if(!meUid) return;
  const meRef = db.collection('users').doc(meUid);
  const otherRef = db.collection('users').doc(otherUid);
  const meDoc = await meRef.get(); const otherDoc = await otherRef.get();
  const meData = meDoc.data(); const otherData = otherDoc.data();
  const isFollowing = (meData.following || []).includes(otherUid);
  if(isFollowing){
    // remove
    await meRef.update({ following: (meData.following || []).filter(x=>x!==otherUid), followersCount: firebase.firestore.FieldValue.increment(-1) });
    await otherRef.update({ followers: (otherData.followers || []).filter(x=>x!==meUid), followersCount: firebase.firestore.FieldValue.increment(-1) });
  } else {
    await meRef.update({ following: [...(meData.following||[]), otherUid], followingCount: firebase.firestore.FieldValue.increment(1) });
    await otherRef.update({ followers: [...(otherData.followers||[]), meUid], followersCount: firebase.firestore.FieldValue.increment(1) });
  }
  await loadCurrentUserDoc();
  openProfile(otherUid);
}

// load my profile (Me tab)
async function loadMyProfile(){
  const u = auth.currentUser; if(!u) return;
  const doc = await db.collection('users').doc(u.uid).get();
  const d = doc.data();
  const mediv = document.getElementById('me-profile'); mediv.innerHTML='';
  mediv.innerHTML = `<div class="profile-card"><div class="emoji">${d.emoji}</div>
    <div><div class="meta">${d.username}</div><div class="hint">${d.bio||''}</div><div class="hint">${d.coins||0} coins</div></div></div>
    <div class="row"><button class="btn" onclick="editBioPrompt()">Edit Bio</button><button class="btn" onclick="showFollowers()">Followers (${d.followersCount||0})</button></div>`;
  // my threads
  const snap = await db.collection('threads').where('authorId','==',u.uid).orderBy('timestamp','desc').get();
  const box = document.getElementById('my-threads'); box.innerHTML='';
  snap.forEach(doc=> box.appendChild(renderThread(doc)));
}

function editBioPrompt(){
  const n = prompt('Enter new bio (max 120 chars)');
  if(n===null) return;
  const u = auth.currentUser;
  if(u) db.collection('users').doc(u.uid).update({ bio: n });
}

// ----------------- MESSAGES (basic) -----------------
// Simple design: messages are documents in "messages" collection with participants array and messages[]
// { participants: [uid1, uid2], messages: [{from, text, ts}] }

async function populateDMSelect(){
  const sel = document.getElementById('dm-select');
  sel.innerHTML = '<option value="">Select user</option>';
  // list people you follow
  const u = auth.currentUser; if(!u) return;
  const meDoc = await db.collection('users').doc(u.uid).get();
  const following = meDoc.data().following || [];
  if(following.length===0){ sel.innerHTML += '<option disabled>No followed users</option>'; return; }
  // fetch usernames
  await Promise.all(following.map(async fu=>{
    const d = await db.collection('users').doc(fu).get();
    if(d.exists) {
      sel.innerHTML += `<option value="${fu}">${d.data().username}</option>`;
    }
  }));
}

async function loadDMList(){
  await populateDMSelect();
  document.getElementById('dm-window').innerHTML = '<em>Select a user and Open</em>';
}

let currentDMThreadId = null;
async function openDM(){
  const otherUid = document.getElementById('dm-select').value;
  if(!otherUid) return alert('Choose a user you follow');
  const u = auth.currentUser; if(!u) return;
  // find or create conversation doc where participants exactly [u.uid, otherUid] (sorted)
  const pair = [u.uid, otherUid].sort();
  const q = await db.collection('messages').where('participants','==',pair).limit(1).get();
  if(q.empty){
    const doc = await db.collection('messages').add({ participants: pair, messages: [] });
    currentDMThreadId = doc.id;
  } else currentDMThreadId = q.docs[0].id;
  // subscribe
  db.collection('messages').doc(currentDMThreadId).onSnapshot(snap=>{
    const d = snap.data();
    const win = document.getElementById('dm-window'); win.innerHTML='';
    (d.messages || []).forEach(m=>{
      const el = document.createElement('div'); el.className='dm-msg ' + (m.from===u.uid ? 'me':'other'); el.innerText = m.text;
      win.appendChild(el);
    });
    win.scrollTop = win.scrollHeight;
  });
}

async function sendDM(){
  const txt = document.getElementById('dm-input').value.trim();
  const u = auth.currentUser; if(!u) return;
  if(!currentDMThreadId) return alert('Open a chat first');
  if(!txt) return;
  const m = { from:u.uid, text:txt, ts: firebase.firestore.FieldValue.serverTimestamp() };
  await db.collection('messages').doc(currentDMThreadId).update({ messages: firebase.firestore.FieldValue.arrayUnion(m) });
  document.getElementById('dm-input').value='';
  // small coin cost to send message (encourages careful messaging) - optional
  await db.collection('users').doc(u.uid).update({ coins: firebase.firestore.FieldValue.increment(-0.1) });
}

// ----------------- SEARCH -----------------
async function searchUsers(q){
  if(!q) return;
  const res = await db.collection('users').where('username','>=',q).where('username','<', q + '\uf8ff').limit(10).get();
  const feed = document.getElementById('feed-list'); feed.innerHTML='';
  res.forEach(d=> {
    const data = d.data(); const div = document.createElement('div'); div.className='thread';
    div.innerHTML = `<div class="meta">${data.emoji} ${data.username} · ${data.coins||0} coins</div><div class="text">${data.bio||''}</div><div class="actions"><button class="btn small" onclick="openProfile('${d.id}')">Open</button></div>`;
    feed.appendChild(div);
  });
}

// ----------------- UTIL -----------------
function timeAgo(d){
  const seconds = Math.floor((Date.now() - d.getTime())/1000);
  if(seconds<60) return `${seconds}s`;
  if(seconds<3600) return `${Math.floor(seconds/60)}m`;
  if(seconds<86400) return `${Math.floor(seconds/3600)}h`;
  return `${Math.floor(seconds/86400)}d`;
}