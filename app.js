
// ===== Firebase & OpenRouter Config =====
const firebaseConfig = {
  apiKey: "AIzaSyB1BoVi4GzhoneHWhK36QrmS602DR5zH_E",
  authDomain: "abhilashks-f7d2b.firebaseapp.com",
  projectId: "abhilashks-f7d2b",
  storageBucket: "abhilashks-f7d2b.firebasestorage.app",
  messagingSenderId: "419691577962",
  appId: "1:419691577962:web:5c7eb2b102a4140fe08013"
};
const OPENROUTER_API_KEY = "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";

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

function showSection(id){
document.getElementById('feedSection').style.display='none';
document.getElementById('profileSection').style.display='none';
document.getElementById('chatSection').style.display='none';
document.getElementById(id).style.display='block';
}

function loginUser(){
const email=document.getElementById('email').value;
const password=document.getElementById('password').value;
auth.signInWithEmailAndPassword(email,password)
.then(()=> initApp())
.catch(e=> alert(e.message));
}

function signupUser(){
const email=document.getElementById('email').value;
const password=document.getElementById('password').value;
auth.createUserWithEmailAndPassword(email,password)
.then(async (userCredential)=>{
const user=userCredential.user;
await db.collection('users').doc(user.uid).set({
email: email,
coins:0,
followers:[],
following:[],
username: email.split('@')[0]
});
initApp();
})
.catch(e=> alert(e.message));
}

function logout(){
auth.signOut().then(()=>{
document.getElementById('loginSection').style.display='block';
document.getElementById('navButtons').style.display='none';
showSection('');
});
}

function initApp(){
document.getElementById('loginSection').style.display='none';
document.getElementById('navButtons').style.display='block';
showSection('feedSection');

auth.onAuthStateChanged(async user=>{
if(user){
db.collection('posts').orderBy('timestamp','desc').onSnapshot(snapshot=>{
const feedEl=document.getElementById('feed');
feedEl.innerHTML='';
snapshot.forEach(doc=>{
const d=doc.data();
feedEl.innerHTML+=`<div class="post"><strong>${d.username}</strong>: ${d.text} <small>Coins: ${d.coins}</small></div>`;
});
});

const userDoc=await db.collection('users').doc(user.uid).get();
document.getElementById('profileUsername').textContent=userDoc.data().username;
document.getElementById('profileEmail').textContent=userDoc.data().email;
document.getElementById('profileCoins').textContent=userDoc.data().coins;
}
});
}

async function createPost(){
const text=document.getElementById('postText').value.trim();
if(!text) return;
const user=auth.currentUser;
const userDoc=await db.collection('users').doc(user.uid).get();
const username=userDoc.data().username;
const coins=userDoc.data().coins + 1;
await db.collection('posts').add({
text, username, timestamp:firebase.firestore.FieldValue.serverTimestamp(), coins:1
});
await db.collection('users').doc(user.uid).update({coins});
document.getElementById('postText').value='';
}

async function sendMessage(){
const input=document.getElementById('chatInput');
const msg=input.value.trim();
if(!msg) return;
appendChat('You', msg);
input.value='';

const response=await fetch("https://openrouter.ai/api/v1/chat/completions",{
method:'POST',
headers:{
'Content-Type':'application/json',
'Authorization':'Bearer '+OPENROUTER_API_KEY
},
body: JSON.stringify({
model:'gpt-4o-mini',
messages:[{role:'user', content: msg}]
})
});
const data=await response.json();
const reply=data.choices[0].message.content;
appendChat('AI', reply);
}

function appendChat(sender,msg){
const chatbox=document.getElementById('chatbox');
chatbox.innerHTML+=`<div class="chat-msg"><strong>${sender}:</strong> ${msg}</div>`;
chatbox.scrollTop=chatbox.scrollHeight;
}
