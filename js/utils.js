// ============================================================
// 4B PAVEMENT TILES — shared utilities
// ============================================================

const BN_DIGITS = ["০","১","২","৩","৪","৫","৬","৭","৮","৯"];
const BN_MONTHS = ["জানুয়ারি","ফেব্রুয়ারি","মার্চ","এপ্রিল","মে","জুন","জুলাই","আগস্ট","সেপ্টেম্বর","অক্টোবর","নভেম্বর","ডিসেম্বর"];
const BN_WEEKDAYS = ["রবি","সোম","মঙ্গল","বুধ","বৃহস্পতি","শুক্র","শনি"];

// Bangladesh Standard Time (UTC+6, no DST). All app-facing dates, times and
// day-boundaries are computed in BST so the app behaves identically no matter
// what timezone the phone is set to.
const BST_OFFSET_MIN = 360;
function toBST(input) {
  const d = (input instanceof Date) ? input : new Date(input);
  if (isNaN(d)) return d;
  return new Date(d.getTime() + (d.getTimezoneOffset() + BST_OFFSET_MIN) * 60000);
}

export function toBnDigits(input) {
  return String(input).replace(/[0-9]/g, d => BN_DIGITS[d]);
}

// Races a promise against a timer so slow/unstable connections fail fast
// with a clear error instead of leaving the UI stuck on a spinner forever.
export function withTimeout(promise, ms = 12000, timeoutErr = { code: "timeout" }) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(timeoutErr), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); }
    );
  });
}

// Bangla lakh/crore grouping (e.g. 1234567 -> 12,34,567)
function bnGroup(numStr) {
  const neg = numStr.startsWith("-");
  if (neg) numStr = numStr.slice(1);
  let out;
  if (numStr.length <= 3) {
    out = numStr;
  } else {
    const last3 = numStr.slice(-3);
    let rest = numStr.slice(0, -3);
    rest = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",");
    out = rest + "," + last3;
  }
  return (neg ? "-" : "") + out;
}

export function formatMoney(amount, opts = {}) {
  const n = Number(amount) || 0;
  const rounded = Math.round(n);
  const grouped = bnGroup(String(Math.abs(rounded)));
  const sign = rounded < 0 ? "-" : "";
  return `${opts.noSymbol ? "" : "৳"}${sign}${grouped}`;
}

export function formatQty(n) {
  return bnGroup(String(Math.round(Number(n) || 0)));
}

export function formatDateBN(date) {
  const d = toBST(date);
  if (isNaN(d)) return "";
  return `${toBnDigits(d.getDate())} ${BN_MONTHS[d.getMonth()]}, ${toBnDigits(d.getFullYear())}`;
}

export function formatDateTimeBN(date) {
  const d = toBST(date);
  if (isNaN(d)) return "";
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, "0");
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12; if (h === 0) h = 12;
  return `${toBnDigits(d.getDate())} ${BN_MONTHS[d.getMonth()]}, ${toBnDigits(d.getFullYear())} · ${toBnDigits(h)}:${toBnDigits(m)} ${ampm}`;
}

export function formatWeekdayBN(date) {
  const d = toBST(date);
  return BN_WEEKDAYS[d.getDay()] + "বার";
}

// yyyy-mm-dd in Bangladesh Standard Time — used as stable document-id
// fragments (e.g. attendance) and for "today" comparisons.
export function ymd(date = new Date()) {
  const d = toBST(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function ym(date = new Date()) {
  const d = toBST(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function toDate(value) {
  if (!value) return null;
  if (value.toDate) return value.toDate(); // Firestore Timestamp
  return new Date(value);
}

// ---------------- toast ----------------
let toastWrap;
export function showToast(message, type = "default", ms = 2600) {
  if (!toastWrap) {
    toastWrap = document.createElement("div");
    toastWrap.className = "toast-wrap";
    document.body.appendChild(toastWrap);
  }
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.textContent = message;
  toastWrap.appendChild(el);
  setTimeout(() => {
    el.style.opacity = "0";
    el.style.transition = "opacity .25s ease";
    setTimeout(() => el.remove(), 260);
  }, ms);
}

// ---------------- generic bottom-sheet overlay ----------------
export function openOverlay(overlayEl) {
  overlayEl.classList.add("open");
  document.body.style.overflow = "hidden";
}
export function closeOverlay(overlayEl) {
  overlayEl.classList.remove("open");
  document.body.style.overflow = "";
}

// promise-based confirm dialog built from the shared overlay markup
export function confirmDialog({ title = "নিশ্চিত করুন", message = "", okText = "হ্যাঁ", cancelText = "বাতিল", danger = false }) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "overlay";
    overlay.innerHTML = `
      <div class="sheet" style="max-width:420px;">
        <div class="sheet-handle"></div>
        <h3 style="margin-bottom:8px;">${title}</h3>
        <p class="muted" style="margin-bottom:20px; line-height:1.6;">${message}</p>
        <div class="btn-block-row">
          <button class="btn btn-ghost" data-act="cancel">${cancelText}</button>
          <button class="btn ${danger ? "btn-danger" : "btn-primary"}" data-act="ok">${okText}</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => openOverlay(overlay));
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay || e.target.dataset.act === "cancel") {
        closeOverlay(overlay);
        setTimeout(() => overlay.remove(), 250);
        resolve(false);
      }
      if (e.target.dataset.act === "ok") {
        closeOverlay(overlay);
        setTimeout(() => overlay.remove(), 250);
        resolve(true);
      }
    });
  });
}

// Generic bottom-sheet form. bodyHtml should use <div class="field"> blocks
// with named inputs; onSubmit receives a plain object of the form values
// and a `close()` callback it should call once it has finished.
export function formSheet({ title, bodyHtml, submitText = "সংরক্ষণ করুন", onSubmit, danger = false }) {
  const overlay = document.createElement("div");
  overlay.className = "overlay";
  overlay.innerHTML = `
    <div class="sheet">
      <div class="sheet-handle"></div>
      <div class="sheet-head">
        <h3>${title}</h3>
        <button type="button" class="icon-btn" data-close style="font-size:20px; line-height:1;">&times;</button>
      </div>
      <form id="dynForm" novalidate>
        ${bodyHtml}
        <button type="submit" class="btn ${danger ? "btn-danger" : "btn-primary"}" style="margin-top:8px;">
          <span class="submitLabel">${submitText}</span>
        </button>
      </form>
    </div>`;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => openOverlay(overlay));
  const close = () => { closeOverlay(overlay); setTimeout(() => overlay.remove(), 250); };
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay || e.target.closest("[data-close]")) close();
  });
  const form = overlay.querySelector("#dynForm");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = form.querySelector("button[type=submit]");
    const label = btn.querySelector(".submitLabel");
    const original = label.textContent;
    btn.disabled = true;
    label.innerHTML = `<span class="spinner"></span>`;
    try {
      const data = Object.fromEntries(new FormData(form).entries());
      await onSubmit(data, close);
    } catch (err) {
      if (!err || !err.silent) {
        showToast(err && err.message ? err.message : "কিছু একটা সমস্যা হয়েছে", "error");
      }
      btn.disabled = false;
      label.textContent = original;
    }
  });
  return { close, overlay, form };
}

// A single-button "alert" dialog for showing important/blocking info (e.g.
// insufficient stock) — same look as confirmDialog but no cancel option.
export function alertDialog({ title = "সমস্যা হয়েছে", bodyHtml = "", okText = "বুঝেছি", danger = true }) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "overlay";
    overlay.innerHTML = `
      <div class="sheet" style="max-width:420px;">
        <div class="sheet-handle"></div>
        <h3 style="margin-bottom:12px;">${title}</h3>
        <div style="margin-bottom:20px;">${bodyHtml}</div>
        <button class="btn ${danger ? "btn-danger" : "btn-primary"}" data-act="ok" style="width:100%;">${okText}</button>
      </div>`;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => openOverlay(overlay));
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay || e.target.dataset.act === "ok") {
        closeOverlay(overlay);
        setTimeout(() => overlay.remove(), 250);
        resolve(true);
      }
    });
  });
}

// Renders a clean per-tile breakdown for an "insufficient-stock" error's
// shortfalls array ({ tileTypeName, have, need }[]) — shared by every
// screen that can hit a stock shortage (sale, transfer, production delete).
export function shortfallBodyHtml(shortfalls = []) {
  return `<div style="display:flex; flex-direction:column; gap:10px;">
    ${shortfalls.map(s => `
      <div style="background:var(--danger-tint); border-radius:12px; padding:11px 13px;">
        <div style="font-weight:700; font-size:13.5px; margin-bottom:4px;">${escapeHtml(s.tileTypeName || "টাইলস")}</div>
        <div style="font-size:12px; color:var(--ink-soft);">চাহিদা: <b>${formatQty(s.need)}</b> পিস &nbsp;·&nbsp; স্টকে আছে: <b>${formatQty(s.have)}</b> পিস</div>
        <div style="font-size:12px; color:var(--danger); font-weight:700; margin-top:3px;">${formatQty(Math.max(0, s.need - s.have))} পিস কম পড়ছে</div>
      </div>`).join("")}
  </div>`;
}

export function debounce(fn, wait = 300) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

// A bottom sheet for non-form content (lists, etc). Same look/feel as
// formSheet, but no <form>/submit — the caller wires its own interactions
// inside bodyHtml (e.g. via a click listener on the returned overlay).
export function sheet({ title, bodyHtml }) {
  const overlay = document.createElement("div");
  overlay.className = "overlay";
  overlay.innerHTML = `
    <div class="sheet">
      <div class="sheet-handle"></div>
      <div class="sheet-head">
        <h3>${title}</h3>
        <button type="button" class="icon-btn" data-close style="font-size:20px; line-height:1;">&times;</button>
      </div>
      ${bodyHtml}
    </div>`;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => openOverlay(overlay));
  const close = () => { closeOverlay(overlay); setTimeout(() => overlay.remove(), 250); };
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay || e.target.closest("[data-close]")) close();
  });
  return { close, overlay };
}

export function escapeHtml(str = "") {
  return String(str)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

export function initials(name = "") {
  return name.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join("").toUpperCase();
}

// dynamically load an external script once (used for html2canvas / jsPDF, only when needed)
const loadedScripts = {};
export function loadScript(src, timeoutMs = 15000) {
  if (loadedScripts[src]) return loadedScripts[src];
  loadedScripts[src] = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    const timer = setTimeout(() => {
      delete loadedScripts[src];
      reject(new Error("script-load-timeout"));
    }, timeoutMs);
    s.onload = () => { clearTimeout(timer); resolve(); };
    s.onerror = () => { clearTimeout(timer); delete loadedScripts[src]; reject(new Error("script-load-error")); };
    document.head.appendChild(s);
  });
  return loadedScripts[src];
}

// ---------------- app update watcher (mandatory update modal) ----------------
// মূল ফোল্ডারের version.json ফাইলই আপডেটের উৎস। অ্যাপ ফোনের মেমোরিতে মনে
// রাখে শেষবার কোন ভার্সন দেখেছে; সার্ভারের version.json-এ তার চেয়ে বড়
// নম্বর পেলেই (প্রতি ৩০ মিনিটে + অ্যাপে ফিরে আসামাত্র + চালুর পরপর) স্ক্রিনের
// মাঝে বাধ্যতামূলক আপডেট-মোডাল আসে, সাথে version.json-এ লেখা নোটগুলো।
const VERSION_KEY = "4b_app_seen_version";

export function initUpdateWatcher() {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("service-worker.js").catch(() => {});
    });
  }
  const check = async () => {
    try {
      const res = await fetch("version.json?t=" + Date.now(), { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      const server = Number(data.version);
      if (!server) return;
      const seen = Number(localStorage.getItem(VERSION_KEY) || 0);
      if (!seen) { localStorage.setItem(VERSION_KEY, String(server)); return; }
      if (server > seen) {
        showUpdateModal(server, Array.isArray(data.notes) ? data.notes : []);
      }
    } catch (e) { /* offline বা ভুল JSON — পরে আবার চেষ্টা হবে */ }
  };
  setTimeout(check, 3000);
  setInterval(check, 30 * 60 * 1000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) check(); });
}

function showUpdateModal(version, notes) {
  if (document.getElementById("updateModal")) return;
  const overlay = document.createElement("div");
  overlay.id = "updateModal";
  overlay.className = "um-overlay";
  const notesHtml = notes.length
    ? notes.map((n, i) => `<div class="um-note" style="animation-delay:${(0.35 + i * 0.09).toFixed(2)}s"><span class="um-check"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg></span><span>${escapeHtml(n)}</span></div>`).join("")
    : `<div class="um-note" style="animation-delay:.35s"><span class="um-check"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg></span><span>উন্নত পারফরম্যান্স ও ভুল সংশোধন</span></div>`;
  overlay.innerHTML = `
    <div class="um-card">
      <div class="um-icon">
        <span class="um-ring"></span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/></svg>
      </div>
      <h3>নতুন আপডেট এসেছে</h3>
      <div class="um-ver">ভার্সন ${toBnDigits(version)}</div>
      <div class="um-notes">${notesHtml}</div>
      <button class="btn btn-primary um-btn" id="umUpdateBtn">আপডেট করুন</button>
      <p class="um-hint">অ্যাপ ব্যবহার চালিয়ে যেতে আপডেট করা আবশ্যক</p>
    </div>`;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add("show"));
  overlay.querySelector("#umUpdateBtn").addEventListener("click", (e) => {
    localStorage.setItem(VERSION_KEY, String(version));
    e.currentTarget.innerHTML = `<span class="spinner"></span>`;
    setTimeout(() => location.reload(), 300);
  });
}

// ---------------- "হোমস্ক্রিনে যোগ করুন" prompt (two-stage, respects a final decline) ----------------
// Stage 1: a friendly first offer. If dismissed, Stage 2 explains the cost
// of skipping it and offers one more chance. Only after THAT is declined do
// we remember "never again" — every visit before that point may prompt again.
// iOS has no programmatic install trigger at all (Apple never shipped
// beforeinstallprompt), so iOS always gets illustrated manual steps instead
// of a button that "does it for them".
const A2HS_KEY = "4b_a2hs_declined_final";
// Every visual property here is set INLINE (not via CSS classes) — some
// in-app browsers (Messenger/Instagram webviews etc.) load pages in ways
// that don't reliably apply an external stylesheet to elements injected
// after load, and this banner needs to look right everywhere regardless.
const A2HS_COLORS = { ink: "#262320", inkSoft: "#6B655C", terracotta: "#BF5B32", terracottaDeep: "#9C4726", terracottaTint: "#F3E0D3", cement: "#F3EEE4", white: "#FFFFFF" };
export function initA2HSPrompt() {
  const standalone = (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || window.navigator.standalone;
  if (standalone) return;
  if (localStorage.getItem(A2HS_KEY)) return;

  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) && !window.MSStream;
  let deferredPrompt = null;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
  });

  const C = A2HS_COLORS;
  function styledButton(bg, color) {
    return `flex:1;height:42px;border-radius:12px;font-size:12.5px;font-weight:700;border:none;cursor:pointer;background:${bg};color:${color};font-family:inherit;`;
  }
  function buildBanner(stage) {
    const old = document.getElementById("a2hsBanner");
    if (old) old.remove();
    const el = document.createElement("div");
    el.id = "a2hsBanner";
    el.style.cssText = `position:fixed;left:12px;right:12px;bottom:14px;z-index:9999;max-width:436px;margin:0 auto;background:${C.white};border-radius:20px;padding:18px;box-shadow:0 10px 34px rgba(0,0,0,.28);transform:translateY(160%);transition:transform .4s cubic-bezier(.16,.9,.3,1);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;box-sizing:border-box;`;
    if (stage === 1 || stage === 2) {
      const title = stage === 1 ? "হোমস্ক্রিনে যোগ করুন" : "সত্যিই বাদ দেবেন?";
      const sub = stage === 1
        ? "প্রতিবার লিংক খোঁজার বদলে সরাসরি অ্যাপের মতো এক ট্যাপে খুলুন"
        : "হোমস্ক্রিনে যোগ না করলে প্রতিবার ব্রাউজারে গিয়ে লিংক খুঁজে ঢুকতে হবে — কষ্ট হবে। একবার যোগ করে রাখলে সবসময় হাতের কাছেই থাকবে।";
      const iconHtml = stage === 1
        ? `<span style="width:52px;height:52px;border-radius:16px;overflow:hidden;flex-shrink:0;box-shadow:0 10px 20px -8px rgba(191,91,50,.4);display:block;"><img src="icons/icon-maskable-512.png" width="52" height="52" alt="" style="width:52px;height:52px;object-fit:cover;display:block;"></span>`
        : "";
      const skipId = stage === 1 ? "a2hsSkip1" : "a2hsSkip2";
      const addId = stage === 1 ? "a2hsAdd1" : "a2hsAdd2";
      const skipLabel = stage === 1 ? "না, থাক" : "না, দরকার নেই";
      el.innerHTML = `
        <div style="display:flex;align-items:center;gap:13px;">
          ${iconHtml}
          <div>
            <div style="font-size:14px;font-weight:800;color:${C.ink};">${title}</div>
            <div style="font-size:11.5px;color:${C.inkSoft};margin-top:3px;line-height:1.5;">${sub}</div>
          </div>
        </div>
        <div style="display:flex;gap:9px;margin-top:14px;">
          <button id="${skipId}" style="${styledButton(C.cement, C.inkSoft)}">${skipLabel}</button>
          <button id="${addId}" style="${styledButton(`linear-gradient(135deg, ${C.terracotta}, ${C.terracottaDeep})`, C.white)}">যোগ করুন</button>
        </div>`;
    } else {
      const stepStyle = "display:flex;align-items:center;gap:11px;font-size:12px;color:" + C.ink + ";line-height:1.4;";
      const numStyle = `width:22px;height:22px;border-radius:50%;background:${C.terracottaTint};color:${C.terracottaDeep};font-weight:800;font-size:11px;display:flex;align-items:center;justify-content:center;flex-shrink:0;`;
      el.innerHTML = `
        <div style="display:flex;align-items:center;gap:13px;">
          <span style="width:52px;height:52px;border-radius:16px;overflow:hidden;flex-shrink:0;box-shadow:0 10px 20px -8px rgba(191,91,50,.4);display:block;"><img src="icons/icon-maskable-512.png" width="52" height="52" alt="" style="width:52px;height:52px;object-fit:cover;display:block;"></span>
          <div>
            <div style="font-size:14px;font-weight:800;color:${C.ink};">হোমস্ক্রিনে যোগ করুন</div>
            <div style="font-size:11.5px;color:${C.inkSoft};margin-top:3px;">নিচের ধাপ অনুসরণ করুন</div>
          </div>
        </div>
        <div style="display:flex;flex-direction:column;gap:11px;margin-top:14px;">
          <div style="${stepStyle}"><span style="${numStyle}">১</span> নিচের শেয়ার (Share) আইকনে চাপুন</div>
          <div style="${stepStyle}"><span style="${numStyle}">২</span> স্ক্রল করে "Add to Home Screen" বাছুন</div>
          <div style="${stepStyle}"><span style="${numStyle}">৩</span> উপরে ডানে "Add" চাপুন</div>
        </div>
        <div style="margin-top:14px;">
          <button id="a2hsIosDone" style="${styledButton(`linear-gradient(135deg, ${C.terracotta}, ${C.terracottaDeep})`, C.white)}width:100%;">বুঝেছি</button>
        </div>`;
    }
    document.body.appendChild(el);
    requestAnimationFrame(() => { el.style.transform = "translateY(0)"; });
    return el;
  }

  function closeBanner(el, cb) {
    el.style.transform = "translateY(160%)";
    setTimeout(() => { el.remove(); if (cb) cb(); }, 350);
  }

  async function tryInstall() {
    if (isIOS) {
      const el = buildBanner("ios");
      el.querySelector("#a2hsIosDone").addEventListener("click", () => closeBanner(el));
      return;
    }
    if (!deferredPrompt) {
      showToast("এই মুহূর্তে ইনস্টল করা যাচ্ছে না, একটু পর আবার চেষ্টা করুন", "error");
      return;
    }
    deferredPrompt.prompt();
    try { await deferredPrompt.userChoice; } catch (e) { /* ignored */ }
    deferredPrompt = null;
    localStorage.setItem(A2HS_KEY, "1");
  }

  function showStage1() {
    const el = buildBanner(1);
    el.querySelector("#a2hsAdd1").addEventListener("click", () => { closeBanner(el, tryInstall); });
    el.querySelector("#a2hsSkip1").addEventListener("click", () => {
      closeBanner(el, () => setTimeout(showStage2, 450));
    });
  }
  function showStage2() {
    const el = buildBanner(2);
    el.querySelector("#a2hsAdd2").addEventListener("click", () => { closeBanner(el, tryInstall); });
    el.querySelector("#a2hsSkip2").addEventListener("click", () => {
      localStorage.setItem(A2HS_KEY, "1");
      closeBanner(el);
    });
  }

  setTimeout(showStage1, 2200);
}

// ---------------- dark mode toggle ----------------
// The actual theme is already applied before this runs (see the small
// inline script in each HTML file's <head>, which reads the same
// localStorage key before first paint to avoid a flash of the wrong
// theme). This just wires the visible button: swaps its icon to match
// the CURRENT theme and flips data-theme + the saved preference on tap.
const THEME_KEY = "4b_theme";
const SUN_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4.5"/><path d="M12 2.5v2.5M12 19v2.5M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M2.5 12H5M19 12h2.5M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"/></svg>`;
const MOON_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z"/></svg>`;
export function initThemeToggle(btnId) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  const paint = () => {
    const isDark = document.documentElement.getAttribute("data-theme") === "dark";
    btn.innerHTML = isDark ? SUN_ICON : MOON_ICON;
  };
  paint();
  btn.addEventListener("click", () => {
    const goingDark = document.documentElement.getAttribute("data-theme") !== "dark";
    if (goingDark) document.documentElement.setAttribute("data-theme", "dark");
    else document.documentElement.removeAttribute("data-theme");
    try { localStorage.setItem(THEME_KEY, goingDark ? "dark" : "light"); } catch (e) { /* ignored */ }
    paint();
  });
}

// ---------------- guided tour (first-login spotlight walkthrough) ----------------
// Cuts a real "hole" in a dark overlay around each target element in turn
// (SVG mask — the darkened rect is masked transparent exactly where the
// hole rect sits) with a glowing ring and a positioned tooltip. Runs once
// per person (keyed by their uid, so a shared device still shows it to
// each new user) and is skippable at any step.
export function initGuidedTour(steps, storageKey) {
  try { if (localStorage.getItem(storageKey)) return; } catch (e) { return; }
  const usable = steps.filter(s => document.querySelector(s.selector));
  if (!usable.length) return;

  let idx = 0, el, holeRect, ring, tooltip;

  function build() {
    el = document.createElement("div");
    el.className = "tour-overlay";
    el.innerHTML = `
      <svg class="tour-svg">
        <defs><mask id="tourMask"><rect width="100%" height="100%" fill="white"/><rect id="tourHole" rx="16" fill="black"/></mask></defs>
        <rect width="100%" height="100%" fill="rgba(10,8,6,.78)" mask="url(#tourMask)"/>
      </svg>
      <div class="tour-ring" id="tourRing"></div>
      <div class="tour-tooltip" id="tourTooltip">
        <span class="tour-step-count" id="tourCount"></span>
        <h4 class="tour-title" id="tourTitle"></h4>
        <p class="tour-desc" id="tourDesc"></p>
        <div class="tour-actions">
          <button type="button" class="tour-skip" id="tourSkip">এড়িয়ে যান</button>
          <button type="button" class="tour-next" id="tourNext">পরবর্তী</button>
        </div>
        <div class="tour-dots" id="tourDots"></div>
      </div>`;
    document.body.appendChild(el);
    holeRect = el.querySelector("#tourHole");
    ring = el.querySelector("#tourRing");
    tooltip = el.querySelector("#tourTooltip");
    el.querySelector("#tourSkip").addEventListener("click", finish);
    el.querySelector("#tourNext").addEventListener("click", goNext);
    requestAnimationFrame(() => el.classList.add("show"));
  }

  function place() {
    const step = usable[idx];
    const target = document.querySelector(step.selector);
    if (!target) { goNext(); return; }
    tooltip.classList.remove("show");
    target.scrollIntoView({ block: "center" });
    setTimeout(() => {
      const r = target.getBoundingClientRect();
      const pad = 8;
      const x = r.left - pad, y = r.top - pad, w = r.width + pad * 2, h = r.height + pad * 2;
      holeRect.setAttribute("x", x); holeRect.setAttribute("y", y);
      holeRect.setAttribute("width", w); holeRect.setAttribute("height", h);
      ring.style.left = x + "px"; ring.style.top = y + "px";
      ring.style.width = w + "px"; ring.style.height = h + "px";
      const spaceBelow = window.innerHeight - r.bottom;
      if (spaceBelow > 190) { tooltip.style.top = (r.bottom + 20) + "px"; tooltip.style.bottom = "auto"; }
      else { tooltip.style.bottom = (window.innerHeight - r.top + 20) + "px"; tooltip.style.top = "auto"; }
      el.querySelector("#tourCount").textContent = `${idx + 1} / ${usable.length}`;
      el.querySelector("#tourTitle").textContent = step.title;
      el.querySelector("#tourDesc").textContent = step.desc;
      el.querySelector("#tourNext").textContent = idx === usable.length - 1 ? "শেষ করুন" : "পরবর্তী";
      el.querySelector("#tourDots").innerHTML = usable.map((_, i) => `<span class="tour-dot${i === idx ? " active" : ""}"></span>`).join("");
      tooltip.classList.add("show");
    }, 220);
  }

  function goNext() {
    idx++;
    if (idx >= usable.length) { finish(); return; }
    place();
  }
  function finish() {
    try { localStorage.setItem(storageKey, "1"); } catch (e) { /* ignored */ }
    if (el) { el.classList.remove("show"); setTimeout(() => el.remove(), 300); }
  }

  build();
  place();
}
