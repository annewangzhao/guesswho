// Firebase connection for the game.
//
// No build step: we load the Firebase SDK from Google's CDN as ES modules and
// pin the version in one place (FB_VERSION) so every import stays in sync.
//
// NOTE: this config is NOT a secret. Every web Firebase app ships these public
// identifiers in the browser. Actual protection comes from Realtime Database
// security rules (see database.rules.json), not from hiding these values.

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js";
import {
  getDatabase,
  ref,
  get,
  set,
  update,
  push,
  remove,
  onValue,
  onDisconnect,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/11.1.0/firebase-database.js";
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/11.1.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyD-_LcrKJ5OU8xbd9YdtfRA34KvIRRGBcE",
  authDomain: "guess-who-bays.firebaseapp.com",
  databaseURL: "https://guess-who-bays-default-rtdb.firebaseio.com",
  projectId: "guess-who-bays",
  storageBucket: "guess-who-bays.firebasestorage.app",
  messagingSenderId: "999480958964",
  appId: "1:999480958964:web:98e0eeb07eaef807c5e3a1",
  // measurementId intentionally omitted — no Analytics.
};

export const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
export const auth = getAuth(app);

// Every player silently gets a stable anonymous identity on load. This uid is
// used as their playerId, and security rules use it to enforce "only the host
// can read the answer" and "you can only edit your own board".
//
// `authReady` resolves with the signed-in user; await it before any DB work.
export const authReady = new Promise((resolve, reject) => {
  onAuthStateChanged(auth, (user) => {
    if (user) resolve(user);
  });
  signInAnonymously(auth).catch(reject);
});

// Re-export the DB helpers so feature code imports them from here (single
// pinned version, and one place to swap the backend later if we ever need to).
export {
  ref,
  get,
  set,
  update,
  push,
  remove,
  onValue,
  onDisconnect,
  serverTimestamp,
};
