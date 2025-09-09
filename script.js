// ===== TextThreads MVP - script.js =====
// IMPORTANT: Replace the firebaseConfig object below with your Firebase web app config
// from Firebase Console -> Project Settings -> Your apps -> SDK config.

const firebaseConfig = {
  apiKey: "AIzaSyB1BoVi4GzhoneHWhK36QrmS602DR5zH_E",
  authDomain: "abhilashks-f7d2b.firebaseapp.com",
  projectId: "abhilashks-f7d2b",
  storageBucket: "abhilashks-f7d2b.firebasestorage.app",
  messagingSenderId: "419691577962",
  appId: "1:419691577962:web:5c7eb2b102a4140fe08013"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// ---------- Authentication ---------- //
function signup() {
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  const username = document.getElementById("username").value.trim();
  const emoji = document.getElementById("profileEmoji").value;

  if (!email || !password || !username) {
    document.getElementById("auth-message").innerText = "Fill email, password and username.";
    return;
  }

  // Create auth user
  auth.createUserWithEmailAndPassword(email, password)
    .then((userCredential) => {
      const uid = userCredential.user.uid;
      // Save user profile in Firestore
      return db.collection('users').doc(uid).set({
        username: username,
        emoji: emoji,
        bio: "",
        coins: 0,
        followersCount: 0,
        followingCount: 0
      });
    })
    .then(() => {
      document.getElementById("auth-message").innerText = "Account created — you can now log in.";
    })
    .catch(err => document.getElementById("auth-message").innerText = err.message);
}

function login() {
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  auth.signInWithEmailAndPassword(email, password)
    .catch(err => document.getElementById("auth-message").innerText = err.message);
}

function logout() {
  auth.signOut();
}

// ---------- Auth State Listener ---------- //
auth.onAuthStateChanged(user => {
  if (user) {
    document.getElementById("auth").style.display = "none";
    document.getElementById("wall").style.display = "block";
    document.getElementById("user-email").innerText = user.email;
    loadThreads();
  } else {
    document.getElementById("auth").style.display = "block";
    document.getElementById("wall").style.display = "none";
  }
});

// ---------- Threads ---------- //
function postThread() {
  const user = auth.currentUser;
  const text = document.getElementById("thread-input").value.trim();
  if (!user) { alert("Please login."); return; }
  if (!text) { alert("Please write something."); return; }
  if (text.length > 1000) { alert("Max 1000 characters."); return; }

  // Add thread document
  db.collection("threads").add({
    authorId: user.uid,
    text: text,
    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
    likes: []
  }).then(() => {
    // small coin reward for posting (basic gamification)
    const userRef = db.collection("users").doc(user.uid);
    return userRef.update({ coins: firebase.firestore.FieldValue.increment(1) });
  }).catch(err => alert(err.message));

  document.getElementById("thread-input").value = "";
}

function loadThreads() {
  const threadsDiv = document.getElementById("threads");
  threadsDiv.innerHTML = "Loading threads…";

  db.collection("threads").orderBy("timestamp","desc")
    .onSnapshot(snapshot => {
      threadsDiv.innerHTML = "";
      snapshot.forEach(doc => {
        const data = doc.data();
        const threadId = doc.id;
        const authorId = data.authorId || "unknown";
        const text = data.text || "";
        const likes = Array.isArray(data.likes) ? data.likes : [];
        // Render thread container
        const div = document.createElement("div");
        div.className = "thread";

        // Fetch author profile (username + emoji)
        db.collection("users").doc(authorId).get().then(authorDoc => {
          const author = authorDoc.exists ? authorDoc.data() : { username: "user", emoji: "😀" };
          const meta = document.createElement("div");
          meta.className = "meta";
          const time = data.timestamp && data.timestamp.toDate ? data.timestamp.toDate().toLocaleString() : "";
          meta.innerHTML = `<strong>${author.emoji} ${author.username}</strong> · <span>${time}</span>`;

          const textDiv = document.createElement("div");
          textDiv.className = "text";
          textDiv.innerText = text;

          const actions = document.createElement("div");
          actions.className = "actions";
          const likeBtn = document.createElement("button");
          likeBtn.className = "small-btn";
          likeBtn.innerText = `Like (${likes.length})`;
          likeBtn.onclick = () => toggleLike(threadId, likes);

          actions.appendChild(likeBtn);

          div.appendChild(meta);
          div.appendChild(textDiv);
          div.appendChild(actions);
          threadsDiv.appendChild(div);
        });
      });
      if (snapshot.empty) threadsDiv.innerHTML = "<em>No threads yet — be the first!</em>";
    }, err => {
      threadsDiv.innerHTML = "Error loading threads: " + err.message;
    });
}

function toggleLike(threadId, currentLikes) {
  const user = auth.currentUser;
  if (!user) { alert("Please login to like."); return; }
  const threadRef = db.collection("threads").doc(threadId);
  const uid = user.uid;
  if (currentLikes.includes(uid)) {
    // unlike
    threadRef.update({ likes: currentLikes.filter(x => x !== uid) }).catch(err => alert(err.message));
  } else {
    threadRef.update({ likes: [...currentLikes, uid] }).catch(err => alert(err.message));
    // reward coin for receiving a like is handled elsewhere (server or cloud function in future)
  }
}
