// TextSocial — Full Feature Frontend (client-side) using Firebase (compat SDKs)
// Replace firebaseConfig with your project's config from Firebase Console -> Project Settings -> Your Apps

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

// ---------- NAV ----------
function navigate(page){
  ['home','post','profile','messages','communities','notifications'].forEach(p=>{
    const el = document.getElementById(p);
    if(el) el.style.display = (p===page || (p==='home' && page==='home')) ? 'block' : 'none';
  });
}
function setFeed(mode){
  currentFeed = mode; loadFeed();
}

// ---------- AUTH ----------
auth.onAuthStateChanged(async user=>{
  if(user){
    document.getElementById('auth').style.display='none';
    document.getElementById('main').style.display='block';
    await loadCurrentUser();
    setFeed('home');
    loadFeed();
    populateDMSelect();
    loadCommunityList();
    loadNotifications();
  } else {
    document.getElementById('auth').style.display='block';
    document.getElementById('main').style.display='none';
  }
});

async function signup(){
  const email = document.getElementById('email').value.trim();
  const pw = document.getElementById('password').value;
  const username = document.getElementById('username').value.trim();
  const emoji = document.getElementById('profileEmoji').value;
  if(!email||!pw||!username){ showAuth('Fill all'); return; }
  try{
    const uc = await auth.createUserWithEmailAndPassword(email,pw);
    await db.collection('users').doc(uc.user.uid).set({
      username, emoji, bio:'', coins:0, followers:[], following:[], level:1
    });
    showAuth('Account created. Login now.');
  }catch(e){ showAuth(e.message) }
}
function login(){ const e=document.getElementById('email').value.trim(), p=document.getElementById('password').value; auth.signInWithEmailAndPassword(e,p).catch(e=>showAuth(e.message)) }
function showAuth(m){ document.getElementById('auth-message').innerText=m; setTimeout(()=>document.getElementById('auth-message').innerText='',3000) }
function logout(){ auth.signOut(); }

// ---------- USER CONTEXT ----------
let currentUserDoc = null;
async function loadCurrentUser(){
  const u = auth.currentUser; if(!u) return;
  const doc = await db.collection('users').doc(u.uid).get();
  currentUserDoc = doc.exists? doc.data(): null;
  // top-right quick info
  document.getElementById('top-right').innerHTML = `<div class="small">${currentUserDoc.username} · ${Math.floor(currentUserDoc.coins||0)} coins</div>`;
  renderProfileCard();
}

// ---------- THREADS / POSTS ----------
let currentFeed = 'home'; // home, following, trending
let feedUnsub = null;

async function createThread(){
  const u = auth.currentUser; if(!u) return alert('login');
  const text = document.getElementById('postText').value.trim();
  if(!text) return alert('Write something');
  const doc = await db.collection('threads').add({
    authorId: u.uid,
    text,
    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
    likes: [],
    reposts: 0,
    community: null,
    hashtags: extractHashtags(text),
    mentions: extractMentions(text)
  });
  // reward coin
  await db.collection('users').doc(u.uid).update({ coins: firebase.firestore.FieldValue.increment(1) });
  document.getElementById('postText').value = '';
  loadFeed();
  navigate('home');
  // notify mentioned users
  notifyMentions(doc.id, extractMentions(text));
}

function extractHashtags(text){ return (text.match(/#\w+/g) || []).map(s=>s.slice(1).toLowerCase()); }
function extractMentions(text){ return (text.match(/@\w+/g) || []).map(s=>s.slice(1).toLowerCase()); }

function loadFeed(){
  const feedEl = document.getElementById('feed');
  feedEl.innerHTML = 'Loading...';
  if(feedUnsub) feedUnsub();
  let q = db.collection('threads').orderBy('timestamp','desc').limit(200);
  if(currentFeed==='trending') q = db.collection('threads').orderBy('reposts','desc').limit(100);
  feedUnsub = q.onSnapshot(async snap=>{
    feedEl.innerHTML = '';
    if(snap.empty){ feedEl.innerHTML = '<div class="hint">No threads</div>'; return; }
    for(const d of snap.docs){
      const el = await renderThread(d.id, d.data());
      feedEl.appendChild(el);
    }
  });
}

async function renderThread(id, data){
  const box = document.createElement('div'); box.className='thread';
  const meta = document.createElement('div'); meta.className='meta';
  const left = document.createElement('div'); left.innerText = '';
  const right = document.createElement('div'); right.innerText = timeAgo(data.timestamp && data.timestamp.toDate? data.timestamp.toDate(): new Date());
  meta.appendChild(left); meta.appendChild(right);
  const text = document.createElement('div'); text.className='text'; text.innerText = data.text;
  const actions = document.createElement('div'); actions.className='actions';
  const likeBtn = document.createElement('button'); likeBtn.className='btn'; likeBtn.innerText = `♡ ${(data.likes||[]).length}`;
  likeBtn.onclick = ()=> toggleLike(id, data.likes||[]);
  const repostBtn = document.createElement('button'); repostBtn.className='btn'; repostBtn.innerText = `↻ ${data.reposts||0}`;
  repostBtn.onclick = ()=> repostThread(id);
  const dmBtn = document.createElement('button'); dmBtn.className='btn'; dmBtn.innerText = 'Send';
  dmBtn.onclick = ()=> openShareDialog(id, data);
  actions.appendChild(likeBtn); actions.appendChild(repostBtn); actions.appendChild(dmBtn);
  box.appendChild(meta); box.appendChild(text); box.appendChild(actions);
  // load author
  try{
    const a = await db.collection('users').doc(data.authorId).get();
    if(a.exists){
      const ad = a.data();
      left.innerHTML = `<span style="font-size:18px">${ad.emoji}</span> <strong>${ad.username}</strong> · ${Math.floor(ad.coins||0)} coins`;
      left.onclick = ()=> openUserProfile(data.authorId);
    }
  }catch(e){}
  return box;
}

async function toggleLike(threadId, likes){
  const u = auth.currentUser; if(!u) return alert('Login');
  const ref = db.collection('threads').doc(threadId);
  if((likes||[]).includes(u.uid)){
    await ref.update({ likes: likes.filter(x=>x!==u.uid) });
  } else {
    await ref.update({ likes: [...(likes||[]), u.uid] });
    // give author coin
    const td = await ref.get(); const author = td.data().authorId;
    if(author) await db.collection('users').doc(author).update({ coins: firebase.firestore.FieldValue.increment(0.2) });
    // create notification
    createNotification(author, auth.currentUser.uid, 'like', threadId);
  }
}

// repost (quote)
async function repostThread(threadId){
  const u = auth.currentUser; if(!u) return alert('Login');
  const t = await db.collection('threads').doc(threadId).get();
  const d = t.data();
  await db.collection('threads').add({
    authorId: u.uid, text: 'Repost: ' + d.text, timestamp: firebase.firestore.FieldValue.serverTimestamp(),
    likes: [], reposts:0, hashtags: d.hashtags || [], mentions: d.mentions || []
  });
  await db.collection('threads').doc(threadId).update({ reposts: firebase.firestore.FieldValue.increment(1) });
  // coin rewards
  await db.collection('users').doc(u.uid).update({ coins: firebase.firestore.FieldValue.increment(0.5) });
}

// ---------- NOTIFICATIONS ----------
async function createNotification(targetUserId, fromUserId, type, threadId){
  if(!targetUserId) return;
  await db.collection('notifications').add({
    target: targetUserId, from: fromUserId, type, threadId, ts: firebase.firestore.FieldValue.serverTimestamp()
  });
}
async function loadNotifications(){
  const u = auth.currentUser; if(!u) return;
  const q = await db.collection('notifications').where('target','==',u.uid).orderBy('ts','desc').limit(50).get();
  const list = document.getElementById('notifList'); list.innerHTML = '';
  q.forEach(doc=>{
    const d = doc.data();
    const el = document.createElement('div'); el.className = 'thread';
    el.innerText = `${d.type} from ${d.from}`;
    list.appendChild(el);
  });
}

// ---------- USERS / PROFILE ----------
async function renderProfileCard(){
  const u = auth.currentUser; if(!u) return;
  const doc = await db.collection('users').doc(u.uid).get();
  const d = doc.data();
  const card = document.getElementById('profileCard'); card.innerHTML = `<div class="profile-emoji">${d.emoji}</div>
    <div><div class="profile-name">${d.username}</div><div class="hint">${d.bio||''}</div><div class="hint">${Math.floor(d.coins||0)} coins · Level ${d.level||1}</div></div>`;
  loadMyThreads();
}
async function openUserProfile(uid){
  // show other user's profile in profile page
  const doc = await db.collection('users').doc(uid).get();
  if(!doc.exists) return alert('User not found');
  const d = doc.data();
  document.getElementById('profileCard').innerHTML = `<div class="profile-emoji">${d.emoji}</div>
    <div><div class="profile-name">${d.username}</div><div class="hint">${d.bio||''}</div><div class="hint">${Math.floor(d.coins||0)} coins</div></div>`;
  // show their threads
  const snap = await db.collection('threads').where('authorId','==',uid).orderBy('timestamp','desc').get();
  const box = document.getElementById('myThreads'); box.innerHTML = '';
  snap.forEach(s=> box.appendChild(renderThread(s.id, s.data())));
  navigate('profile');
}
async function editProfilePrompt(){
  const bio = prompt('Edit bio (max 140 chars)', currentUserDoc.bio||'') || '';
  await db.collection('users').doc(auth.currentUser.uid).update({ bio });
  await loadCurrentUser();
  renderProfileCard();
}
async function loadMyThreads(){
  const u = auth.currentUser; if(!u) return;
  const snap = await db.collection('threads').where('authorId','==',u.uid).orderBy('timestamp','desc').get();
  const box = document.getElementById('myThreads'); box.innerHTML = '';
  snap.forEach(s=> box.appendChild(renderThread(s.id, s.data())));
}

// ---------- FOLLOW SYSTEM ----------
async function followUser(targetUid){
  const me = auth.currentUser; if(!me) return;
  const meRef = db.collection('users').doc(me.uid); const otherRef = db.collection('users').doc(targetUid);
  const meDoc = await meRef.get(); const otherDoc = await otherRef.get();
  const meData = meDoc.data(), otherData = otherDoc.data();
  if((meData.following||[]).includes(targetUid)) return; // already
  await meRef.update({ following: [...(meData.following||[]), targetUid] });
  await otherRef.update({ followers: [...(otherData.followers||[]), me.uid], coins: firebase.firestore.FieldValue.increment(0.5) });
}

// ---------- MESSAGING ----------
async function populateDMSelect(){
  const sel = document.getElementById('dmSelect'); sel.innerHTML = '<option value="">Choose</option>';
  const u = auth.currentUser; if(!u) return;
  const meDoc = await db.collection('users').doc(u.uid).get(); const following = meDoc.data().following || [];
  if(following.length===0) sel.innerHTML += '<option disabled>No follows</option>';
  for(const f of following){
    const d = await db.collection('users').doc(f).get();
    if(d.exists) sel.innerHTML += `<option value="${f}">${d.data().username}</option>`;
  }
}
let currentDM = null;
async function openDM(){
  const other = document.getElementById('dmSelect').value; if(!other) return alert('Select');
  const u = auth.currentUser; const pair = [u.uid, other].sort();
  const q = await db.collection('messages').where('participants','==',pair).limit(1).get();
  if(q.empty){ const doc = await db.collection('messages').add({ participants: pair, messages: [] }); currentDM = doc.id; }
  else currentDM = q.docs[0].id;
  db.collection('messages').doc(currentDM).onSnapshot(snap=>{
    const data = snap.data(); const win = document.getElementById('dmWindow'); win.innerHTML = '';
    (data.messages||[]).forEach(m=>{
      const el = document.createElement('div'); el.className = 'dm-msg ' + (m.from===auth.currentUser.uid? 'me':'other'); el.innerText = m.text;
      win.appendChild(el);
    }); win.scrollTop = win.scrollHeight;
  });
}
async function sendDM(){
  const txt = document.getElementById('dmInput').value.trim(); if(!txt) return;
  const u = auth.currentUser; if(!u) return;
  if(!currentDM) return alert('Open chat first');
  const msg = { from: u.uid, text: txt, ts: firebase.firestore.FieldValue.serverTimestamp() };
  await db.collection('messages').doc(currentDM).update({ messages: firebase.firestore.FieldValue.arrayUnion(msg) });
  document.getElementById('dmInput').value = '';
  // coin cost
  await db.collection('users').doc(u.uid).update({ coins: firebase.firestore.FieldValue.increment(-0.1) });
}

// ---------- COMMUNITIES ----------
async function createCommunity(){
  const name = document.getElementById('communityName').value.trim();
  if(!name) return alert('Enter name');
  await db.collection('communities').add({ name, members: [auth.currentUser.uid], description:'', posts:0 });
  loadCommunityList();
}
async function loadCommunityList(){
  const snap = await db.collection('communities').orderBy('name').get();
  const box = document.getElementById('communityList'); box.innerHTML = '';
  snap.forEach(d=>{
    const data = d.data();
    const el = document.createElement('div'); el.className='thread'; el.innerHTML = `<strong>${data.name}</strong><div class="hint">${data.description||''}</div><div class="row"><button class="btn" onclick="joinCommunity('${d.id}')">Join</button></div>`;
    box.appendChild(el);
  });
}
async function joinCommunity(cid){
  const me = auth.currentUser; if(!me) return;
  const ref = db.collection('communities').doc(cid);
  const doc = await ref.get();
  if(!doc.exists) return;
  const data = doc.data();
  if((data.members||[]).includes(me.uid)) return alert('Already a member');
  await ref.update({ members: [...(data.members||[]), me.uid] });
  alert('Joined');
}

// ---------- SEARCH ----------
async function searchAll(q){
  if(!q) return loadFeed();
  const ures = await db.collection('users').where('username','>=',q).where('username','<', q + '\uf8ff').limit(8).get();
  const feed = document.getElementById('feed'); feed.innerHTML = '';
  ures.forEach(d=> {
    const dd = d.data();
    const el = document.createElement('div'); el.className='thread';
    el.innerHTML = `<div class="meta"><strong>${dd.emoji} ${dd.username}</strong><div class="hint">${Math.floor(dd.coins||0)} coins</div></div><div class="text">${dd.bio||''}</div><div class="actions"><button class="btn" onclick="openUserProfile('${d.id}')">Open</button></div>`;
    feed.appendChild(el);
  });
}

// ---------- NOTIFY MENTIONS ----------
async function notifyMentions(threadId, mentions){
  for(const m of mentions){
    const q = await db.collection('users').where('username','==', m).limit(1).get();
    if(!q.empty){ const uid = q.docs[0].id; createNotification(uid, auth.currentUser.uid, 'mention', threadId); }
  }
}

// ---------- NOTIFICATIONS ----------
async function createNotification(targetUserId, fromUserId, type, threadId){
  if(!targetUserId) return;
  await db.collection('notifications').add({
    target: targetUserId, from: fromUserId, type, threadId, ts: firebase.firestore.FieldValue.serverTimestamp()
  });
}
async function loadNotifications(){
  const u = auth.currentUser; if(!u) return;
  const q = await db.collection('notifications').where('target','==',u.uid).orderBy('ts','desc').limit(50).get();
  const list = document.getElementById('notifList'); list.innerHTML = '';
  q.forEach(doc=>{
    const d = doc.data();
    const el = document.createElement('div'); el.className = 'thread';
    el.innerText = `${d.type} from ${d.from}`;
    list.appendChild(el);
  });
}

// ---------- UTIL ----------
function timeAgo(d){
  const s = Math.floor((Date.now() - d.getTime())/1000);
  if(s<60) return s+'s'; if(s<3600) return Math.floor(s/60)+'m'; if(s<86400) return Math.floor(s/3600)+'h'; return Math.floor(s/86400)+'d';
}
