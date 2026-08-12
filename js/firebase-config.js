// ============================================================
// 4B PAVEMENT TILES — Firebase initialization
// ============================================================
import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import {
  getAuth, setPersistence, browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";

// Your web app's Firebase configuration
export const firebaseConfig = {
  apiKey: "AIzaSyCbT8A2QJrlAtYjBJSaBO6grnqHh_qEdA0",
  authDomain: "b-pavement-tiles-d6a53.firebaseapp.com",
  projectId: "b-pavement-tiles-d6a53",
  storageBucket: "b-pavement-tiles-d6a53.firebasestorage.app",
  messagingSenderId: "309678501894",
  appId: "1:309678501894:web:402b6b60b73c7841da9387"
};

// --- primary app (the signed-in session used throughout the UI) ---
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
setPersistence(auth, browserLocalPersistence).catch(() => {});

// --- secondary app instance -------------------------------------------
// Used ONLY when the owner creates a new manager account from inside the
// app. Firebase's client SDK has no "create another user without logging
// yourself out" call, so we spin up a second, isolated app instance,
// create the account there, then immediately sign it out. The owner's
// session on the primary `auth` instance is never touched.
export function getSecondaryAuth() {
  const name = "secondary";
  const existing = getApps().find(a => a.name === name);
  const secondaryApp = existing || initializeApp(firebaseConfig, name);
  return getAuth(secondaryApp);
}
