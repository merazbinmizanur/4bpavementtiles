// ============================================================
// 4B PAVEMENT TILES — auth helpers (role-based)
// ============================================================
import { auth, db } from "./firebase-config.js";
import {
  signInWithEmailAndPassword, signOut, onAuthStateChanged,
  EmailAuthProvider, reauthenticateWithCredential
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";
import {
  doc, getDoc
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";
import { withTimeout } from "./utils.js";
import { Icon } from "./icons.js";

// ============================================================
// PIN quick-unlock — a DEVICE-LOCAL convenience layer on top of the real
// Firebase session, never a replacement for it. The PIN is hashed and
// stored per-email in localStorage on this device only; it never touches
// Firebase or proves anything to the server — it just gates whether THIS
// browser reveals the already-authenticated panel without retyping the
// full email/password. Forgetting it is a non-event: falling back to the
// real login always works and simply lets the person set a new one.
// ============================================================
async function hashPin(pin) {
  const enc = new TextEncoder().encode(pin);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}
function pinKey(email) { return `4b_pin_${(email || "").trim().toLowerCase()}`; }
export function hasPinFor(email) {
  return !!localStorage.getItem(pinKey(email));
}
export async function setPinFor(email, pin) {
  localStorage.setItem(pinKey(email), await hashPin(pin));
}
export async function verifyPinFor(email, pin) {
  const stored = localStorage.getItem(pinKey(email));
  if (!stored) return false;
  return stored === await hashPin(pin);
}
export function clearPinFor(email) {
  localStorage.removeItem(pinKey(email));
}
// Renders a PIN pad in place of the splash screen and only calls onUnlocked
// once the correct PIN is entered. "PIN ভুলে গেছেন?" signs out, clears the
// stale PIN, and sends the person back to a full email/password login.
function showPinLock(email, onUnlocked) {
  const splash = document.getElementById("splash");
  if (!splash) { onUnlocked(); return; }
  splash.style.cursor = "";
  splash.innerHTML = `
    <div class="pinlock" id="pinlockWrap">
      <div class="brand-mark" id="pinBrandMark"></div>
      <h3>PIN দিন</h3>
      <div class="pin-dots" id="pinDots"><span></span><span></span><span></span><span></span></div>
      <div class="pin-error" id="pinError" style="visibility:hidden;">ভুল PIN, আবার চেষ্টা করুন</div>
      <div class="pin-pad" id="pinPad">
        <button type="button" data-num="1">1</button><button type="button" data-num="2">2</button><button type="button" data-num="3">3</button>
        <button type="button" data-num="4">4</button><button type="button" data-num="5">5</button><button type="button" data-num="6">6</button>
        <button type="button" data-num="7">7</button><button type="button" data-num="8">8</button><button type="button" data-num="9">9</button>
        <span></span><button type="button" data-num="0">0</button><button type="button" data-action="back">⌫</button>
      </div>
      <a href="#" id="pinForgotLink">PIN ভুলে গেছেন?</a>
    </div>`;
  document.getElementById("pinBrandMark").innerHTML = Icon.brand;
  let buf = "";
  let busy = false;
  const dotsEl = document.getElementById("pinDots");
  const errEl = document.getElementById("pinError");
  const wrapEl = document.getElementById("pinlockWrap");
  const updateDots = () => {
    dotsEl.querySelectorAll("span").forEach((d, i) => d.classList.toggle("filled", i < buf.length));
  };
  document.getElementById("pinPad").addEventListener("click", async (e) => {
    if (busy) return;
    const b = e.target.closest("[data-num], [data-action]");
    if (!b) return;
    if (b.dataset.action === "back") { buf = buf.slice(0, -1); updateDots(); return; }
    if (buf.length >= 4) return;
    errEl.style.visibility = "hidden";
    buf += b.dataset.num;
    updateDots();
    if (buf.length === 4) {
      busy = true;
      const ok = await verifyPinFor(email, buf);
      if (ok) { onUnlocked(); return; }
      errEl.style.visibility = "visible";
      wrapEl.classList.add("shake");
      setTimeout(() => { buf = ""; updateDots(); wrapEl.classList.remove("shake"); busy = false; }, 450);
    }
  });
  document.getElementById("pinForgotLink").addEventListener("click", async (e) => {
    e.preventDefault();
    clearPinFor(email);
    await signOut(auth);
    window.location.href = "login.html";
  });
}

export function login(email, password) {
  return signInWithEmailAndPassword(auth, email.trim(), password);
}

export function logout() {
  return signOut(auth);
}

// Re-confirms the CURRENTLY signed-in user's password — a safety checkpoint
// before irreversible actions (e.g. wiping all app data).
export async function reauthenticateWithPassword(password) {
  const user = auth.currentUser;
  if (!user || !user.email) throw { code: "no-user" };
  const cred = EmailAuthProvider.credential(user.email, password);
  await reauthenticateWithCredential(user, cred);
}

export function getProfile(uid) {
  return getDoc(doc(db, "users", uid)).then(snap => snap.exists() ? { id: snap.id, ...snap.data() } : null);
}

// Friendly Bangla text for common Firebase Auth error codes.
export function authErrorText(err) {
  const code = err && err.code ? err.code : "";
  const map = {
    "auth/invalid-email": "সঠিক ইমেইল দিন",
    "auth/user-not-found": "এই ইমেইলে কোনো অ্যাকাউন্ট নেই",
    "auth/wrong-password": "পাসওয়ার্ড সঠিক নয়",
    "auth/invalid-credential": "ইমেইল অথবা পাসওয়ার্ড সঠিক নয়",
    "auth/too-many-requests": "অনেকবার চেষ্টা হয়েছে, কিছুক্ষণ পর আবার চেষ্টা করুন",
    "auth/network-request-failed": "ইন্টারনেট সংযোগ পরীক্ষা করুন",
    "auth/email-already-in-use": "এই ইমেইলে ইতিমধ্যে অ্যাকাউন্ট আছে",
    "auth/weak-password": "পাসওয়ার্ড কমপক্ষে ৬ ক্যারেক্টার হতে হবে",
    "timeout": "সংযোগ ধীর হচ্ছে, ইন্টারনেট চেক করে আবার চেষ্টা করুন",
  };
  return map[code] || "কিছু একটা সমস্যা হয়েছে, আবার চেষ্টা করুন";
}

// Fetch the profile with a timeout, and one silent retry for a brief
// network blip, before giving up and letting the caller show a message.
async function fetchProfileWithRetry(uid) {
  try {
    return await withTimeout(getProfile(uid), 12000);
  } catch (e) {
    if (e && e.code === "timeout") return await withTimeout(getProfile(uid), 12000);
    throw e;
  }
}

// Guards owner.html / manager.html. Redirects to login.html if not signed
// in, or to the correct panel if signed in with a different role.
// onReady(profile, user) fires once, after the role is confirmed.
// If the connection is too slow/unstable to confirm the role, the splash
// screen is switched to a tap-to-retry message instead of spinning forever.
export function guardPage(requiredRole, onReady) {
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      window.location.href = "login.html";
      return;
    }
    let profile;
    try {
      profile = await fetchProfileWithRetry(user.uid);
    } catch (e) {
      showSlowConnectionRetry();
      return;
    }
    if (!profile || !profile.role) {
      await signOut(auth);
      window.location.href = "login.html";
      return;
    }
    if (profile.role !== requiredRole) {
      window.location.href = profile.role === "owner" ? "owner.html" : "manager.html";
      return;
    }
    if (hasPinFor(user.email)) {
      showPinLock(user.email, () => onReady(profile, user));
      return;
    }
    onReady(profile, user);
  });
}

function showSlowConnectionRetry() {
  const splash = document.getElementById("splash");
  if (!splash) { window.location.reload(); return; }
  const label = splash.querySelector("span:last-child");
  if (label) label.textContent = "সংযোগ ধীর হচ্ছে — আবার চেষ্টা করতে এখানে ট্যাপ করুন";
  splash.style.cursor = "pointer";
  splash.addEventListener("click", () => window.location.reload(), { once: true });
}
