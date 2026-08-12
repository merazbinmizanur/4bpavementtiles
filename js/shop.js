// ============================================================
// 4B PAVEMENT TILES — public shop page (no-login ordering)
// Visitors are signed in anonymously behind the scenes so the
// security rules can allow them exactly a few things: reading the
// product list / shop info, creating an online order, and looking
// up ONE order they already have the exact ID for (tracking).
// ============================================================
import { auth } from "./firebase-config.js";
import {
  onAuthStateChanged, signInAnonymously
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";
import { Icon } from "./icons.js";
import { getProfile } from "./auth.js";
import { subscribeTileTypes, subscribeVariants, subscribeShopInfo, createOnlineOrder, trackOnlineOrder } from "./data.js";
import {
  showToast, escapeHtml, formatQty, formatDateBN, toDate, openOverlay, closeOverlay, initUpdateWatcher, initA2HSPrompt
} from "./utils.js";

const S = { tileTypes: [], variants: [], shopInfo: {} };
const cart = []; // [{ variantId, tileTypeId, tileTypeName, quality, color, size, customSize, quantity }]
let started = false;
let submitting = false;
let searchTerm = "";
let wishlistOnly = false;
let bannerTimer = null;
let bannerIndex = 0;
const THUMB_VARIANTS = ["v1", "v2", "v3"];

// ---- color-name -> swatch matching (mirrors owner.js/manager.js) ----
const COLOR_WORD_MAP = {
  red: "#E53935", white: "#FFFFFF", black: "#1A1A1A", gray: "#9E9E9E", grey: "#9E9E9E",
  yellow: "#FDD835", green: "#43A047", blue: "#1E88E5", brown: "#6D4C41", orange: "#FB8C00",
  pink: "#EC407A", purple: "#8E24AA", beige: "#D7CCC8", maroon: "#800000", navy: "#1A237E",
  cream: "#FFF8E1", silver: "#C0C0C0", gold: "#D4AF37", ivory: "#FFFFF0", tan: "#D2B48C",
  charcoal: "#36454F", rust: "#B7410E", teal: "#008080", olive: "#808000",
  "লাল": "#E53935", "সাদা": "#FFFFFF", "কালো": "#1A1A1A", "ধূসর": "#9E9E9E", "হলুদ": "#FDD835",
  "সবুজ": "#43A047", "নীল": "#1E88E5", "বাদামী": "#6D4C41", "কমলা": "#FB8C00", "গোলাপি": "#EC407A",
  "বেগুনি": "#8E24AA", "ক্রিম": "#FFF8E1", "সোনালি": "#D4AF37", "রূপালী": "#C0C0C0"
};
const COLOR_FALLBACK = "#B8B0A4";
function colorSwatchStops(colorText) {
  if (!colorText) return [COLOR_FALLBACK];
  const words = colorText.toLowerCase().split(/[\s,\-/]+/).filter(Boolean);
  const stops = [];
  words.forEach(w => { const hex = COLOR_WORD_MAP[w]; if (hex && !stops.includes(hex)) stops.push(hex); });
  return stops.length ? stops : [COLOR_FALLBACK];
}
function colorSwatchStyle(colorText) {
  const stops = colorSwatchStops(colorText);
  if (stops.length === 1) return `background:${stops[0]};`;
  const pct = 100 / stops.length;
  const css = stops.map((c, i) => `${c} ${(i * pct).toFixed(1)}% ${((i + 1) * pct).toFixed(1)}%`).join(", ");
  return `background:linear-gradient(90deg, ${css});`;
}
function isLightHex(hex) {
  const h = (hex || "").replace("#", "");
  if (h.length < 6) return false;
  const r = parseInt(h.substr(0, 2), 16), g = parseInt(h.substr(2, 2), 16), b = parseInt(h.substr(4, 2), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) > 200;
}
const WISHLIST_KEY = "4b_shop_wishlist";

document.getElementById("splashMark").innerHTML = Icon.brand;
document.getElementById("shopMark").innerHTML = Icon.brand;

const SPLASH_TAGLINES = ["বিশ্বস্ততার ৯+ বছর", "সারাদেশে বিশ্বস্ত ডেলিভারি", "সর্বোচ্চ মানের পেভমেন্ট টাইলস", "বরিশাল থেকে সারাদেশে"];
(function startSplashTagline() {
  const el = document.getElementById("splashTagline");
  if (!el) return;
  let i = 0;
  const show = () => { el.textContent = SPLASH_TAGLINES[i]; el.classList.add("show"); };
  show();
  const timer = setInterval(() => {
    if (!document.body.contains(el)) { clearInterval(timer); return; }
    el.classList.remove("show");
    setTimeout(() => { i = (i + 1) % SPLASH_TAGLINES.length; show(); }, 300);
  }, 2600);
})();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
  });
  initUpdateWatcher();
}
initA2HSPrompt();

/* ================= wishlist (client-only, no login needed) ================= */
function getWishlist() {
  try { return new Set(JSON.parse(localStorage.getItem(WISHLIST_KEY) || "[]")); }
  catch { return new Set(); }
}
function toggleWishlist(id) {
  const w = getWishlist();
  if (w.has(id)) w.delete(id); else w.add(id);
  localStorage.setItem(WISHLIST_KEY, JSON.stringify([...w]));
  return w.has(id);
}

/* ================= phone helpers (tel: / WhatsApp) ================= */
function waNumber(raw) {
  let n = (raw || "").replace(/\D/g, "");
  if (!n) return "";
  if (n.startsWith("880")) return n;
  if (n.startsWith("0")) return "88" + n;
  return n;
}
function waLink(raw, text) {
  const n = waNumber(raw);
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(text)}` : "";
}

/* ================= entry: staff go to their panel, visitors get an
   invisible anonymous session ================= */
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    signInAnonymously(auth).catch(() => {
      showFatal("সংযোগে সমস্যা হচ্ছে — ইন্টারনেট দেখে আবার চেষ্টা করুন");
    });
    return;
  }
  if (!user.isAnonymous) {
    try {
      const profile = await getProfile(user.uid);
      if (profile && profile.role === "owner") { window.location.href = "owner.html"; return; }
      if (profile && profile.role === "manager") { window.location.href = "manager.html"; return; }
    } catch (e) { /* treat as visitor */ }
  }
  startShop();
});

function showFatal(msg) {
  const splash = document.getElementById("splash");
  if (splash) splash.innerHTML = `<p class="muted center" style="padding:0 30px;">${escapeHtml(msg)}</p>`;
}

function startShop() {
  if (started) return;
  started = true;
  const gridEl = document.getElementById("productGrid");
  if (gridEl) gridEl.innerHTML = shopSkeletonGrid();
  subscribeTileTypes(v => { S.tileTypes = v; renderBanner(); renderGrid(); });
  subscribeVariants(v => { S.variants = v; });
  subscribeShopInfo(v => { 
    S.shopInfo = v || {}; 
    renderShopInfo(); 
    renderContact(); 
    renderCompanyProfile(); 
    renderWaFab(); 
  });
  
  document.getElementById("splash").remove();
  document.getElementById("shopPage").style.display = "";

  // 🔹 ট্যাব বার অন করার জন্য এখানে কল করা হয়েছে
  setupShopTabs();

  document.getElementById("cartOpenBtn").addEventListener("click", openCartSheet);
  document.getElementById("productGrid").addEventListener("click", (e) => {
    const heart = e.target.closest("[data-wish]");
    if (heart) { e.stopPropagation(); onWishToggle(heart); return; }
    const seeAll = e.target.closest("[data-seeall]");
    if (seeAll) { openCategoryPage(seeAll.dataset.seeall); return; }
    const card = e.target.closest("[data-tile]");
    if (card) openItemSheet(card.dataset.tile);
  });
  document.getElementById("bannerTrack").addEventListener("click", (e) => {
    const slide = e.target.closest("[data-tile]");
    if (slide) openItemSheet(slide.dataset.tile);
  });
  const searchInput = document.getElementById("searchInput");
  searchInput.addEventListener("input", (e) => { searchTerm = e.target.value; renderGrid(); });
  document.getElementById("searchClear").addEventListener("click", () => {
    searchTerm = ""; searchInput.value = ""; renderGrid();
  });
  document.getElementById("wishFilterChip").addEventListener("click", (e) => {
    wishlistOnly = !wishlistOnly;
    e.currentTarget.classList.toggle("active", wishlistOnly);
    renderGrid();
  });
  document.getElementById("trackOpenBtn").addEventListener("click", openTrackSheet);
}

function setupShopTabs() {
  const searchWrap = document.querySelector(".shop-search-wrap");
  if (!searchWrap || document.getElementById("shopSegTabs")) return;
  
  const tabWrap = document.createElement("div");
  tabWrap.id = "shopSegTabs";
  tabWrap.className = "shop-seg-tabs";
  tabWrap.innerHTML = `
    <button type="button" class="st-tab active" data-tab="products">🛍️ আমাদের পণ্য</button>
    <button type="button" class="st-tab" data-tab="profile">🏢 আমাদের কথা ও প্রজেক্ট</button>
  `;
  
  searchWrap.parentNode.insertBefore(tabWrap, searchWrap);
  
  tabWrap.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-tab]");
    if (!btn) return;
    
    tabWrap.querySelectorAll(".st-tab").forEach(b => b.classList.toggle("active", b === btn));
    
    const tab = btn.dataset.tab;
    const grid = document.getElementById("productGrid");
    const banner = document.getElementById("bannerWrap");
    const searchWrap = document.querySelector(".shop-search-wrap");
    const shopContact = document.getElementById("shopContact");
    const profile = document.getElementById("companyProfileWrap");
    
    // "আমাদের টাইলস" সহ অন্যান্য সেকশন লেবেল হাইড করার জন্য
    const sectionLabels = document.querySelectorAll(".shop-section-lbl");
    
    if (tab === "products") {
      if (grid) grid.style.display = "";
      if (banner) banner.style.display = "";
      if (searchWrap) searchWrap.style.display = "";
      if (shopContact) shopContact.style.display = "";
      sectionLabels.forEach(el => el.style.display = "");
      if (profile) { profile.style.opacity = "0"; setTimeout(() => { profile.style.display = "none"; }, 200); }
    } else {
      if (grid) grid.style.display = "none";
      if (banner) banner.style.display = "none";
      if (searchWrap) searchWrap.style.display = "none";
      if (shopContact) shopContact.style.display = "none";
      sectionLabels.forEach(el => el.style.display = "none"); // "আমাদের টাইলস" লেখাটি এই ট্যাবে অপ্রাসঙ্গিক তাই হাইড হবে
      if (profile) {
        profile.style.display = "block";
        profile.style.opacity = "0";
        requestAnimationFrame(() => { profile.style.opacity = "1"; });
      }
    }
  });
}

function onWishToggle(el) {
  const id = el.dataset.wish;
  const active = toggleWishlist(id);
  el.classList.toggle("active", active);
  el.classList.remove("pop"); void el.offsetWidth; el.classList.add("pop");
  showToast(active ? "পছন্দের তালিকায় যোগ হয়েছে" : "পছন্দের তালিকা থেকে সরানো হয়েছে", "success");
  if (wishlistOnly) renderGrid();
}

function renderShopInfo() {
  const info = S.shopInfo;
  if (info.name) document.getElementById("shopName").textContent = info.name;
}

function renderContact() {
  const info = S.shopInfo;
  const wrap = document.getElementById("shopContact");
  const parts = [];
  if (info.address) {
    parts.push(`<a class="sc-link" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(info.address)}" target="_blank" rel="noopener">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 12-9 12s-9-5-9-12a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
      <span>${escapeHtml(info.address)}</span></a>`);
  }
  if (info.phone) {
    parts.push(`<a class="sc-link" href="tel:${escapeHtml(info.phone.replace(/\s+/g, ""))}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
      <span>ফোনঃ ${escapeHtml(info.phone)}</span></a>`);
  }
  wrap.innerHTML = parts.join("");
  wrap.style.display = parts.length ? "" : "none";
}

function renderWaFab() {
  const info = S.shopInfo;
  const num = info.whatsapp || info.phone;
  const fab = document.getElementById("waFab");
  if (!num) { fab.style.display = "none"; return; }
  fab.style.display = "";
  fab.href = waLink(num, "আসসালামু আলাইকুম, আমি আপনাদের টাইলস সম্পর্কে জানতে চাই।");
}

/* ================= rotating banner ================= */
function renderBanner() {
  const wrap = document.getElementById("bannerWrap");
  const track = document.getElementById("bannerTrack");
  const dots = document.getElementById("bannerDots");
  const banners = S.tileTypes.filter(t => t.banner).slice(0, 6);
  clearInterval(bannerTimer);
  if (!banners.length) { wrap.style.display = "none"; return; }
  wrap.style.display = "";
  track.innerHTML = banners.map((t, i) => `
    <div class="banner-slide" data-tile="${t.id}">
      <div class="bs-fallback ${t.imageUrl ? "" : THUMB_VARIANTS[i % 3]}"></div>
      <div class="bs-overlay">
        <b>${escapeHtml(t.name)}</b>
        <span>${escapeHtml(t.description || (t.size ? `সাইজঃ ${t.size}` : "বিস্তারিত দেখতে ট্যাপ করুন"))}</span>
      </div>
    </div>`).join("");
  track.querySelectorAll(".banner-slide").forEach((el, i) => {
    const t = banners[i];
    if (t.imageUrl) el.style.backgroundImage = `url('${t.imageUrl.replace(/'/g, "%27")}')`;
  });
  dots.innerHTML = banners.map((_, i) => `<span class="bd${i === 0 ? " active" : ""}"></span>`).join("");
  bannerIndex = 0;
  track.scrollTo({ left: 0 });
  if (banners.length > 1) {
    bannerTimer = setInterval(() => advanceBanner(banners.length), 3800);
  }
  track.addEventListener("touchstart", () => { clearInterval(bannerTimer); }, { once: true, passive: true });
  track.addEventListener("scroll", () => {
    const w = track.clientWidth;
    const idx = Math.round(track.scrollLeft / (w * 0.86));
    dots.querySelectorAll(".bd").forEach((d, i) => d.classList.toggle("active", i === idx));
  }, { passive: true });
}
function advanceBanner(count) {
  const track = document.getElementById("bannerTrack");
  bannerIndex = (bannerIndex + 1) % count;
  const w = track.clientWidth;
  track.scrollTo({ left: bannerIndex * w * 0.86, behavior: "smooth" });
}

/* ================= product grid + search + wishlist filter + browse rows ================= */
function bestSellingIds() {
  return S.tileTypes
    .filter(t => (t.soldCount || 0) > 0)
    .sort((a, b) => (b.soldCount || 0) - (a.soldCount || 0))
    .slice(0, 3)
    .map(t => t.id);
}
function cardHtml(t, i) {
  const bestIds = bestSellingIds();
  const wishlist = getWishlist();
  return `
    <div class="shop-card" data-tile="${t.id}" style="animation-delay:${(i * 0.04).toFixed(2)}s">
      <div class="sc-thumb ${t.imageUrl ? "" : THUMB_VARIANTS[i % 3]}">
        <span></span>
        ${bestIds.includes(t.id) ? `<span class="sc-best">🔥 সবচেয়ে বিক্রিত</span>` : ""}
        <span class="sc-wish${wishlist.has(t.id) ? " active" : ""}" data-wish="${t.id}">${Icon.heart}</span>
      </div>
      <b>${escapeHtml(t.name)}</b>
      ${t.description ? `<small class="sc-desc">${escapeHtml(t.description)}</small>` : (t.size ? `<small>সাইজঃ ${escapeHtml(t.size)}</small>` : `<small>সাইজ আপনার পছন্দমতো</small>`)}
      <div class="sc-add"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2.5 3h2.2l2.1 11.4a2 2 0 0 0 2 1.6h8.6a2 2 0 0 0 2-1.6L21 7H6"/></svg> অর্ডার</div>
    </div>`;
}
function applyThumbImages(container, list) {
  container.querySelectorAll("[data-tile]").forEach(card => {
    const t = list.find(x => x.id === card.dataset.tile);
    if (t && t.imageUrl) card.querySelector(".sc-thumb").style.backgroundImage = `url('${t.imageUrl.replace(/'/g, "%27")}')`;
  });
}
function tsMillis(t) { return t && t.createdAt && t.createdAt.toMillis ? t.createdAt.toMillis() : 0; }
function newestList() {
  return [...S.tileTypes].sort((a, b) => tsMillis(b) - tsMillis(a)).slice(0, 8);
}
function sizeGroups() {
  const map = {};
  S.tileTypes.forEach(t => {
    const key = t.size || "অন্যান্য";
    (map[key] = map[key] || []).push(t);
  });
  return Object.entries(map).filter(([, items]) => items.length >= 2);
}
let rowFullLists = {}; // key -> { title, items } — populated by renderRows, read by "সব দেখুন"
function rowSectionHtml(title, items, key) {
  rowFullLists[key] = { title, items };
  const shown = items.slice(0, 4);
  const seeAll = items.length > 4 ? `
    <div class="shop-see-all" data-seeall="${key}">
      <div class="sa-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 5l7 7-7 7"/></svg></div>
      <span>সব দেখুন<br>(${formatQty(items.length)})</span>
    </div>` : "";
  return `
    <div class="shop-row-section">
      <div class="shop-row-title">${escapeHtml(title)}</div>
      <div class="shop-row-track">${shown.map((t, i) => cardHtml(t, i)).join("")}${seeAll}</div>
    </div>`;
}
function renderRows(container) {
  rowFullLists = {};
  const sections = [];
  const bestIds = bestSellingIds();
  const best = S.tileTypes.filter(t => bestIds.includes(t.id));
  if (best.length) sections.push(rowSectionHtml("🔥 সবচেয়ে বিক্রিত", best, "best"));
  const newest = newestList();
  if (newest.length) sections.push(rowSectionHtml("✨ নতুন যোগ হয়েছে", newest, "newest"));
  sizeGroups().forEach(([size, items], i) => sections.push(rowSectionHtml(`সাইজঃ ${escapeHtml(size)}`, items, `size-${i}`)));
  if (!sections.length) sections.push(rowSectionHtml("আমাদের টাইলস", S.tileTypes, "all"));
  container.innerHTML = sections.join("");
  container.querySelectorAll(".shop-row-track").forEach(track => applyThumbImages(track, S.tileTypes));
}
function openCategoryPage(key) {
  const data = rowFullLists[key];
  if (!data) return;
  const page = document.createElement("div");
  page.className = "cat-page";
  page.innerHTML = `
    <div class="cat-hdr">
      <button id="catBackBtn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M11 18l-6-6 6-6"/></svg></button>
      <h2>${escapeHtml(data.title)}</h2>
    </div>
    <div class="cat-grid">${data.items.map((t, i) => cardHtml(t, i)).join("")}</div>`;
  document.body.appendChild(page);
  requestAnimationFrame(() => page.classList.add("open"));
  applyThumbImages(page, data.items);
  const close = () => { page.classList.remove("open"); setTimeout(() => page.remove(), 200); };
  page.querySelector("#catBackBtn").addEventListener("click", close);
  page.querySelector(".cat-grid").addEventListener("click", (e) => {
    const heart = e.target.closest("[data-wish]");
    if (heart) { onWishToggle(heart); return; }
    const card = e.target.closest("[data-tile]");
    if (card) openItemSheet(card.dataset.tile);
  });
}
function shopSkeletonGrid(count = 6) {
  return Array.from({ length: count }, () => `
    <div class="skel-shop-card">
      <span class="skel skel-shop-thumb"></span>
      <span class="skel skel-line w60" style="height:11px; margin-top:9px;"></span>
      <span class="skel skel-line w40" style="height:9px; margin-top:6px;"></span>
    </div>`).join("");
}
function renderGrid() {
  const grid = document.getElementById("productGrid");
  const term = searchTerm.trim().toLowerCase();
  document.getElementById("searchClear").style.display = searchTerm ? "" : "none";
  if (!S.tileTypes.length) {
    grid.className = "shop-grid";
    grid.innerHTML = `<div class="muted center" style="grid-column:1/3; padding:30px 0;">এখনো কোনো পণ্য যোগ হয়নি</div>`;
    return;
  }
  if (!term && !wishlistOnly) {
    grid.className = "shop-rows";
    renderRows(grid);
    return;
  }
  grid.className = "shop-grid";
  const wishlist = getWishlist();
  let list = term
    ? S.tileTypes.filter(t => (t.name || "").toLowerCase().includes(term) || (t.description || "").toLowerCase().includes(term))
    : S.tileTypes;
  if (wishlistOnly) list = list.filter(t => wishlist.has(t.id));
  if (!list.length) {
    grid.innerHTML = `<div class="muted center" style="grid-column:1/3; padding:30px 0;">${wishlistOnly ? "পছন্দের তালিকা খালি" : `"${escapeHtml(searchTerm)}" এর সাথে মিলে এমন কিছু পাওয়া যায়নি`}</div>`;
    return;
  }
  grid.innerHTML = list.map((t, i) => cardHtml(t, i)).join("");
  applyThumbImages(grid, list);
}

/* ================= item detail sheet (image + description + qty + optional custom size) ================= */
function openItemSheet(tileId) {
  const t = S.tileTypes.find(x => x.id === tileId);
  if (!t) return;
  const variant = THUMB_VARIANTS[Math.abs(tileId.split("").reduce((a, c) => a + c.charCodeAt(0), 0)) % 3];
  const wished = getWishlist().has(t.id);
  const tileVariants = S.variants.filter(v => v.tileTypeId === t.id);
  const showPicker = tileVariants.length > 1;
  const vLabel = (v) => v.color || "সাধারণ";
  const overlay = document.createElement("div");
  overlay.className = "overlay";
  overlay.innerHTML = `
    <div class="sheet pd-sheet">
      <div class="sheet-handle"></div>
      <div class="pd-hero ${t.imageUrl ? "" : variant}">
        <!-- 🔹 উপরে বামপাশে নতুন ক্রস (X) বাটন -->
        <span class="pd-close" id="pdCloseBtn">${Icon.close}</span>
        
        <!-- 🔹 উপরে ডানপাশে লাভ (♥) বাটন -->
        <span class="sc-wish pd-wish${wished ? " active" : ""}" data-wish="${t.id}">${Icon.heart}</span>
      </div>
      <div style="padding:0 20px 22px;">
        <h3 style="font-size:18px; margin-top:16px;">${escapeHtml(t.name)}</h3>
        ${t.description ? `<p class="muted" style="margin-top:6px; line-height:1.65; font-size:12.5px;">${escapeHtml(t.description)}</p>` : ""}
        ${t.size ? `<div class="pd-size-chip">সাইজঃ ${escapeHtml(t.size)}${t.quality ? ` · ${escapeHtml(t.quality)}` : ""}</div>` : (t.quality ? `<div class="pd-size-chip">${escapeHtml(t.quality)}</div>` : "")}
        ${showPicker ? `
        <div class="field" style="margin-top:16px;"><label>কালার বাছাই করুন</label>
          <div class="vp-color-grid" id="itemVariantChips">
            ${tileVariants.map((v, i) => {
              const stops = colorSwatchStops(v.color);
              const light = isLightHex(stops[0]);
              return `
              <div class="vp-color-item${i === 0 ? " active" : ""}" data-variant="${v.id}">
                <span class="vp-color-swatch" style="${colorSwatchStyle(v.color)}">
                  <span class="vp-color-check" style="color:${light ? "#1A1A1A" : "#fff"};">✓</span>
                </span>
                <span class="vp-color-name">${escapeHtml(vLabel(v))}</span>
              </div>`;
            }).join("")}
          </div>
        </div>` : ""}
        <div class="field" style="margin-top:16px;"><label>পরিমাণ (পিস)</label>
          <div class="qty-step">
            <button type="button" data-q="-1">−</button>
            <input type="number" id="itemQty" min="1" value="50">
            <button type="button" data-q="1">+</button>
          </div>
        </div>
        <div class="field"><label>নিজের সাইজ ${t.size ? "(ভিন্ন সাইজ চাইলে লিখুন — ঐচ্ছিক)" : "(ঐচ্ছিক)"}</label>
          <input id="itemSize" placeholder="যেমনঃ ১০ × ১০ ইঞ্চি"></div>
        <button class="btn btn-primary" id="itemAddBtn" style="width:100%; margin-top:4px;">${Icon.plus} কার্টে যোগ করুন</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  if (t.imageUrl) overlay.querySelector(".pd-hero").style.backgroundImage = `url('${t.imageUrl.replace(/'/g, "%27")}')`;
  requestAnimationFrame(() => openOverlay(overlay));
  const close = () => { closeOverlay(overlay); setTimeout(() => overlay.remove(), 250); };

  const closeBtn = overlay.querySelector("#pdCloseBtn");
closeBtn.addEventListener("click", () => {
  closeBtn.classList.remove("pop"); void closeBtn.offsetWidth; closeBtn.classList.add("pop");
  setTimeout(close, 140);
});

  let selectedVariantId = tileVariants.length ? tileVariants[0].id : null;
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) { close(); return; }
    const heart = e.target.closest("[data-wish]");
    if (heart) { onWishToggle(heart); return; }
    const chip = e.target.closest("[data-variant]");
    if (chip) {
      selectedVariantId = chip.dataset.variant;
      overlay.querySelectorAll(".vp-color-item").forEach(c => c.classList.toggle("active", c === chip));
      return;
    }
  });
  const qtyEl = overlay.querySelector("#itemQty");
  overlay.querySelectorAll("[data-q]").forEach(b => b.addEventListener("click", () => {
    const step = Number(b.dataset.q) * 10;
    qtyEl.value = Math.max(1, (Number(qtyEl.value) || 0) + step);
  }));
  overlay.querySelector("#itemAddBtn").addEventListener("click", () => {
    const quantity = Number(qtyEl.value);
    if (!quantity || quantity <= 0) { showToast("সঠিক পরিমাণ দিন", "error"); return; }
    if (tileVariants.length && !selectedVariantId) { showToast("কালার বাছাই করুন", "error"); return; }
    const v = tileVariants.find(x => x.id === selectedVariantId);
    cart.push({
      variantId: v ? v.id : null, tileTypeId: t.id, tileTypeName: t.name,
      quality: t.quality || "", color: v ? (v.color || "") : "",
      size: t.size || "", customSize: overlay.querySelector("#itemSize").value.trim(), quantity
    });
    updateCartBar();
    showToast("কার্টে যোগ হয়েছে", "success");
    close();
  });
}

function updateCartBar() {
  const bar = document.getElementById("cartBar");
  if (!cart.length) { bar.style.display = "none"; return; }
  bar.style.display = "";
  document.getElementById("cartCount").textContent = `${formatQty(cart.length)} টি পণ্য`;
}

function itemLabel(it) {
  const bits = [it.tileTypeName];
  if (it.quality) bits.push(it.quality);
  if (it.color) bits.push(it.color);
  const size = it.customSize || it.size;
  return `${bits.join(" · ")}${size ? ` (${size})` : ""}`;
}

/* ================= cart sheet ================= */
function openCartSheet() {
  if (!cart.length) return;
  const overlay = document.createElement("div");
  overlay.className = "overlay";
  const linesHtml = () => cart.map((it, i) => `
    <div class="cart-line">
      <div style="flex:1;"><div class="cl-name">${escapeHtml(itemLabel(it))}</div><div class="cl-meta">${formatQty(it.quantity)} পিস</div></div>
      <span class="cl-del" data-rm="${i}">${Icon.trash}</span>
    </div>`).join("");
  overlay.innerHTML = `
    <div class="sheet">
      <div class="sheet-handle"></div>
      <h3 style="font-size:17px; margin-bottom:14px;">আপনার কার্ট</h3>
      <div id="cartLines">${linesHtml()}</div>
      <button class="btn btn-primary" id="cartNextBtn" style="width:100%; margin-top:16px;">অর্ডার সম্পন্ন করুন</button>
    </div>`;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => openOverlay(overlay));
  const close = () => { closeOverlay(overlay); setTimeout(() => overlay.remove(), 250); };
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) { close(); return; }
    const rm = e.target.closest("[data-rm]");
    if (rm) {
      cart.splice(Number(rm.dataset.rm), 1);
      updateCartBar();
      if (!cart.length) { close(); return; }
      overlay.querySelector("#cartLines").innerHTML = linesHtml();
    }
  });
  overlay.querySelector("#cartNextBtn").addEventListener("click", () => { close(); setTimeout(openCheckoutSheet, 260); });
}

/* ================= checkout sheet ================= */
function openCheckoutSheet() {
  const info = S.shopInfo;
  const payLines = [
    info.bkash ? `<div class="pay-acc"><b>বিকাশ</b><span>${escapeHtml(info.bkash)}</span></div>` : "",
    info.nagad ? `<div class="pay-acc"><b>নগদ</b><span>${escapeHtml(info.nagad)}</span></div>` : "",
    info.bank ? `<div class="pay-acc"><b>ব্যাংক</b><span>${escapeHtml(info.bank)}</span></div>` : "",
  ].join("");
  const overlay = document.createElement("div");
  overlay.className = "overlay";
  overlay.innerHTML = `
    <div class="sheet">
      <div class="sheet-handle"></div>
      <h3 style="font-size:17px; margin-bottom:14px;">আপনার তথ্য</h3>
      <div class="field"><label>দোকান / নিজের নাম *</label><input id="coName" required></div>
      <div class="field"><label>ফোন নম্বর *</label><input id="coPhone" type="tel" required placeholder="01XXXXXXXXX"></div>
      <div class="field"><label>ঠিকানা *</label><input id="coAddress" required placeholder="ডেলিভারির ঠিকানা"></div>
      <div class="field"><label>নোট (ঐচ্ছিক)</label><input id="coNote"></div>
      <div class="field"><label>পেমেন্ট</label>
        <div class="pay-seg-row">
          <button type="button" class="pay-seg active" data-pay="cod">ক্যাশ অন ডেলিভারি</button>
          <button type="button" class="pay-seg" data-pay="advance">অ্যাডভান্স পেমেন্ট</button>
        </div>
      </div>
      <div id="advanceBox" style="display:none;">
        ${payLines || `<p class="muted" style="margin-bottom:10px;">পেমেন্ট নম্বর এখনো যোগ হয়নি — ক্যাশ অন ডেলিভারি বেছে নিন</p>`}
        <div class="field"><label>যে নম্বর থেকে পাঠিয়েছেন / TrxID *</label><input id="coTrx" placeholder="লেনদেনের তথ্য লিখুন"></div>
      </div>
      <button class="btn btn-primary" id="coPlaceBtn" style="width:100%; margin-top:4px;">অর্ডার প্লেস করুন</button>
    </div>`;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => openOverlay(overlay));
  const close = () => { closeOverlay(overlay); setTimeout(() => overlay.remove(), 250); };
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });

  let payType = "cod";
  overlay.querySelectorAll("[data-pay]").forEach(b => b.addEventListener("click", () => {
    payType = b.dataset.pay;
    overlay.querySelectorAll("[data-pay]").forEach(x => x.classList.toggle("active", x === b));
    overlay.querySelector("#advanceBox").style.display = payType === "advance" ? "" : "none";
  }));

  overlay.querySelector("#coPlaceBtn").addEventListener("click", async (e) => {
    if (submitting) return;
    const name = overlay.querySelector("#coName").value.trim();
    const phone = overlay.querySelector("#coPhone").value.trim();
    const address = overlay.querySelector("#coAddress").value.trim();
    const note = overlay.querySelector("#coNote").value.trim();
    const trx = overlay.querySelector("#coTrx") ? overlay.querySelector("#coTrx").value.trim() : "";
    if (!name) { showToast("নাম লিখুন", "error"); return; }
    if (!phone || phone.replace(/\D/g, "").length < 11) { showToast("সঠিক ফোন নম্বর দিন", "error"); return; }
    if (!address) { showToast("ঠিকানা লিখুন", "error"); return; }
    if (payType === "advance" && !trx) { showToast("লেনদেনের তথ্য / TrxID লিখুন", "error"); return; }
    submitting = true;
    const btn = e.currentTarget;
    btn.innerHTML = `<span class="spinner"></span>`;
    try {
      const cartSnapshot = cart.map(it => ({ ...it }));
      const orderId = await createOnlineOrder({
        items: cartSnapshot.map(it => ({ variantId: it.variantId, tileTypeId: it.tileTypeId, tileTypeName: it.tileTypeName, quality: it.quality || "", color: it.color || "", size: it.size, customSize: it.customSize, quantity: it.quantity })),
        customerName: name, customerPhone: phone, customerAddress: address,
        note, paymentType: payType, trxInfo: trx
      });
      cart.length = 0;
      updateCartBar();
      close();
      setTimeout(() => showSuccess(orderId, phone, cartSnapshot), 280);
    } catch (err) {
      console.error(err);
      showToast("অর্ডার পাঠানো যায়নি — আবার চেষ্টা করুন", "error");
      btn.textContent = "অর্ডার প্লেস করুন";
    } finally {
      submitting = false;
    }
  });
}

/* ================= success screen ================= */
function showSuccess(orderId, phone, items) {
  const overlay = document.createElement("div");
  overlay.className = "um-overlay";
  const waNum = S.shopInfo.whatsapp || S.shopInfo.phone;
  const summary = [
    "আসসালামু আলাইকুম, আমি একটা অর্ডার দিয়েছি।",
    `ট্র্যাকিং নম্বরঃ ${orderId}`,
    ...items.map(it => `- ${itemLabel(it)} × ${it.quantity} পিস`)
  ].join("\n");
  overlay.innerHTML = `
    <div class="um-card">
      <div class="os-check">
        <svg viewBox="0 0 52 52"><circle cx="26" cy="26" r="24" fill="none"/><path d="M14 27l8 8 16-16" fill="none"/></svg>
      </div>
      <h3>অর্ডার গৃহীত হয়েছে</h3>
      <p class="muted" style="margin:12px 0 4px; line-height:1.7;">ধন্যবাদ! আমরা খুব শীঘ্রই আপনার ফোন নম্বরে যোগাযোগ করে দাম ও ডেলিভারি চূড়ান্ত করব।</p>
      <div class="os-track-box">
        <span>আপনার ট্র্যাকিং নম্বর</span>
        <div class="os-track-code" id="osTrackCode">${escapeHtml(orderId)}</div>
        <small>এটা সংরক্ষণ করুন — পরে অর্ডারের অবস্থা দেখতে লাগবে</small>
      </div>
      <div class="btn-block-row" style="margin-top:16px;">
        <button class="btn btn-ghost btn-sm" id="osCopyBtn">কপি করুন</button>
        ${waNum ? `<a class="btn btn-ghost btn-sm" href="${waLink(waNum, summary)}" target="_blank" rel="noopener">WhatsApp-এ পাঠান</a>` : ""}
      </div>
      <button class="btn btn-primary um-btn" id="osDoneBtn" style="margin-top:10px;">ঠিক আছে</button>
    </div>`;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add("show"));
  overlay.querySelector("#osDoneBtn").addEventListener("click", () => {
    overlay.classList.remove("show");
    setTimeout(() => overlay.remove(), 350);
  });
  overlay.querySelector("#osCopyBtn").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(orderId); showToast("কপি হয়েছে", "success"); }
    catch { showToast("কপি করা যায়নি", "error"); }
  });
}

/* ================= order tracking (full pipeline status) ================= */
const TRACK_STEPS = [
  { key: "submitted", label: "অর্ডার জমা হয়েছে" },
  { key: "accepted", label: "অর্ডার গৃহীত হয়েছে" },
  { key: "producing", label: "উৎপাদনে আছে" },
  { key: "ready", label: "প্রস্তুত হয়েছে" },
  { key: "delivered", label: "ডেলিভারি হয়েছে" },
];
function trackStepIndex(order, linkedOrder) {
  if (!linkedOrder) return order.status === "accepted" ? 1 : 0;
  const map = { pending: 1, producing: 2, ready: 3, delivered: 4 };
  return map[linkedOrder.status] ?? 1;
}
function openTrackSheet() {
  const overlay = document.createElement("div");
  overlay.className = "overlay";
  overlay.innerHTML = `
    <div class="sheet">
      <div class="sheet-handle"></div>
      <h3 style="font-size:17px; margin-bottom:14px;">অর্ডার ট্র্যাক করুন</h3>
      <div class="field"><label>ট্র্যাকিং নম্বর</label><input id="trkId" placeholder="অর্ডারের সময় পাওয়া কোড"></div>
      <div class="field"><label>ফোন নম্বর</label><input id="trkPhone" type="tel" placeholder="অর্ডারে দেওয়া নম্বর"></div>
      <button class="btn btn-primary" id="trkSearchBtn" style="width:100%;">খুঁজুন</button>
      <div id="trkResult" style="margin-top:16px;"></div>
    </div>`;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => openOverlay(overlay));
  const close = () => { closeOverlay(overlay); setTimeout(() => overlay.remove(), 250); };
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });

  overlay.querySelector("#trkSearchBtn").addEventListener("click", async (e) => {
    const id = overlay.querySelector("#trkId").value.trim();
    const phone = overlay.querySelector("#trkPhone").value.trim();
    const resultEl = overlay.querySelector("#trkResult");
    if (!id || !phone) { showToast("ট্র্যাকিং নম্বর ও ফোন নম্বর দিন", "error"); return; }
    const btn = e.currentTarget;
    const original = btn.textContent;
    btn.innerHTML = `<span class="spinner"></span>`;
    try {
      const result = await trackOnlineOrder(id, phone);
      if (!result) {
        resultEl.innerHTML = `<p class="muted center" style="padding:14px 0;">এই তথ্যে কোনো অর্ডার পাওয়া যায়নি — নম্বর দুটো আবার দেখুন</p>`;
      } else {
        resultEl.innerHTML = renderTrackResult(result.order, result.linkedOrder);
      }
    } catch (err) {
      console.error(err);
      resultEl.innerHTML = `<p class="muted center" style="padding:14px 0;">খোঁজা যায়নি, আবার চেষ্টা করুন</p>`;
    } finally {
      btn.textContent = original;
    }
  });
}
function renderTrackResult(order, linkedOrder) {
  if (order.status === "rejected") {
    return `<div class="track-rejected">${Icon.close} <b>এই অর্ডারটি বাতিল করা হয়েছে</b><span>বিস্তারিত জানতে দোকানে যোগাযোগ করুন</span></div>`;
  }
  const stepIdx = trackStepIndex(order, linkedOrder);
  const itemsSummary = (order.items || []).map(it => `${itemLabel(it)} × ${formatQty(it.quantity)}`).join(", ");
  return `
    <div class="track-items muted">${escapeHtml(itemsSummary)}</div>
    <div class="track-timeline">
      ${TRACK_STEPS.map((s, i) => `
        <div class="tt-step ${i < stepIdx ? "done" : i === stepIdx ? "current" : ""}">
          <span class="tt-dot"></span>
          <div class="tt-body"><b>${s.label}</b></div>
        </div>`).join("")}
    </div>`;
}
/* ================= COMPANY & OWNER PROFILE SECTION ================= */

// পোর্টফোলিও প্রজেক্ট সমূহের ডাটা (ছবি পরিবর্তনের জন্য imageUrl পরিবর্তন করুন)
const PORTFOLIO_PROJECTS = [
  { name: "শেখ হাসিনা সেনানিবাস", location: "লেবুখালী, বরিশাল", imageUrl: "https://i.postimg.cc/c4YCrXG0/IMG-20260812-111906.jpg" },
  { name: "শেখ রাসেল শিশু পার্ক", location: "পটুয়াখালী", imageUrl: "https://i.postimg.cc/9X9Cp08P/IMG-20260812-112209.jpg" },
  { name: "জেলা পরিষদ", location: "বরিশাল", imageUrl:"https://i.postimg.cc/pd56HhFM/IMG-20260812-112602.jpg" },
  { name: "সিটি কর্পোরেশন", location: "ঢাকা", imageUrl: "https://i.postimg.cc/d0nLJ3P5/IMG-20260812-113337.jpg" },
  { name: "বরিশাল ক্যাডেট কলেজ", location: "বরিশাল", imageUrl: "https://i.postimg.cc/wxD3BwdS/IMG-20260812-113620.jpg" },
  { name: "বারিধারা - DOHS", location: "ঢাকা", imageUrl: "https://i.postimg.cc/J0KLkDx5/IMG-20260812-113858.jpg" },
  { name: "ঢাকা ক্যান্টনমেন্ট", location: "ঢাকা", imageUrl: "https://i.postimg.cc/t4bk8nCF/1786506782612.png" },
  { name: "LGED ভবন", location: "বরিশাল", imageUrl: "https://i.postimg.cc/t4bk8nCF/1786506782612.png" },
  { name: "সামিট পাওয়ার প্লান্ট", location: "বরিশাল", imageUrl: "https://i.postimg.cc/t4bk8nCF/1786506782612.png" },
  { name: "দুর্গা সাগর দিঘি এলাকা", location: "বরিশাল", imageUrl: "https://i.postimg.cc/t4bk8nCF/1786506782612.png" },
  { name: "শিক্ষা ভবন", location: "বরিশাল", imageUrl: "https://i.postimg.cc/t4bk8nCF/1786506782612.png" },
  { name: "পায়রা তাপ বিদ্যুৎ কেন্দ্র", location: "পটুয়াখালী", imageUrl: "https://i.postimg.cc/t4bk8nCF/1786506782612.png" },
  { name: "পায়রা বন্দর অফিস", location: "পটুয়াখালী", imageUrl: "https://i.postimg.cc/t4bk8nCF/1786506782612.png" },
  { name: "জেলা শিল্পকলা একাডেমী", location: "বরিশাল", imageUrl: "https://i.postimg.cc/t4bk8nCF/1786506782612.png" }
];

function renderCompanyProfile() {
  let container = document.getElementById("companyProfileWrap");
  if (!container) {
    container = document.createElement("div");
    container.id = "companyProfileWrap";
    container.className = "cp-wrapper";
    
    const shopPage = document.getElementById("shopPage");
    const devCredit = shopPage ? shopPage.querySelector(".dev-credit") : null;
    
    // 🔹 ফুটার ক্রেডিটের ঠিক উপরে প্রোফাইলটি বসিয়ে দেওয়া হচ্ছে
    if (devCredit) {
      shopPage.insertBefore(container, devCredit);
    } else if (shopPage) {
      shopPage.appendChild(container);
    }
  }
  container.style.display = "none";
  
  container.innerHTML = `
    <!-- ১. মালিকের প্রোফাইল কার্ড -->
    <div class="cp-section-title" style="animation-delay:.02s">ব্যবস্থাপনা পরিচালকের বার্তা</div>
    <div class="cp-card cp-owner-card" style="animation-delay:.06s">
      <div class="cp-owner-top">
        <div class="cp-owner-img-wrap"><img class="cp-owner-img" src="https://i.postimg.cc/t4bk8nCF/1786506782612.png" alt="S.M FAIJUL HAQUE"></div>
        <div class="cp-owner-info">
          <h3 class="cp-owner-name">S.M FAIJUL HAQUE</h3>
          <span class="cp-owner-title">Managing Director</span>
          <div class="cp-degrees">
            <span class="cp-badge">🎓 BBA</span>
            <span class="cp-badge">📜 MBA</span>
          </div>
        </div>
      </div>
      <blockquote class="cp-owner-quote">
        আমরা পণ্যের মান, নিখুঁত ফিনিশিং ও দীর্ঘস্থায়িত্বে বিশ্বাসী। আপনাদের আস্থাই আমাদের পথচলার শক্তি।
      </blockquote>
    </div>

    <!-- ২. কোম্পানি পরিচিতি ও ফিচারস -->
    <div class="cp-section-title" style="animation-delay:.1s">আমাদের পথচলা ও অর্জন</div>
    <div class="cp-card cp-about-card" style="animation-delay:.14s">
      <div class="cp-exp-chip"><span class="cp-exp-num" data-count="9">0</span>+ বছরের অভিজ্ঞতা (২০১৭ হতে)</div>
      <p class="cp-about-text">
        <b>4B PAVEMENT TILES</b> ২০১৭ সাল থেকে দীর্ঘ ৯+ বছর ধরে বাড়ি ও বিভিন্ন গুরুত্বপূর্ণ স্থাপনার সৌন্দর্য বর্ধন এবং স্থায়িত্ব নিশ্চিতকরণে নিরবচ্ছিন্নভাবে কাজ করে যাচ্ছে। বরিশালে আমাদের যাত্রা শুরু হলেও পণ্যের সেরা মান ও স্থায়িত্বের কারণে এটি খুব অল্প সময়ের মধ্যেই সারা বাংলাদেশে ছড়িয়ে পড়েছে। বর্তমানে দেশের প্রতিটি প্রান্তে ডিলারশিপ ও শো-রুমের মাধ্যমে আমাদের টাইলস সম্মানিত গ্রাহকদের দোরগোড়ায় পৌঁছে যাচ্ছে।
      </p>
      
      <div class="cp-highlights">
        <div class="cp-hl-item">
          <span class="cp-hl-icon">🔨</span>
          <div><b>উচ্চ চাপ সহনশীল:</b> হেভি-ডিউটি কাস্টিং প্রযুক্তিতে তৈরি পেভারস।</div>
        </div>
        <div class="cp-hl-item">
          <span class="cp-hl-icon">🌧️</span>
          <div><b>আবহাওয়া প্রতিরোধী:</b> রোদ ও বৃষ্টিতেও রঙ ও মসৃণতা অটুট থাকে।</div>
        </div>
        <div class="cp-hl-item">
          <span class="cp-hl-icon">🏛️</span>
          <div><b>মেগা প্রজেক্টে ব্যবহৃত:</b> সেনানিবাস, পাওয়ার প্ল্যান্ট ও পার্কসমূহে সুনামের সাথে প্রতিষ্ঠিত।</div>
        </div>
        <div class="cp-hl-item">
          <span class="cp-hl-icon">🚛</span>
          <div><b>সারাদেশে সরবরাহ:</b> নিজস্ব লজিস্টিক্সে দ্রুত নিরাপদ ডেলিভারি সার্ভিস।</div>
        </div>
      </div>
    </div>

    <!-- ৩. সম্পন্ন প্রজেক্ট পোর্টফোলিও -->
    <div class="cp-section-title" style="animation-delay:.18s">🏛️ উল্লেখযোগ্য সম্পন্নকৃত প্রজেক্টস<span class="cp-section-count">${PORTFOLIO_PROJECTS.length}টি প্রজেক্ট</span></div>
    <div class="cp-portfolio-track">
      ${PORTFOLIO_PROJECTS.map((p, i) => `
        <div class="cp-project-card" style="animation-delay:${(0.2 + i * 0.05).toFixed(2)}s">
          <div class="cp-proj-img" style="background-image: url('${escapeHtml(p.imageUrl)}')">
            <span class="cp-proj-loc">📍 ${escapeHtml(p.location)}</span>
          </div>
          <b>${escapeHtml(p.name)}</b>
        </div>
      `).join('')}
    </div>

    <!-- ৪. অফিস ও ফ্যাক্টরি সমূহের ঠিকানা -->
    <div class="cp-section-title" style="animation-delay:.24s">📍 আমাদের অফিস ও ফ্যাক্টরি সমূহ</div>
    <div class="cp-locations-grid">
      
      <div class="cp-loc-card" style="animation-delay:.28s">
        <span class="cp-loc-icon">🏢</span>
        <div class="cp-loc-body">
          <div class="cp-loc-hdr">বরিশাল অফিস</div>
          <p>বীরশ্রেষ্ঠ মহিউদ্দিন আহমেদ সড়ক, আলেকান্দা সরকারি কলেজের বিপরীতে, হোল্ডিং নং-০১৫, ওয়ার্ড নং-১৫, বিসিসি, বরিশাল।</p>
          <div class="cp-phones">
            <a href="tel:01772601515">📞 01772601515</a>
            <a href="tel:01818649028">📞 01818649028</a>
            <a href="tel:01711189845">📞 01711189845</a>
          </div>
        </div>
      </div>

      <div class="cp-loc-card" style="animation-delay:.32s">
        <span class="cp-loc-icon">🏢</span>
        <div class="cp-loc-body">
          <div class="cp-loc-hdr">গাজীপুর অফিস</div>
          <p>সুলতান মার্কেট, বড় বাড়ি, জাতীয় বিশ্ববিদ্যালয়, গাজীপুর।</p>
          <div class="cp-phones">
            <a href="tel:01716748009">📞 01716748009</a>
            <a href="tel:01736907380">📞 01736907380</a>
          </div>
        </div>
      </div>

      <div class="cp-loc-card" style="animation-delay:.36s">
        <span class="cp-loc-icon">🏭</span>
        <div class="cp-loc-body">
          <div class="cp-loc-hdr">বরিশাল ফ্যাক্টরি</div>
          <p>উত্তর হরিণাফুলিয়া, জাঙ্গাল সড়ক, ২৬ নং ওয়ার্ড, বিসিসি, বরিশাল।</p>
          <div class="cp-phones">
            <a href="tel:01738721569">📞 01738721569</a>
            <a href="tel:01611189845">📞 01611189845</a>
          </div>
        </div>
      </div>

      <div class="cp-loc-card" style="animation-delay:.4s">
        <span class="cp-loc-icon">🏭</span>
        <div class="cp-loc-body">
          <div class="cp-loc-hdr">ঢাকা ফ্যাক্টরি</div>
          <p>লাবনী, মধ্যচর, কেরানীগঞ্জ, ঢাকা।</p>
        </div>
      </div>

    </div>

    <!-- ৫. অফিশিয়াল যোগাযোগ ও সোশ্যাল হাব -->
    <div class="cp-online-links">
      <a href="mailto:merazbinmizanur@gmail.com" class="cp-link-btn" style="animation-delay:.44s">
        ✉️ merazbinmizanur@gmail.com
      </a>
      <a href="https://www.4btiles.com" target="_blank" rel="noopener" class="cp-link-btn" style="animation-delay:.48s">
        🌐 www.4btiles.com
      </a>
    </div>
  `;
  requestAnimationFrame(animateExpCounter);
}

// One-time count-up (0 -> target) for the "৯+ বছরের অভিজ্ঞতা" figure —
// runs once per render, the moment the profile markup is in the DOM.
function animateExpCounter() {
  const el = document.querySelector("#companyProfileWrap .cp-exp-num");
  if (!el) return;
  const target = Number(el.dataset.count) || 0;
  const start = performance.now();
  const dur = 900;
  function tick(now) {
    const p = Math.min(1, (now - start) / dur);
    el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3)));
    if (p < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}
