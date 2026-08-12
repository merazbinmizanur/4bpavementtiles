// ============================================================
// 4B PAVEMENT TILES — Owner panel
// ============================================================
import { guardPage, logout, authErrorText, reauthenticateWithPassword } from "./auth.js";
import { Icon } from "./icons.js";
import { showMemo, showPayslip, showSalarySheet } from "./memo.js";
import {
  subscribeTileTypes, addTileType, updateTileType, deleteTileType,
  subscribeVariants, addVariant, updateVariant, deleteVariant, variantLabel,
  subscribeStock, transferStock,
  subscribeSales, deleteSale, createSale,
  subscribeProduction, deleteProduction,
  subscribeCustomers, addCustomer, addPayment, getCustomerLedger, searchCustomersByName,
  subscribeEmployees, addEmployee, updateEmployee, setEmployeeActive,
  subscribeManagers, createManagerAccount, setManagerActive, updateManager,
  subscribeFeedback, markFeedbackRead,
  subscribeNotifications, markNotificationRead, markAllNotificationsRead,
  subscribeShopInfo, updateShopInfo, exportAllData, wipeAllData,
  subscribeAttendanceForDate, getAttendanceForDate, deleteAttendance, getAttendanceForRange,
  subscribeSalaries, generateMonthSalaries, updateSalary, markSalaryPaid,
  subscribeAdvancesForMonth, addAdvance, deleteAdvance,
  createOrder, subscribeOrders, updateOrderStatus, deliverOrder,
  subscribeOnlineOrders, updateOnlineOrderStatus, deleteOnlineOrder, convertOnlineOrder
} from "./data.js";
import {
  formatMoney, formatQty, formatDateBN, formatDateTimeBN, formatWeekdayBN, toDate, ymd, ym, toBnDigits,
  showToast, confirmDialog, formSheet, sheet, escapeHtml, alertDialog, shortfallBodyHtml, initUpdateWatcher, initA2HSPrompt
} from "./utils.js";

/* ================= state ================= */
const S = {
  profile: null,
  tileTypes: [], variants: [], stock: [], sales: [], production: [], customers: [],
  employees: [], managers: [], feedback: [], notifications: [], shopInfo: {}, attendanceToday: [], salaries: [], orders: [], advances: [], onlineOrders: [],
  loaded: {}
};
const VS = {
  view: "dashboard", params: {},
  salesFilter: { loc: "all", pay: "all" },
  customerSearch: "", stockSearch: "",
  ledgerCustomerId: null, ledgerData: [], ledgerLoading: false,
  attendanceDate: ymd(), attendanceDateData: [],
  salaryMonth: ym(),
  reportStart: ymd(new Date(Date.now() - 29 * 86400000)), reportEnd: ymd(),
  staffTab: "employees",
  lastTransfer: null,
  heatmapData: null,
  orderMode: "list", orderFilter: "active", orderCart: [], orderSubmitting: false,
  ooFilter: "new",
  cart: [], saleLoc: "factory", salePay: "cash", selectedCustomer: null,
  saleSubmitting: false, lastSale: null,
};
const VIEW_DEPS = {
  dashboard: ["sales", "production", "stock", "customers", "managers", "attendanceToday", "employees", "feedback", "orders"],
  sales: ["sales"], production: ["production"], stock: ["stock", "tileTypes", "variants"],
  customers: ["customers"], customerLedger: ["customers"],
  staff: ["employees", "managers"], attendance: ["attendanceToday", "employees"],
  salary: ["salaries", "employees"], feedback: ["feedback"],
  reports: ["sales", "production"], settings: ["shopInfo", "tileTypes"], more: [],
  shopManage: ["tileTypes", "variants", "shopInfo"],
  orders: ["orders", "tileTypes", "variants"],
  onlineOrders: ["onlineOrders"],
  saleEntry: ["tileTypes", "variants", "stock", "customers"],
};

let unsubSalary = null;
let unsubAdvances = null;
let renderTimer = null;
let notifSheetBodyEl = null;
let lastUnreadNotifCount = 0;
const viewEl = document.getElementById("view");

function onStateChange(key) {
  S.loaded[key] = true;
  const deps = VIEW_DEPS[VS.view] || [];
  if (deps.includes(key)) {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(render, 60);
  }
}

/* ================= boot ================= */
const splashMarkEl = document.getElementById("splashMarkHolder");
if (splashMarkEl) splashMarkEl.innerHTML = Icon.brand;

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

guardPage("owner", (profile) => {
  S.profile = profile;
  document.getElementById("brandMarkHolder").innerHTML = Icon.brand;
  document.getElementById("splash").remove();
  document.getElementById("app").style.display = "";
  document.getElementById("ownerNameLabel").textContent = profile.name ? `স্বাগতম, ${profile.name}` : "মালিক প্যানেল";

  document.querySelectorAll(".nav-item").forEach(el => {
    const map = { dashboard: Icon.home, sales: Icon.sale, stock: Icon.box, customers: Icon.people, more: Icon.more };
    const iconHolder = el.querySelector("span");
    if (iconHolder) iconHolder.innerHTML = map[el.dataset.nav] || "";
    el.addEventListener("click", () => navTo(el.dataset.nav));
  });

  const logoutBtn = document.getElementById("logoutBtn");
  logoutBtn.innerHTML = Icon.logout;
  logoutBtn.addEventListener("click", async () => {
    const ok = await confirmDialog({ title: "লগআউট করবেন?", message: "আপনাকে আবার লগইন করতে হবে।", okText: "লগআউট", danger: true });
    if (ok) { await logout(); window.location.href = "login.html"; }
  });

  const notifBtn = document.getElementById("notifBtn");
  if (notifBtn) {
    document.getElementById("notifIconHolder").innerHTML = Icon.bell;
    notifBtn.addEventListener("click", openNotificationsSheet);
  }

  viewEl.addEventListener("click", onViewClick);
  initSubscriptions();
  navTo("dashboard");
});

if ("serviceWorker" in navigator) {
  initUpdateWatcher();
}
initA2HSPrompt();

function initSubscriptions() {
  subscribeTileTypes(v => { S.tileTypes = v; onStateChange("tileTypes"); });
  subscribeVariants(v => { S.variants = v; onStateChange("variants"); });
  subscribeStock(v => { S.stock = v; onStateChange("stock"); });
  subscribeSales(v => { S.sales = v; onStateChange("sales"); }, { max: 200 });
  subscribeProduction(v => { S.production = v; onStateChange("production"); }, { max: 200 });
  subscribeCustomers(v => { S.customers = v; onStateChange("customers"); });
  subscribeEmployees(v => { S.employees = v; onStateChange("employees"); });
  subscribeManagers(v => { S.managers = v; onStateChange("managers"); });
  subscribeFeedback(v => { S.feedback = v; onStateChange("feedback"); });
  subscribeNotifications(v => { S.notifications = v; updateNotifBadge(); refreshNotifSheetIfOpen(); });
  subscribeShopInfo(v => { S.shopInfo = v; onStateChange("shopInfo"); });
  subscribeAttendanceForDate(ymd(), v => { S.attendanceToday = v; onStateChange("attendanceToday"); });
  subscribeOrders(v => { S.orders = v; onStateChange("orders"); });
  subscribeOnlineOrders(v => { S.onlineOrders = v; onStateChange("onlineOrders"); });
  watchSalaryMonth(VS.salaryMonth);
}
function watchSalaryMonth(month) {
  if (unsubSalary) unsubSalary();
  if (unsubAdvances) unsubAdvances();
  VS.salaryMonth = month;
  unsubSalary = subscribeSalaries(v => { S.salaries = v; onStateChange("salaries"); }, month);
  unsubAdvances = subscribeAdvancesForMonth(month, v => { S.advances = v; onStateChange("salaries"); });
}

/* ================= nav / render ================= */
function navTo(view, params = {}) {
  VS.view = view; VS.params = params;
  if (view === "customerLedger") {
    VS.ledgerCustomerId = params.id; VS.ledgerLoading = true; VS.ledgerData = [];
    getCustomerLedger(params.id).then(data => {
      if (VS.view === "customerLedger" && VS.ledgerCustomerId === params.id) {
        VS.ledgerData = data; VS.ledgerLoading = false; render();
      }
    });
  }
  if (view === "dashboard" && !VS.heatmapData) loadAttendanceHeatmap();
  if (view === "attendance") loadAttendanceForDate(VS.attendanceDate);
  updateBottomNavActive();
  render();
}
function updateBottomNavActive() {
  const primaryOf = {
    production: "dashboard", attendance: "dashboard", feedback: "dashboard", orders: "dashboard", onlineOrders: "dashboard",
    customerLedger: "customers", staff: "more", salary: "more", reports: "more", settings: "more", shopManage: "more", saleEntry: "sales"
  };
  const active = primaryOf[VS.view] || VS.view;
  document.querySelectorAll(".nav-item").forEach(el => el.classList.toggle("active", el.dataset.nav === active));
}

async function loadAttendanceForDate(date) {
  if (date === ymd()) { VS.attendanceDateData = S.attendanceToday; render(); return; }
  VS.attendanceDateData = await getAttendanceForDate(date);
  if (VS.attendanceDate === date) render();
}

function render() {
  const renderers = {
    dashboard: renderDashboard, sales: renderSales, production: renderProduction, stock: renderStock,
    customers: renderCustomers, customerLedger: renderCustomerLedger, staff: renderStaff,
    attendance: renderAttendance, salary: renderSalary, feedback: renderFeedback,
    reports: renderReports, settings: renderSettings, more: renderMore, orders: renderOrders,
    shopManage: renderShopManage,
    onlineOrders: renderOnlineOrders,
    saleEntry: renderSaleEntry
  };
  const deps = VIEW_DEPS[VS.view] || [];
  if (!deps.every(k => S.loaded[k])) {
    viewEl.innerHTML = skeletonFor(VS.view);
    return;
  }
  viewEl.innerHTML = (renderers[VS.view] || renderDashboard)();
  afterRender();
}

/* ================= skeleton loading placeholders ================= */
// Shown instead of a view's real content on the very first visit, for
// whichever of its data keys haven't delivered their first Firestore
// snapshot yet (see S.loaded, set in onStateChange). Once loaded, a view
// never shows its skeleton again — this is a first-load state, not a
// spinner replayed on every navigation.
function skelRow() {
  return `<div class="skel-row"><span class="skel skel-circle"></span><div class="skel-lines"><span class="skel skel-line w60"></span><span class="skel skel-line w40"></span></div><span class="skel skel-trailing"></span></div>`;
}
function skeletonList(count = 5) {
  return Array.from({ length: count }, skelRow).join("");
}
function skelCard() {
  return `<div class="skel-card"><span class="skel skel-card-img"></span><div class="skel-card-body"><span class="skel skel-line w60" style="height:12px;"></span><span class="skel skel-trailing" style="width:44px; height:18px;"></span></div></div>`;
}
function skeletonCards(count = 4) {
  return Array.from({ length: count }, skelCard).join("");
}
function skeletonDashboard() {
  return `
    <span class="skel skel-line w40" style="height:13px; margin-bottom:10px;"></span>
    <span class="skel skel-line w60" style="height:22px; margin-bottom:18px;"></span>
    <span class="skel skel-dash-hero"></span>
    <div class="skel-dash-row">
      <span class="skel skel-dash-stat"></span>
      <span class="skel skel-dash-stat"></span>
    </div>
    ${skeletonList(3)}`;
}
const LIST_SKELETON_VIEWS = new Set(["sales", "production", "customers", "staff", "attendance", "feedback", "orders", "onlineOrders"]);
function skeletonFor(view) {
  if (view === "dashboard") return skeletonDashboard();
  if (view === "stock") return skeletonCards(4);
  if (LIST_SKELETON_VIEWS.has(view)) return skeletonList(5);
  return skeletonList(3);
}

function onViewClick(e) {
  const t = e.target.closest("[data-action]");
  if (!t) return;
  Promise.resolve(handleAction(t.dataset.action, t.dataset.id, t)).catch((err) => {
    console.error(err);
    showToast("কিছু একটা সমস্যা হয়েছে, আবার চেষ্টা করুন", "error");
  });
}

/* ================= shared bits ================= */
const tileTypeName = (id) => (S.tileTypes.find(t => t.id === id) || {}).name || "";
const designOf = (tileTypeId) => S.tileTypes.find(t => t.id === tileTypeId);
function variantsFor(tileTypeId) {
  return S.variants.filter(v => v.tileTypeId === tileTypeId);
}
function variantDisplayLabel(v) {
  return v.color || "সাধারণ";
}
// Quality types the owner has used so far, plus the two common starters —
// used to populate the quality select without needing a whole separate
// collection; owner can still type a brand-new one via "অন্য কোয়ালিটি".
function knownQualities() {
  const set = new Set(["Glossy", "Mat"]);
  S.tileTypes.forEach(t => { if (t.quality) set.add(t.quality); });
  return [...set];
}
// All salaried staff: employees + managers together (managers draw a monthly
// salary too, so payroll and advances cover both).
function allStaff() {
  return [
    ...S.employees.filter(e => e.active !== false).map(e => ({ id: e.id, name: e.name, monthlySalary: e.monthlySalary || 0, active: e.active, staffType: "employee" })),
    ...S.managers.filter(m => m.active !== false).map(m => ({ id: m.id, name: m.name, monthlySalary: m.monthlySalary || 0, active: m.active, staffType: "manager" })),
  ];
}
function stockAt(variantId, location) {
  const s = S.stock.find(x => x.variantId === variantId && x.location === location);
  return s ? (s.quantity || 0) : 0;
}
function stockHintText(variantId) {
  return `উপলব্ধ — ফ্যাক্টরি: ${formatQty(stockAt(variantId, "factory"))} · গোডাউন: ${formatQty(stockAt(variantId, "godown"))}`;
}
// Two-level "ডিজাইন" + "কালার" select pair, reused anywhere a specific
// variant needs picking (sale/production entry, stock transfer, order
// creation). Quality is a property of the whole design (shown alongside its
// name), so only color varies within the second dropdown. idPrefix
// namespaces the element IDs so more than one of these can exist on the
// same page without colliding.
// ---- color-name -> swatch matching ----
// The owner types a color as free text ("Red", "Gray White", "কালো") — this
// maps common color words (English + Bangla) to real hex values so the
// picker can show an actual color swatch instead of a photo. Compound names
// ("Gray White") match multiple words and render as a split two-tone swatch;
// anything unrecognized falls back to a neutral placeholder.
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

function thumbVariantClass(id) {
  const n = Math.abs(String(id).split("").reduce((a, c) => a + c.charCodeAt(0), 0));
  return "v" + ((n % 3) + 1);
}
function fieldThumbHtml(imageUrl, id) {
  return imageUrl
    ? `style="background-image:url('${imageUrl.replace(/'/g, "%27")}')"`
    : `class="${thumbVariantClass(id)}"`;
}
// Two tappable "picker fields" (ডিজাইন, কালার). ডিজাইন opens an
// image-thumbnail list with search; কালার opens a circular color-swatch
// grid — a native <select> can't show either, so both replace the old
// dropdown pair. The outer div keeps its value in data-value, read the same
// way a <select>.value would have been.
function variantSelectorHtml(idPrefix) {
  if (!S.tileTypes.length) {
    return `<div class="field"><label>ডিজাইন</label><div class="vpicker-field" style="cursor:default;"><span class="vpicker-label">প্রথমে সেটিংসে টাইলসের ধরন যোগ করুন</span></div></div>`;
  }
  const firstTt = S.tileTypes[0];
  const firstVariants = variantsFor(firstTt.id);
  const fv = firstVariants[0];
  return `
    <div class="field" style="margin-bottom:10px;"><label>ডিজাইন</label>
      <div class="vpicker-field" id="${idPrefix}Design" data-value="${firstTt.id}">
        <span class="vpicker-thumb" ${fieldThumbHtml(firstTt.imageUrl, firstTt.id)}></span>
        <span class="vpicker-label">${escapeHtml(firstTt.name)}${firstTt.size ? ` — ${escapeHtml(firstTt.size)}` : ""}</span>
        <span class="vpicker-chev">›</span>
      </div>
    </div>
    <div class="field" style="margin-bottom:0;"><label>কালার</label>
      <div class="vpicker-field" id="${idPrefix}Variant" data-value="${fv ? fv.id : ""}">
        <span class="vswatch-dot" style="${fv ? colorSwatchStyle(fv.color) : ""}"></span>
        <span class="vpicker-label">${fv ? escapeHtml(variantDisplayLabel(fv)) : "এই ডিজাইনের কোনো কালার নেই"}</span>
        <span class="vpicker-chev">›</span>
      </div>
      ${fv ? `<div class="hint" id="${idPrefix}StockHint">${stockHintText(fv.id)}</div>` : ""}
    </div>`;
}
// Design picker: image-thumbnail list with a live search box.
function openDesignPickerSheet(items, currentId, onSelect) {
  const listHtml = (list) => list.map(it => `
    <div class="vp-row${it.id === currentId ? " active" : ""}" data-id="${it.id}">
      <span class="vp-thumb" ${fieldThumbHtml(it.imageUrl, it.id)}></span>
      <span class="vp-name">${escapeHtml(it.label)}</span>
      ${it.id === currentId ? `<span class="vp-check">✓</span>` : ""}
    </div>`).join("") || `<p class="muted center" style="padding:14px 0;">কিছু পাওয়া যায়নি</p>`;
  const { close, overlay } = sheet({
    title: "ডিজাইন বাছাই করুন",
    bodyHtml: `
      <div class="vp-search"><input type="text" id="vpSearchInput" placeholder="টাইলসের নাম খুঁজুন..." autocomplete="off"></div>
      <div class="vp-list" id="vpList">${listHtml(items)}</div>`
  });
  overlay.querySelector("#vpSearchInput").addEventListener("input", (e) => {
    const t = e.target.value.trim().toLowerCase();
    const filtered = t ? items.filter(it => it.label.toLowerCase().includes(t)) : items;
    overlay.querySelector("#vpList").innerHTML = listHtml(filtered);
  });
  overlay.querySelector(".vp-list").addEventListener("click", (e) => {
    const row = e.target.closest("[data-id]");
    if (!row) return;
    onSelect(row.dataset.id);
    close();
  });
  overlay.addEventListener("click", (e) => {
    const row = e.target.closest("[data-id]");
    if (!row) return;
    onSelect(row.dataset.id);
    close();
  });
}
// Color picker: circular swatch grid, matched from the color's free-typed name.
function openColorPickerSheet(items, currentId, onSelect) {
  const { close, overlay } = sheet({
    title: "কালার বাছাই করুন",
    bodyHtml: `<div class="vp-color-grid">
      ${items.map(it => {
        const stops = colorSwatchStops(it.color);
        const light = isLightHex(stops[0]);
        return `
        <div class="vp-color-item${it.id === currentId ? " active" : ""}" data-id="${it.id}">
          <span class="vp-color-swatch" style="${colorSwatchStyle(it.color)}">
            <span class="vp-color-check" style="color:${light ? "#1A1A1A" : "#fff"};">✓</span>
          </span>
          <span class="vp-color-name">${escapeHtml(it.color || "সাধারণ")}</span>
        </div>`;
      }).join("") || `<p class="muted center" style="padding:14px 0; grid-column:1/-1;">কিছু পাওয়া যায়নি</p>`}
    </div>`
  });
  overlay.querySelector(".vp-color-grid").addEventListener("click", (e) => {
    const item = e.target.closest("[data-id]");
    if (!item) return;
    onSelect(item.dataset.id);
    close();
  });
}
// Updates the ডিজাইন field's thumbnail/label/data-value in place.
function setDesignField(fieldEl, id, label, imageUrl) {
  fieldEl.dataset.value = id || "";
  const thumb = fieldEl.querySelector(".vpicker-thumb");
  thumb.className = "vpicker-thumb";
  thumb.style.backgroundImage = "";
  if (imageUrl) thumb.style.backgroundImage = `url('${imageUrl.replace(/'/g, "%27")}')`;
  else thumb.classList.add(thumbVariantClass(id || "x"));
  fieldEl.querySelector(".vpicker-label").textContent = label;
}
// Updates the কালার field's swatch/label/data-value in place.
function setColorField(fieldEl, id, colorText) {
  fieldEl.dataset.value = id || "";
  const dot = fieldEl.querySelector(".vswatch-dot");
  if (dot) dot.style.cssText = colorSwatchStyle(colorText);
  fieldEl.querySelector(".vpicker-label").textContent = colorText || "সাধারণ";
}
// Wires tap-to-open-picker for a selector built by variantSelectorHtml.
// Call once after the HTML containing it is in the DOM (from afterRender).
function wireVariantCascade(idPrefix) {
  const designEl = document.getElementById(`${idPrefix}Design`);
  const variantEl = document.getElementById(`${idPrefix}Variant`);
  if (!designEl || !variantEl) return;
  const refreshVariantForDesign = (tileTypeId) => {
    const variants = variantsFor(tileTypeId);
    const fv = variants[0];
    setColorField(variantEl, fv ? fv.id : "", fv ? variantDisplayLabel(fv) : "এই ডিজাইনের কোনো কালার নেই");
    const hintEl = document.getElementById(`${idPrefix}StockHint`);
    if (hintEl) hintEl.textContent = fv ? stockHintText(fv.id) : "";
  };
  designEl.addEventListener("click", () => {
    openDesignPickerSheet(
      S.tileTypes.map(t => ({ id: t.id, label: `${t.name}${t.size ? " — " + t.size : ""}`, imageUrl: t.imageUrl })),
      designEl.dataset.value,
      (id) => {
        const t = S.tileTypes.find(x => x.id === id);
        setDesignField(designEl, id, `${t.name}${t.size ? " — " + t.size : ""}`, t.imageUrl);
        refreshVariantForDesign(id);
      }
    );
  });
  variantEl.addEventListener("click", () => {
    const variants = variantsFor(designEl.dataset.value);
    if (!variants.length) return;
    openColorPickerSheet(
      variants.map(v => ({ id: v.id, color: v.color })),
      variantEl.dataset.value,
      (id) => {
        const v = variants.find(x => x.id === id);
        setColorField(variantEl, id, variantDisplayLabel(v));
        const hintEl = document.getElementById(`${idPrefix}StockHint`);
        if (hintEl) hintEl.textContent = stockHintText(id);
      }
    );
  });
}
function simpleHeader(title) { return `<h2 style="font-size:19px; margin-bottom:14px;">${title}</h2>`; }
function backHeader(title, backTo) {
  return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:14px;">
    <button class="icon-btn" data-action="nav:${backTo}">${Icon.chevronLeft}</button>
    <h2 style="font-size:18px;">${title}</h2>
  </div>`;
}
function emptyState(msg, sub = "") {
  return `<div class="empty-state">${Icon.empty}<b>${msg}</b><span>${sub}</span></div>`;
}
function tileNav(view, icon, colorClass, label, sub) {
  return `<div class="paver tile-nav ${colorClass}" data-action="nav:${view}">
    <div class="t-icon">${icon}</div>
    <div><b>${label}</b><br><small>${sub}</small></div>
  </div>`;
}

/* ================= dashboard ================= */
const AVATAR_COLORS = ["var(--terracotta)", "var(--ochre-deep)", "var(--moss)", "var(--terracotta-deep)", "var(--ink)"];
function countUpEl(el, target) {
  const start = performance.now(), dur = 1200;
  function tick(now) {
    const p = Math.min(1, (now - start) / dur);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = formatMoney(Math.round(target * eased));
    if (p < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}
function heatShade(pct) {
  if (pct <= 0) return "var(--line)";
  if (pct <= 25) return "#CFE0D0";
  if (pct <= 50) return "#9FC1A3";
  if (pct <= 75) return "#6E9873";
  return "var(--moss)";
}
async function loadAttendanceHeatmap() {
  const days = [];
  for (let i = 13; i >= 0; i--) days.push(ymd(new Date(Date.now() - i * 86400000)));
  const activeCount = Math.max(1, S.employees.filter(e => e.active !== false).length);
  try {
    const records = await getAttendanceForRange(days[0], days[days.length - 1]);
    const byDate = {};
    records.forEach(r => { if (r.status === "present") byDate[r.date] = (byDate[r.date] || 0) + 1; });
    VS.heatmapData = { days, pct: days.map(d => Math.round(((byDate[d] || 0) / activeCount) * 100)) };
  } catch (e) {
    console.error("heatmap load failed", e);
    VS.heatmapData = { days, pct: days.map(() => 0) };
  }
  if (VS.view === "dashboard") render();
}

function renderDashboard() {
  const today = ymd();
  const todaySales = S.sales.filter(s => ymd(toDate(s.date || s.createdAt)) === today);
  const todaySalesTotal = todaySales.reduce((a, s) => a + (s.total || 0), 0);
  const todayProd = S.production.filter(p => ymd(toDate(p.date || p.createdAt)) === today);
  const todayProdQty = todayProd.reduce((a, p) => a + (p.quantity || 0), 0);
  const totalDue = S.customers.reduce((a, c) => a + (c.totalDue || 0), 0);
  const activeManagers = S.managers.filter(m => m.active !== false);
  const totalEmployees = S.employees.filter(e => e.active !== false).length;
  const presentToday = S.attendanceToday.filter(a => a.status === "present").length;
  const unreadFeedback = S.feedback.filter(f => !f.read).length;

  // --- 7-day sparkline ---
  const days7 = []; for (let i = 6; i >= 0; i--) days7.push(ymd(new Date(Date.now() - i * 86400000)));
  const spark = days7.map(d => S.sales.filter(s => ymd(toDate(s.date || s.createdAt)) === d).reduce((a, s) => a + (s.total || 0), 0));
  const sparkMax = Math.max(...spark, 1);
  const pts = spark.map((v, i) => ({ x: i * 20, y: 30 - (v / sparkMax) * 26 }));
  const sparkLine = pts.map(p => `${p.x},${p.y.toFixed(1)}`).join(" ");
  const sparkArea = `M${pts[0].x},${pts[0].y.toFixed(1)} ` + pts.slice(1).map(p => `L${p.x},${p.y.toFixed(1)}`).join(" ") + ` L120,36 L0,36 Z`;
  const yesterdayTotal = spark[5] || 0;
  const pctChange = yesterdayTotal > 0 ? Math.round(((todaySalesTotal - yesterdayTotal) / yesterdayTotal) * 100) : (todaySalesTotal > 0 ? 100 : 0);
  const showTrend = todaySalesTotal > 0 || yesterdayTotal > 0;

  // --- cash vs baki (today) ---
  const cashTotal = todaySales.filter(s => s.paymentType === "cash").reduce((a, s) => a + s.total, 0);
  const bakiTotal = todaySales.filter(s => s.paymentType === "baki").reduce((a, s) => a + s.total, 0);
  const paySum = cashTotal + bakiTotal;
  const cashPct = paySum ? Math.round((cashTotal / paySum) * 100) : 0;
  const bakiPct = paySum ? 100 - cashPct : 0;
  const circumference = 201;

  // --- production by tile type (today) ---
  const prodByType = {};
  todayProd.forEach(p => { prodByType[p.tileTypeName || "টাইলস"] = (prodByType[p.tileTypeName || "টাইলস"] || 0) + p.quantity; });
  const prodEntries = Object.entries(prodByType).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const prodMax = Math.max(...prodEntries.map(e => e[1]), 1);

  // --- top overdue customers ---
  const topDue = [...S.customers].filter(c => c.totalDue > 0).sort((a, b) => b.totalDue - a.totalDue).slice(0, 3);

  // --- stock snapshot: top tile types by total qty ---
  const stockByType = {};
  S.stock.forEach(s => {
    if (!stockByType[s.tileTypeId]) stockByType[s.tileTypeId] = { name: s.tileTypeName, factory: 0, godown: 0 };
    stockByType[s.tileTypeId][s.location] = (stockByType[s.tileTypeId][s.location] || 0) + (s.quantity || 0);
  });
  const stockEntries = Object.values(stockByType).map(x => ({ ...x, total: x.factory + x.godown })).filter(x => x.total > 0).sort((a, b) => b.total - a.total).slice(0, 4);

  return `
    <div class="dash-hdr dash-rise">
      <div class="date">${formatWeekdayBN(new Date())}, ${formatDateBN(new Date())}</div>
      <div class="greet">শুভেচ্ছা, <span>${escapeHtml(S.profile.name || "মালিক")}</span></div>
      <div class="dash-live"><span class="dash-radar"><i></i><b></b></span> সব হিসাব লাইভ আপডেট হচ্ছে</div>
    </div>

    <div class="dash-bento">

      <div class="dash-card dash-hero dash-span2 dash-rise" style="animation-delay:.06s">
        <div class="dash-hero-top">
          <div>
            <div class="l">আজকের বিক্রি</div>
            <div class="v" data-count="${todaySalesTotal}">৳0</div>
          </div>
          ${showTrend ? `<div class="dash-trend-pill ${pctChange < 0 ? "down" : ""}">${pctChange < 0 ? "▼" : "▲"} ${formatQty(Math.abs(pctChange))}% গতকাল থেকে</div>` : ""}
        </div>
        <div class="dash-hero-foot">
          <div class="s">গত ৭ দিনের ধারা · ${formatQty(todaySales.length)} টি এন্ট্রি আজ</div>
          <svg width="120" height="36" viewBox="0 0 120 36">
            <defs><linearGradient id="dashSg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#E3C374" stop-opacity=".55"/><stop offset="100%" stop-color="#E3C374" stop-opacity="0"/></linearGradient></defs>
            <path d="${sparkArea}" fill="url(#dashSg)"/>
            <polyline class="dash-spark-path" points="${sparkLine}" fill="none" stroke="#E3C374" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
            <circle class="dash-spark-dot" cx="${pts[6].x}" cy="${pts[6].y.toFixed(1)}" r="3.4" fill="#E3C374"/>
          </svg>
        </div>
      </div>

      <div class="dash-card dash-ring-card dash-rise" style="animation-delay:.12s">
        <div class="l">আজকের হাজিরা</div>
        <div class="dash-ring-wrap">
          <svg width="76" height="76" viewBox="0 0 76 76">
            <circle cx="38" cy="38" r="32" fill="none" stroke="var(--line)" stroke-width="8"/>
            <circle class="dash-ring-fg" cx="38" cy="38" r="32" fill="none" stroke="var(--moss)" stroke-width="8" stroke-linecap="round" transform="rotate(-90 38 38)"
              data-target="${totalEmployees ? circumference - (presentToday / totalEmployees) * circumference : circumference}"/>
          </svg>
          <div class="num">${formatQty(presentToday)}/${formatQty(totalEmployees)}</div>
        </div>
        <div class="s">${totalEmployees ? formatQty(Math.round(presentToday / totalEmployees * 100)) : "০"}% উপস্থিত</div>
      </div>

      <div class="dash-card dash-mgr-card dash-rise" style="animation-delay:.16s">
        <div class="l">সক্রিয় ম্যানেজার</div>
        <div class="dash-mgr-avatars">
          ${activeManagers.slice(0, 4).map((m, i) => `<div class="dash-av" style="background:${AVATAR_COLORS[i % AVATAR_COLORS.length]};">${escapeHtml((m.name || "?")[0])}</div>`).join("")}
          ${activeManagers.length > 4 ? `<div class="dash-av" style="background:var(--ink-faint);">+${formatQty(activeManagers.length - 4)}</div>` : ""}
        </div>
        <div class="v">${formatQty(activeManagers.length)} জন</div>
      </div>

      <div class="dash-card dash-donut-card dash-span2 dash-rise" style="animation-delay:.2s">
        <div class="dash-donut-wrap">
          <svg width="74" height="74" viewBox="0 0 74 74">
            <circle cx="37" cy="37" r="32" fill="none" stroke="var(--line)" stroke-width="9"/>
            ${paySum ? `
            <circle class="dash-dc-cash" cx="37" cy="37" r="32" fill="none" stroke="var(--moss)" stroke-width="9" stroke-linecap="round" data-target="${(cashPct / 100 * circumference).toFixed(1)} ${circumference}"/>
            <circle class="dash-dc-baki" cx="37" cy="37" r="32" fill="none" stroke="var(--ochre)" stroke-width="9" stroke-linecap="round" style="transform:rotate(${(cashPct * 3.6).toFixed(1)}deg); transform-origin:37px 37px;" data-target="${(bakiPct / 100 * circumference).toFixed(1)} ${circumference}"/>` : ""}
          </svg>
        </div>
        <div class="dash-donut-body">
          <div class="l">পেমেন্ট বিভাজন — আজ</div>
          ${paySum ? `
          <div class="dash-dleg"><i style="background:var(--moss);"></i> নগদ <b>${formatQty(cashPct)}%</b></div>
          <div class="dash-dleg"><i style="background:var(--ochre);"></i> বাকি <b>${formatQty(bakiPct)}%</b></div>` : `<div class="muted" style="font-size:12px;">আজ এখনো কোনো বিক্রি হয়নি</div>`}
        </div>
      </div>

      <div class="dash-card dash-cmp-card dash-span2 dash-rise" style="animation-delay:.24s">
        <div class="top"><span class="l">আজকের উৎপাদন</span><span class="v">${formatQty(todayProdQty)} পিস</span></div>
        ${prodEntries.length ? prodEntries.map(([name, qty]) => `
        <div class="dash-cmp-row"><span class="tag">${escapeHtml(name)}</span><div class="dash-cmp-bar-bg"><div class="dash-cmp-bar" data-w="${Math.round(qty / prodMax * 100)}" style="background:var(--terracotta);"></div></div><span class="amt">${formatQty(qty)}</span></div>`).join("")
        : `<p class="muted" style="padding:6px 0;">আজ এখনো কোনো উৎপাদন এন্ট্রি হয়নি</p>`}
      </div>

      <div class="dash-card dash-due-card dash-span2 dash-rise" style="animation-delay:.28s">
        <div class="top"><span class="l">মোট বাকি পাওনা · ${formatQty(S.customers.filter(c => c.totalDue > 0).length)} জন কাস্টমার</span><span class="v" data-count="${totalDue}">৳0</span></div>
        ${topDue.length ? topDue.map(c => `<div class="dash-due-row"><span class="n">${escapeHtml(c.name)}</span><span class="a">${formatMoney(c.totalDue)}</span></div>`).join("")
        : `<p class="muted" style="padding:6px 0;">কোনো বাকি পাওনা নেই</p>`}
      </div>

      <div class="dash-card dash-heat-card dash-span2 dash-rise" style="animation-delay:.32s">
        <div class="top"><span class="l">হাজিরার ধারা — গত ১৪ দিন</span>${VS.heatmapData ? `<span class="s">গড় ${formatQty(Math.round(VS.heatmapData.pct.reduce((a, b) => a + b, 0) / VS.heatmapData.pct.length))}%</span>` : ""}</div>
        <div class="dash-heat-grid">
          ${VS.heatmapData
            ? VS.heatmapData.pct.map((p, i) => `<div class="dash-heat-cell${i === VS.heatmapData.pct.length - 1 ? " today" : ""}" style="background:${heatShade(p)}; animation-delay:${(0.5 + i * 0.03).toFixed(2)}s;"></div>`).join("")
            : Array.from({ length: 14 }).map((_, i) => `<div class="dash-heat-cell" style="background:var(--line); animation-delay:${(0.5 + i * 0.03).toFixed(2)}s;"></div>`).join("")}
        </div>
      </div>

      <div class="dash-card dash-stock-card dash-span2 dash-rise" style="animation-delay:.36s">
        <div class="top">
          <span class="l">স্টক স্ন্যাপশট</span>
          <div class="dash-legend"><span><i style="background:var(--terracotta);"></i>ফ্যাক্টরি</span><span><i style="background:var(--ochre);"></i>গোডাউন</span></div>
        </div>
        ${stockEntries.length ? stockEntries.map(s => `
        <div class="dash-stk-row">
          <div class="nm">${escapeHtml(s.name)}</div>
          <div class="dash-stk-track"><div class="dash-stk-f" data-w="${Math.round(s.factory / s.total * 100)}"></div><div class="dash-stk-g" data-w="${Math.round(s.godown / s.total * 100)}"></div></div>
          <div class="dash-stk-nums"><span>ফ্যাক্টরি ${formatQty(s.factory)}</span><span>গোডাউন ${formatQty(s.godown)}</span></div>
        </div>`).join("") : `<p class="muted" style="padding:6px 0;">এখনো কোনো স্টক নেই</p>`}
      </div>

    </div>

    <div class="dash-section-lbl dash-rise" style="animation-delay:.4s">দ্রুত অ্যাক্সেস</div>
    <div class="dash-navlist dash-rise" style="animation-delay:.42s">
      <div class="dash-navrow" data-action="nav:saleEntry"><div class="ic" style="background:var(--terracotta);">${Icon.plus}</div><div class="body"><b>নতুন বিক্রি এন্ট্রি</b><small>নিজে বিক্রি করুন</small></div><div class="chev">›</div></div>
      <div class="dash-navrow" data-action="nav:sales"><div class="ic" style="background:var(--terracotta);">${Icon.sale}</div><div class="body"><b>বিক্রি তালিকা</b><small>${formatQty(S.sales.length)} এন্ট্রি</small></div><div class="chev">›</div></div>
      <div class="dash-navrow" data-action="nav:orders"><div class="ic" style="background:var(--ink);">${Icon.clipboard}</div><div class="body"><b>অর্ডার</b><small>${formatQty(S.orders.filter(o => o.status !== "delivered" && o.status !== "cancelled").length)} সক্রিয়</small></div><div class="chev">›</div></div>
      <div class="dash-navrow" data-action="nav:onlineOrders"><div class="ic" style="background:var(--moss-deep);">${Icon.truck}</div><div class="body"><b>অনলাইন অর্ডার</b><small>${(() => { const n = S.onlineOrders.filter(o => o.status === "new").length; return n ? `${formatQty(n)} টি নতুন` : "কোনো নতুন নেই"; })()}</small></div>${S.onlineOrders.filter(o => o.status === "new").length ? `<span class="oo-new-dot"></span>` : ""}<div class="chev">›</div></div>
      <div class="dash-navrow" data-action="nav:production"><div class="ic" style="background:var(--ochre);">${Icon.factory}</div><div class="body"><b>উৎপাদন তালিকা</b><small>${formatQty(S.production.length)} এন্ট্রি</small></div><div class="chev">›</div></div>
      <div class="dash-navrow" data-action="nav:stock"><div class="ic" style="background:var(--moss);">${Icon.box}</div><div class="body"><b>স্টক</b><small>বর্তমান স্টক দেখুন</small></div><div class="chev">›</div></div>
      <div class="dash-navrow" data-action="nav:customers"><div class="ic" style="background:var(--terracotta-deep);">${Icon.people}</div><div class="body"><b>কাস্টমার খাতা</b><small>${formatQty(S.customers.filter(c => c.totalDue > 0).length)} জন বাকিতে</small></div><div class="chev">›</div></div>
      <div class="dash-navrow" data-action="nav:attendance"><div class="ic" style="background:var(--ink);">${Icon.calendarCheck}</div><div class="body"><b>হাজিরা</b><small>${formatQty(presentToday)}/${formatQty(totalEmployees)} উপস্থিত</small></div><div class="chev">›</div></div>
      <div class="dash-navrow" data-action="nav:feedback"><div class="ic" style="background:var(--terracotta-deep);">${Icon.message}</div><div class="body"><b>ফিডব্যাক</b><small>${unreadFeedback ? `${formatQty(unreadFeedback)} টি নতুন` : "সব পড়া হয়েছে"}</small></div><div class="chev">›</div></div>
    </div>

    <div class="section-title"><h2>সাম্প্রতিক বিক্রি</h2><span class="link" data-action="nav:sales">সব দেখুন</span></div>
    <div class="row-list">
      ${S.sales.slice(0, 5).map(saleRow).join("") || emptyState("এখনো কোনো বিক্রি হয়নি")}
    </div>`;
}

/* ================= sales ================= */
function saleRow(s) {
  return `<div class="paver row-item" data-action="view-memo" data-id="${s.id}">
    <div class="r-icon">${Icon.sale}</div>
    <div class="r-body">
      <div class="r-title">${escapeHtml(s.items.map(i => variantLabel(i.tileTypeName, i.quality, i.color)).join(", "))}</div>
      <div class="r-sub">${s.location === "factory" ? "ফ্যাক্টরি" : "গোডাউন"} · ${escapeHtml(s.managerName || "")} · <span class="badge ${s.paymentType}">${s.paymentType === "cash" ? "নগদ" : "বাকি"}</span></div>
    </div>
    <div class="r-end">
      <div class="r-amount">${formatMoney(s.total)}</div>
      <div class="r-time">${formatDateTimeBN(toDate(s.date || s.createdAt))}</div>
    </div>
    <button class="icon-btn" data-action="delete-sale" data-id="${s.id}" style="margin-inline-start:6px; flex-shrink:0;">${Icon.trash}</button>
  </div>`;
}
/* ================= sale entry (owner) ================= */
function cartTotal() { return VS.cart.reduce((a, it) => a + it.quantity * it.unitPrice, 0); }
function cartSignature(cart, location, payType, custKey) {
  const items = cart.map(it => `${it.variantId}:${it.quantity}:${it.unitPrice}`).sort().join("|");
  return `${items}#${location}#${payType}#${custKey || ""}`;
}
function cartLineHtml(it, i) {
  return `<div class="cart-line">
    <div style="flex:1;"><div class="cl-name">${escapeHtml(variantLabel(it.tileTypeName, it.quality, it.color))}</div><div class="cl-meta">${formatQty(it.quantity)} × ${formatMoney(it.unitPrice)}</div></div>
    <div class="cl-total">${formatMoney(it.quantity * it.unitPrice)}</div>
    <span class="cl-del" data-action="cart-remove" data-id="${i}">${Icon.trash}</span>
  </div>`;
}
function bakiCustomerBlock() {
  if (VS.selectedCustomer) {
    return `<div class="paver" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
      <div><b>${escapeHtml(VS.selectedCustomer.name)}</b><div class="muted">${escapeHtml(VS.selectedCustomer.phone || "")}</div></div>
      <button class="icon-btn" data-action="clear-customer">${Icon.close}</button>
    </div>`;
  }
  return `
    <div class="field">
      <label>কাস্টমারের নাম (খুঁজুন বা নতুন লিখুন)</label>
      <input id="custQueryInput" placeholder="নাম লিখুন..." autocomplete="off">
      <div id="custResultsWrap"></div>
    </div>
    <div class="field"><label>ফোন (ঐচ্ছিক, নতুন কাস্টমার হলে)</label><input id="custPhoneInput"></div>`;
}
function renderSaleEntry() {
  return `
    ${backHeader("বিক্রি এন্ট্রি", "sales")}
    <div class="field">
      <label>স্থান</label>
      <div class="chip-select">
        <span class="chip ${VS.saleLoc === "factory" ? "active" : ""}" data-action="sale-set-loc" data-id="factory">ফ্যাক্টরি</span>
        <span class="chip ${VS.saleLoc === "godown" ? "active" : ""}" data-action="sale-set-loc" data-id="godown">গোডাউন</span>
      </div>
    </div>
    <div class="field">
      <label>পেমেন্ট</label>
      <div class="seg">
        <button type="button" class="${VS.salePay === "cash" ? "active" : ""}" data-action="sale-set-pay" data-id="cash">নগদ</button>
        <button type="button" class="${VS.salePay === "baki" ? "active" : ""}" data-action="sale-set-pay" data-id="baki">বাকি</button>
      </div>
    </div>
    ${VS.salePay === "baki" ? bakiCustomerBlock() : ""}
    <div class="divider"></div>
    <div class="paver" style="margin-bottom:16px;">
      ${variantSelectorHtml("line")}
      <div style="display:flex; gap:8px; margin-top:10px;">
        <div class="field" style="flex:1; margin:0;"><label>পরিমাণ</label><input type="number" id="lineQty" min="1" placeholder="০"></div>
        <div class="field" style="flex:1; margin:0;"><label>দর/পিস (৳)</label><input type="number" id="linePrice" min="0" placeholder="০"></div>
      </div>
      <button class="btn btn-dark btn-sm" data-action="cart-add" style="margin-top:12px;">${Icon.plus} কার্টে যোগ করুন</button>
    </div>
    <div class="section-title" style="margin-top:0;"><h2>কার্ট</h2></div>
    <div class="paver">${VS.cart.length ? VS.cart.map(cartLineHtml).join("") : `<p class="muted center" style="padding:10px 0;">এখনো কিছু যোগ করা হয়নি</p>`}</div>
    ${VS.cart.length ? `<div class="total-strip"><span>সর্বমোট</span><b>${formatMoney(cartTotal())}</b></div>` : ""}
    <button class="btn btn-primary" data-action="submit-sale" ${(!VS.cart.length || VS.saleSubmitting) ? "disabled" : ""}>${VS.saleSubmitting ? `<span class="spinner"></span>` : "বিক্রি সম্পন্ন করুন"}</button>`;
}

function renderSales() {
  const list = S.sales.filter(s =>
    (VS.salesFilter.loc === "all" || s.location === VS.salesFilter.loc) &&
    (VS.salesFilter.pay === "all" || s.paymentType === VS.salesFilter.pay)
  );
  return `
    ${simpleHeader("বিক্রয় তালিকা")}
    <button class="btn btn-primary" data-action="nav:saleEntry" style="width:100%; margin-bottom:16px;">${Icon.plus} নতুন বিক্রি এন্ট্রি</button>
    <div class="sales-filter-block">
      <span class="sales-filter-label">স্থান</span>
      <div class="seg">
        ${["all", "factory", "godown"].map(v => `<button type="button" class="${VS.salesFilter.loc === v ? "active" : ""}" data-action="filter-loc" data-id="${v}">${v === "all" ? "সব" : v === "factory" ? "ফ্যাক্টরি" : "গোডাউন"}</button>`).join("")}
      </div>
    </div>
    <div class="sales-filter-block" style="margin-bottom:18px;">
      <span class="sales-filter-label">পেমেন্ট</span>
      <div class="seg">
        ${["all", "cash", "baki"].map(v => `<button type="button" class="${VS.salesFilter.pay === v ? "active" : ""}" data-action="filter-pay" data-id="${v}">${v === "all" ? "সব" : v === "cash" ? "নগদ" : "বাকি"}</button>`).join("")}
    </div>
    <div class="row-list">${list.map(saleRow).join("") || emptyState("কোনো বিক্রি পাওয়া যায়নি")}</div>`;
}

/* ================= production ================= */
function prodRow(p) {
  return `<div class="paver row-item" style="cursor:default;">
    <div class="r-icon">${Icon.factory}</div>
    <div class="r-body">
      <div class="r-title">${escapeHtml(p.tileTypeName)}</div>
      <div class="r-sub">${escapeHtml(p.managerName || "")}</div>
    </div>
    <div class="r-end">
      <div class="r-amount">${formatQty(p.quantity)} পিস</div>
      <div class="r-time">${formatDateTimeBN(toDate(p.date || p.createdAt))}</div>
    </div>
    <button class="icon-btn" data-action="delete-production" data-id="${p.id}" style="margin-inline-start:6px; flex-shrink:0;">${Icon.trash}</button>
  </div>`;
}
function renderProduction() {
  return `${backHeader("উৎপাদন তালিকা", "dashboard")}
    <div class="row-list">${S.production.map(prodRow).join("") || emptyState("এখনো কোনো উৎপাদন এন্ট্রি নেই")}</div>`;
}

/* ================= stock ================= */
function stockGroups() {
  const byDesign = {};
  S.variants.forEach(v => {
    if (!byDesign[v.tileTypeId]) byDesign[v.tileTypeId] = { name: v.tileTypeName, variants: [] };
    byDesign[v.tileTypeId].variants.push({ ...v, factory: stockAt(v.id, "factory"), godown: stockAt(v.id, "godown") });
  });
  return Object.entries(byDesign).map(([tid, g]) => {
    const design = S.tileTypes.find(t => t.id === tid);
    const total = g.variants.reduce((a, v) => a + v.factory + v.godown, 0);
    return { id: tid, name: g.name, imageUrl: design ? design.imageUrl : "", variants: g.variants, total };
  });
}
function buildStockCardsHtml() {
  const groups = stockGroups();
  const term = VS.stockSearch.trim().toLowerCase();
  const filtered = term ? groups.filter(g => g.name.toLowerCase().includes(term)) : groups;
  return filtered.map(g => `
      <div class="stock-card" data-design="${g.id}" ${g.variants.length > 1 ? `data-action="toggle-stock-card" data-id="${g.id}"` : ""}>
        <div class="stock-card-banner ${g.imageUrl ? "" : thumbVariantClass(g.id)}" ${g.imageUrl ? `style="background-image:url('${escapeHtml(g.imageUrl.replace(/'/g, "%27"))}')"` : ""}>
          <div class="stock-card-overlay-row">
            <b class="stock-card-name">${escapeHtml(g.name)}</b>
            <span class="stock-total-badge">${formatQty(g.total)} পিস</span>
          </div>
        </div>
        ${g.variants.length > 1 ? `
        <div class="stock-expand-strip"><span class="stock-chevron-badge"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg></span></div>
        <div class="stock-card-details">
          <div class="stock-detail-inner">
            ${g.variants.map(v => `
              <div class="stock-detail-row">
                <span class="vswatch-dot" style="${colorSwatchStyle(v.color)}"></span>
                <span class="stock-detail-name">${escapeHtml(variantDisplayLabel(v))}</span>
                <span class="stock-detail-nums">ফ্যাক্টরি ${formatQty(v.factory)} · গোডাউন ${formatQty(v.godown)}</span>
              </div>`).join("")}
          </div>
        </div>` : ""}
      </div>`).join("") || emptyState(term ? `"${escapeHtml(VS.stockSearch)}" এর সাথে মিলে এমন কিছু পাওয়া যায়নি` : "কোনো টাইলসের ধরন যোগ করা হয়নি", term ? "" : "সেটিংস থেকে যোগ করুন");
}
function renderStock() {
  return `${simpleHeader("বর্তমান স্টক")}
    <button class="btn btn-dark" data-action="open-transfer" style="margin-bottom:12px;">${Icon.transfer} স্টক ট্রান্সফার</button>
    <div class="vp-search" style="margin-bottom:16px;"><input type="text" id="stockSearchInput" value="${escapeHtml(VS.stockSearch)}" placeholder="টাইলসের নাম খুঁজুন..." autocomplete="off"></div>
    <div id="stockCardsWrap">${buildStockCardsHtml()}</div>`;
}

/* ================= customers ================= */
function customerRow(c) {
  const due = c.totalDue || 0;
  return `<div class="paver row-item" data-action="nav:customerLedger" data-id="${c.id}">
    <div class="r-icon">${Icon.people}</div>
    <div class="r-body">
      <div class="r-title">${escapeHtml(c.name)}</div>
      <div class="r-sub">${escapeHtml(c.phone || "")}</div>
    </div>
    <div class="r-end">
      <span class="badge ${due > 0 ? "due" : "paid"}">${due > 0 ? formatMoney(due) + " বাকি" : "পরিশোধিত"}</span>
    </div>
  </div>`;
}
function buildCustomerListHtml() {
  const t = VS.customerSearch.trim().toLowerCase();
  const list = S.customers.filter(c => !t || (c.name || "").toLowerCase().includes(t) || (c.phone || "").includes(t));
  return list.map(customerRow).join("") || emptyState("কোনো কাস্টমার পাওয়া যায়নি");
}
function renderCustomers() {
  return `${simpleHeader("কাস্টমার খাতা (বাকি)")}
    <div style="display:flex; gap:8px; margin-bottom:14px;">
      <input id="custSearchInput" placeholder="নাম বা ফোন দিয়ে খুঁজুন" value="${escapeHtml(VS.customerSearch)}"
        style="flex:1; height:44px; border-radius:10px; border:1.5px solid var(--line); background:var(--card); padding:0 13px;">
      <button class="btn btn-dark btn-auto" data-action="open-add-customer">${Icon.plus}</button>
    </div>
    <div class="row-list" id="custListWrap">${buildCustomerListHtml()}</div>`;
}

/* ================= customer ledger ================= */
function renderCustomerLedger() {
  const c = S.customers.find(x => x.id === VS.ledgerCustomerId);
  if (!c) return `${backHeader("কাস্টমার", "customers")}${emptyState("কাস্টমার পাওয়া যায়নি")}`;
  const due = c.totalDue || 0;
  return `${backHeader(c.name, "customers")}
    <div class="paver" style="margin-bottom:16px;">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <div>
          <div style="font-weight:700; font-size:15px;">${escapeHtml(c.name)}</div>
          <div class="muted">${escapeHtml(c.phone || "ফোন নেই")}</div>
        </div>
        <span class="badge ${due > 0 ? "due" : "paid"}" style="font-size:13px; padding:6px 12px;">${due > 0 ? formatMoney(due) + " বাকি" : "পরিশোধিত"}</span>
      </div>
      ${due > 0 ? `<button class="btn btn-success btn-sm" data-action="open-payment" data-id="${c.id}" style="margin-top:14px;">পেমেন্ট জমা নিন</button>` : ""}
    </div>
    <div class="section-title"><h2>লেনদেনের হিস্টোরি</h2></div>
    <div class="row-list">
      ${VS.ledgerLoading ? `<div class="center" style="padding:30px;"><span class="spinner" style="border-top-color:var(--terracotta); border-color:rgba(191,91,50,.25);"></span></div>` :
        (VS.ledgerData.map(item => `
          <div class="paver row-item" style="cursor:default;">
            <div class="r-icon" style="background:${item.kind === "sale" ? "var(--danger-tint)" : "var(--moss-tint)"}; color:${item.kind === "sale" ? "var(--danger)" : "var(--moss)"};">${item.kind === "sale" ? Icon.sale : Icon.wallet}</div>
            <div class="r-body">
              <div class="r-title">${item.kind === "sale" ? "বিক্রি (বাকিতে)" : "পেমেন্ট জমা"}</div>
              <div class="r-sub">${formatDateTimeBN(toDate(item.createdAt))}${item.kind === "payment" && item.managerName ? " · " + escapeHtml(item.managerName) : ""}</div>
            </div>
            <div class="r-end"><div class="r-amount" style="color:${item.kind === "sale" ? "var(--danger)" : "var(--moss)"};">${item.kind === "sale" ? "+" : "−"}${formatMoney(item.kind === "sale" ? item.total : item.amount)}</div></div>
          </div>`).join("") || emptyState("কোনো লেনদেন নেই"))}
    </div>`;
}

/* ================= staff ================= */
function renderStaff() {
  return `${backHeader("কর্মচারী ও ম্যানেজার", "more")}
    <div class="seg" style="margin-bottom:16px;">
      <button class="${VS.staffTab === "employees" ? "active" : ""}" data-action="staff-tab" data-id="employees">শ্রমিক</button>
      <button class="${VS.staffTab === "managers" ? "active" : ""}" data-action="staff-tab" data-id="managers">ম্যানেজার</button>
    </div>
    ${VS.staffTab === "employees" ? renderEmployeesTab() : renderManagersTab()}`;
}
function renderEmployeesTab() {
  return `
    <button class="btn btn-dark" data-action="open-add-employee" style="margin-bottom:14px;">${Icon.plus} নতুন শ্রমিক</button>
    <div class="row-list">
      ${S.employees.map(e => `
        <div class="paver row-item" style="cursor:default;">
          <div class="r-icon">${Icon.badge}</div>
          <div class="r-body">
            <div class="r-title">${escapeHtml(e.name)}${e.active === false ? ' <span class="badge due">নিষ্ক্রিয়</span>' : ""}</div>
            <div class="r-sub">${escapeHtml(e.phone || "")} · মাসিক ${formatMoney(e.monthlySalary)}</div>
          </div>
          <button class="icon-btn" data-action="edit-employee" data-id="${e.id}">${Icon.edit}</button>
          <button class="icon-btn" data-action="toggle-employee" data-id="${e.id}" style="margin-inline-start:6px;">${e.active === false ? Icon.check : Icon.close}</button>
        </div>`).join("") || emptyState("এখনো কোনো শ্রমিক যোগ হয়নি")}
    </div>`;
}
function renderManagersTab() {
  return `
    <button class="btn btn-dark" data-action="open-add-manager" style="margin-bottom:14px;">${Icon.plus} নতুন ম্যানেজার</button>
    <div class="row-list">
      ${S.managers.map(m => `
        <div class="paver row-item" style="cursor:default;">
          <div class="r-icon">${Icon.people}</div>
          <div class="r-body">
            <div class="r-title">${escapeHtml(m.name)}${m.active === false ? ' <span class="badge due">নিষ্ক্রিয়</span>' : ""}</div>
            <div class="r-sub">${escapeHtml(m.email || "")} ${m.phone ? "· " + escapeHtml(m.phone) : ""} · বেতন ${formatMoney(m.monthlySalary || 0)}</div>
          </div>
          <button class="icon-btn" data-action="edit-manager" data-id="${m.id}">${Icon.edit}</button>
          <button class="icon-btn" data-action="toggle-manager" data-id="${m.id}" style="margin-inline-start:6px;">${m.active === false ? Icon.check : Icon.close}</button>
        </div>`).join("") || emptyState("এখনো কোনো ম্যানেজার যোগ হয়নি")}
    </div>`;
}

/* ================= attendance ================= */
function renderAttendance() {
  const list = VS.attendanceDate === ymd() ? S.attendanceToday : VS.attendanceDateData;
  const present = list.filter(a => a.status === "present").length;
  const absent = list.filter(a => a.status === "absent").length;
  const leave = list.filter(a => a.status === "leave").length;
  const markedIds = new Set(list.map(a => a.employeeId));
  const missing = S.employees.filter(e => e.active !== false && !markedIds.has(e.id));
  const badgeText = { present: "উপস্থিত", absent: "অনুপস্থিত", leave: "ছুটি" };
  return `${backHeader("হাজিরা", "dashboard")}
    <input type="date" id="attDateInput" value="${VS.attendanceDate}" style="width:100%; height:44px; border-radius:10px; border:1.5px solid var(--line); background:var(--card); padding:0 13px; margin-bottom:14px;">
    <p class="muted" style="margin-bottom:14px;">উপস্থিত ${present} · অনুপস্থিত ${absent} · ছুটি ${leave}</p>
    <div class="row-list">
      ${list.map(a => `
        <div class="paver row-item" style="cursor:default;">
          <div class="r-icon">${Icon.calendarCheck}</div>
          <div class="r-body"><div class="r-title">${escapeHtml(a.employeeName)}</div></div>
          <span class="badge ${a.status}">${badgeText[a.status] || a.status}</span>
          <button class="icon-btn" data-action="delete-attendance" data-id="${a.id}" style="margin-inline-start:6px;">${Icon.trash}</button>
        </div>`).join("")}
      ${missing.map(e => `
        <div class="paver row-item" style="cursor:default; opacity:.6;">
          <div class="r-icon">${Icon.badge}</div>
          <div class="r-body"><div class="r-title">${escapeHtml(e.name)}</div></div>
          <span class="badge">এন্ট্রি নেই</span>
        </div>`).join("")}
      ${(!list.length && !missing.length) ? emptyState("কোনো শ্রমিক নেই") : ""}
    </div>`;
}

/* ================= salary ================= */
function renderSalary() {
  const total = S.salaries.reduce((a, s) => a + (s.amount || 0), 0);
  const paid = S.salaries.filter(s => s.paid).reduce((a, s) => a + (s.amount || 0), 0);
  const totalAdvance = S.advances.reduce((a, adv) => a + (adv.amount || 0), 0);
  return `${backHeader("বেতন", "more")}
    <input type="month" id="salaryMonthInput" value="${VS.salaryMonth}" style="width:100%; height:44px; border-radius:10px; border:1.5px solid var(--line); background:var(--card); padding:0 13px; margin-bottom:14px;">
    <div class="stat-row" style="margin-bottom:14px;">
      <div class="paver stat-card"><div class="s-label">মোট বেতন</div><div class="s-value">${formatMoney(total)}</div></div>
      <div class="paver stat-card"><div class="s-label">পরিশোধিত</div><div class="s-value">${formatMoney(paid)}</div></div>
      <div class="paver stat-card"><div class="s-label">বকেয়া</div><div class="s-value">${formatMoney(total - paid)}</div></div>
      <div class="paver stat-card"><div class="s-label">মোট অগ্রিম</div><div class="s-value">${formatMoney(totalAdvance)}</div></div>
    </div>
    <div class="btn-block-row" style="margin-bottom:16px;">
      <button class="btn btn-dark" data-action="generate-salaries">এই মাসের বেতন তৈরি করুন</button>
      <button class="btn btn-ghost" data-action="download-salary-sheet">${Icon.wallet} সম্পূর্ণ শীট</button>
    </div>

    <div class="section-title" style="margin-top:0;"><h2>বেতন তালিকা</h2></div>
    <div class="row-list" style="margin-bottom:20px;">
      ${S.salaries.map(s => `
        <div class="paver row-item" style="cursor:default; align-items:flex-start;">
          <div class="r-icon">${Icon.wallet}</div>
          <div class="r-body">
            <div class="r-title">${escapeHtml(s.employeeName)} <span class="badge ${s.paid ? "paid" : "due"}">${s.paid ? "পরিশোধিত" : "বকেয়া"}</span></div>
            <div class="r-sub" style="margin-top:3px;">মূল ${formatMoney(s.baseAmount != null ? s.baseAmount : s.amount)}${s.advanceAmount ? ` · অগ্রিম -${formatMoney(s.advanceAmount)}` : ""} · প্রদেয় <b>${formatMoney(s.amount)}</b></div>
            <div class="btn-block-row" style="margin-top:10px;">
              <button class="icon-btn" data-action="edit-salary" data-id="${s.id}">${Icon.edit}</button>
              <button class="icon-btn" data-action="download-payslip" data-id="${s.id}">${Icon.clipboard}</button>
              <button class="btn btn-sm ${s.paid ? "btn-ghost" : "btn-success"} btn-auto" data-action="toggle-salary" data-id="${s.id}">${s.paid ? "বকেয়া করুন" : "পরিশোধিত"}</button>
            </div>
          </div>
        </div>`).join("") || emptyState("এই মাসের বেতন তৈরি হয়নি", "উপরের বাটনে চাপুন")}
    </div>

    <div class="section-title" style="margin-top:0;"><h2>অগ্রিম বেতন</h2><span class="link" data-action="open-advance-form">+ নতুন</span></div>
    <div class="row-list">
      ${S.advances.map(a => `
        <div class="paver row-item" style="cursor:default;">
          <div class="r-icon">${Icon.wallet}</div>
          <div class="r-body">
            <div class="r-title">${escapeHtml(a.employeeName)}</div>
            <div class="r-sub">${formatDateBN(new Date(a.date))}${a.note ? " · " + escapeHtml(a.note) : ""}</div>
          </div>
          <div class="r-end"><div class="r-amount">${formatMoney(a.amount)}</div></div>
          <button class="icon-btn" data-action="delete-advance" data-id="${a.id}" style="margin-inline-start:6px; flex-shrink:0;">${Icon.trash}</button>
        </div>`).join("") || emptyState("এই মাসে কোনো অগ্রিম নেওয়া হয়নি")}
    </div>`;
}

/* ================= feedback ================= */
function renderFeedback() {
  return `${backHeader("ফিডব্যাক", "dashboard")}
    <div class="row-list">
      ${S.feedback.map(f => `
        <div class="paver row-item" data-action="mark-feedback-read" data-id="${f.id}" style="align-items:flex-start;">
          <div class="r-icon">${Icon.message}</div>
          <div class="r-body">
            <div class="r-title">${escapeHtml(f.managerName || "")} ${!f.read ? '<span class="badge due">নতুন</span>' : ""}</div>
            <div class="r-sub" style="margin-top:4px; line-height:1.6;">${escapeHtml(f.message)}</div>
            <div class="r-time" style="margin-top:6px;">${formatDateTimeBN(toDate(f.createdAt))}</div>
          </div>
        </div>`).join("") || emptyState("এখনো কোনো ফিডব্যাক আসেনি")}
    </div>`;
}

/* ================= notifications (manager actions) ================= */
function notifMeta(n) {
  const loc = (l) => l === "factory" ? "ফ্যাক্টরি" : "গোডাউন";
  if (n.type === "sale") {
    return {
      icon: Icon.sale, cls: "notif-sale",
      title: `${n.managerName || "একজন ম্যানেজার"} বিক্রি করেছেন`,
      detail: `${formatMoney(n.total || 0)} · ${loc(n.location)} · ${formatQty(n.itemCount || 0)} আইটেম`
    };
  }
  if (n.type === "production") {
    return {
      icon: Icon.factory, cls: "notif-production",
      title: `${n.managerName || "একজন ম্যানেজার"} উৎপাদন যোগ করেছেন`,
      detail: `${escapeHtml(n.tileTypeName || "")} · ${formatQty(n.quantity || 0)} পিস`
    };
  }
  if (n.type === "stock") {
    return {
      icon: Icon.transfer, cls: "notif-stock",
      title: `${n.managerName || "একজন ম্যানেজার"} স্টক ট্রান্সফার করেছেন`,
      detail: `${escapeHtml(n.tileTypeName || "")} · ${formatQty(n.qty || 0)} পিস · ${loc(n.fromLocation)} → ${loc(n.toLocation)}`
    };
  }
  if (n.type === "order") {
    return {
      icon: Icon.clipboard, cls: "notif-stock",
      title: `${n.managerName || "একজন ম্যানেজার"} নতুন অর্ডার নিয়েছেন`,
      detail: `${escapeHtml(n.customerName || "")} · ${formatQty(n.itemCount || 0)} আইটেম`
    };
  }
  if (n.type === "salary") {
    return {
      icon: Icon.wallet, cls: "notif-production",
      title: `${n.managerName || "একজন ম্যানেজার"} বেতন তালিকা তৈরি করেছেন`,
      detail: `${n.month || ""} · ${formatQty(n.count || 0)} জন কর্মচারী`
    };
  }
  if (n.type === "onlineOrder") {
    return {
      icon: Icon.truck, cls: "notif-stock",
      title: `নতুন অনলাইন অর্ডার এসেছে`,
      detail: `${escapeHtml(n.customerName || "")} · ${formatQty(n.itemCount || 0)} আইটেম`
    };
  }
  if (n.type === "advance") {
    return {
      icon: Icon.wallet, cls: "notif-stock",
      title: `${n.managerName || "একজন ম্যানেজার"} অগ্রিম বেতন দিয়েছেন`,
      detail: `${escapeHtml(n.employeeName || "")} · ${formatMoney(n.amount || 0)}`
    };
  }
  if (n.type === "attendance") {
    return {
      icon: Icon.calendarCheck, cls: "notif-production",
      title: `${n.managerName || "একজন ম্যানেজার"} হাজিরা জমা দিয়েছেন`,
      detail: `${n.date ? formatDateBN(new Date(n.date)) + " · " : ""}উপস্থিত ${formatQty(n.present || 0)} · অনুপস্থিত ${formatQty(n.absent || 0)} · ছুটি ${formatQty(n.leave || 0)}`
    };
  }
  return { icon: Icon.alert, cls: "", title: n.managerName || "", detail: "" };
}
function notifRowHtml(n) {
  const m = notifMeta(n);
  return `
    <div class="paver row-item" data-action="mark-notif-read" data-id="${n.id}" style="align-items:flex-start;">
      <div class="r-icon ${m.cls}">${m.icon}</div>
      <div class="r-body">
        <div class="r-title">${m.title} ${!n.read ? '<span class="badge due">নতুন</span>' : ""}</div>
        <div class="r-sub" style="margin-top:4px;">${m.detail}</div>
        <div class="r-time" style="margin-top:6px;">${formatDateTimeBN(toDate(n.createdAt))}</div>
      </div>
    </div>`;
}
function renderNotifBody() {
  const hasUnread = S.notifications.some(n => !n.read);
  return `
    ${hasUnread ? `<div style="text-align:right; margin-bottom:12px;"><span class="link" data-action="mark-all-notif">সব পড়া হয়েছে</span></div>` : ""}
    <div class="row-list">${S.notifications.map(notifRowHtml).join("") || emptyState("কোনো নোটিফিকেশন নেই", "ম্যানেজাররা কিছু করলে এখানে দেখাবে")}</div>`;
}
function updateNotifBadge() {
  const dot = document.getElementById("notifBadge");
  if (!dot) return;
  const n = S.notifications.filter(x => !x.read).length;
  dot.textContent = n > 9 ? "৯+" : n ? toBnDigits(n) : "";
  dot.style.display = n ? "flex" : "none";
  if (n > lastUnreadNotifCount) { dot.classList.remove("pop"); void dot.offsetWidth; dot.classList.add("pop"); }
  lastUnreadNotifCount = n;
}
function refreshNotifSheetIfOpen() {
  if (notifSheetBodyEl && document.body.contains(notifSheetBodyEl)) {
    notifSheetBodyEl.innerHTML = renderNotifBody();
  } else {
    notifSheetBodyEl = null;
  }
}
function openNotificationsSheet() {
  const { overlay } = sheet({ title: "নোটিফিকেশন", bodyHtml: `<div id="notifSheetBody">${renderNotifBody()}</div>` });
  notifSheetBodyEl = overlay.querySelector("#notifSheetBody");
  overlay.addEventListener("click", (e) => {
    const t = e.target.closest("[data-action]");
    if (!t) return;
    Promise.resolve(handleAction(t.dataset.action, t.dataset.id)).catch((err) => {
      console.error(err);
      showToast("কিছু একটা সমস্যা হয়েছে, আবার চেষ্টা করুন", "error");
    });
  });
}

/* ================= reports ================= */
function renderReports() {
  const inRange = (d) => d >= VS.reportStart && d <= VS.reportEnd;
  const salesR = S.sales.filter(s => inRange(ymd(toDate(s.date || s.createdAt))));
  const prodR = S.production.filter(p => inRange(ymd(toDate(p.date || p.createdAt))));
  const totalTaka = salesR.reduce((a, s) => a + (s.total || 0), 0);
  const totalQty = salesR.reduce((a, s) => a + s.items.reduce((x, i) => x + i.quantity, 0), 0);
  const totalProd = prodR.reduce((a, p) => a + (p.quantity || 0), 0);
  const cash = salesR.filter(s => s.paymentType === "cash").reduce((a, s) => a + s.total, 0);
  const baki = salesR.filter(s => s.paymentType === "baki").reduce((a, s) => a + s.total, 0);
  const byType = {};
  salesR.forEach(s => s.items.forEach(i => {
    byType[i.tileTypeName] = (byType[i.tileTypeName] || 0) + i.quantity;
  }));
  const maxQty = Math.max(1, ...Object.values(byType));

  return `${backHeader("রিপোর্ট", "more")}
    <div style="display:flex; gap:8px; margin-bottom:16px;">
      <div class="field" style="margin:0; flex:1;"><label>শুরু</label><input type="date" id="repStart" value="${VS.reportStart}"></div>
      <div class="field" style="margin:0; flex:1;"><label>শেষ</label><input type="date" id="repEnd" value="${VS.reportEnd}"></div>
    </div>
    <div class="stat-row" style="margin-bottom:18px;">
      <div class="paver stat-card accent"><div class="s-label">মোট বিক্রি</div><div class="s-value">${formatMoney(totalTaka)}</div></div>
      <div class="paver stat-card"><div class="s-label">বিক্রিত টাইলস</div><div class="s-value">${formatQty(totalQty)}</div></div>
      <div class="paver stat-card"><div class="s-label">উৎপাদন</div><div class="s-value">${formatQty(totalProd)}</div></div>
    </div>
    <div class="paver" style="margin-bottom:16px;">
      <div style="display:flex; justify-content:space-between; font-size:12.5px; margin-bottom:6px;"><span>নগদ ${formatMoney(cash)}</span><span>বাকি ${formatMoney(baki)}</span></div>
      <div class="pt-report-bar"><div style="width:${totalTaka ? (cash / totalTaka * 100) : 0}%;"></div></div>
    </div>
    <div class="section-title"><h2>টাইলসের ধরন অনুযায়ী বিক্রি</h2></div>
    <div class="row-list">
      ${Object.entries(byType).sort((a, b) => b[1] - a[1]).map(([name, qty]) => `
        <div class="paver" style="padding:12px 14px;">
          <div style="display:flex; justify-content:space-between; font-size:13px; font-weight:600; margin-bottom:6px;"><span>${escapeHtml(name)}</span><span>${formatQty(qty)}</span></div>
          <div class="pt-report-bar"><div style="width:${(qty / maxQty * 100)}%;"></div></div>
        </div>`).join("") || emptyState("এই সময়ে কোনো বিক্রি নেই")}
    </div>`;
}

/* ================= settings ================= */
function renderSettings() {
  const info = S.shopInfo || {};
  return `${backHeader("সেটিংস", "more")}
    <div class="section-title" style="margin-top:0;"><h2>দোকানের তথ্য</h2></div>
    <form id="shopForm">
      <div class="field"><label>দোকানের নাম</label><input name="name" value="${escapeHtml(info.name || "4B PAVEMENT TILES")}"></div>
      <div class="field"><label>ঠিকানা</label><input name="address" value="${escapeHtml(info.address || "")}"></div>
      <div class="field" style="margin-bottom:0;"><label>ফোন নম্বর</label><input name="phone" value="${escapeHtml(info.phone || "")}"></div>
      <button type="submit" class="btn btn-primary" style="margin-top:16px;">সংরক্ষণ করুন</button>
    </form>
    <div class="divider"></div>
    <div class="section-title" style="margin-top:0;"><h2>টাইলসের ধরন</h2></div>
    <form id="tileTypeForm">
      <div class="field"><label>টাইলসের ডিজাইনের নাম</label><input name="name" placeholder="যেমনঃ 8Bit" required></div>
      <div class="field">
        <label>সাইজ (ইঞ্চি চিহ্নসহ)</label>
        <div class="chip-select" id="sizeChipRow" style="margin-bottom:8px;">
          <span class="chip" data-size="12″×12″">12″×12″</span>
          <span class="chip" data-size="8″×24″">8″×24″</span>
          <span class="chip" data-size="4″×8″">4″×8″</span>
        </div>
        <input name="size" id="ttSizeInput" placeholder='নিজে লিখলে ইঞ্চি চিহ্ন (″) ব্যবহার করুন — যেমনঃ 10″×10″'>
      </div>
      <div class="field">
        <label>কোয়ালিটি</label>
        <select name="qualitySelect" id="ttQualitySelect">
          ${knownQualities().map(q => `<option value="${escapeHtml(q)}">${escapeHtml(q)}</option>`).join("")}
          <option value="__other__">+ নতুন কোয়ালিটি লিখুন</option>
        </select>
        <input name="qualityOther" id="ttQualityOther" placeholder="নতুন কোয়ালিটির নাম লিখুন" style="display:none; margin-top:8px;">
      </div>
      <button type="submit" class="btn btn-dark" style="width:100%;">${Icon.plus} টাইলস যোগ করুন</button>
    </form>
    <div class="divider"></div>
    <div class="chip-select">
      ${S.tileTypes.map(t => `<span class="chip">${escapeHtml(t.name)}${t.size ? ` <span class="muted" style="font-size:.85em;">(${escapeHtml(t.size)}${t.quality ? " · " + escapeHtml(t.quality) : ""})</span>` : ""} <span data-action="delete-tiletype" data-id="${t.id}" style="cursor:pointer; opacity:.6;">&times;</span></span>`).join("") || `<span class="muted">এখনো কোনো ধরন যোগ হয়নি</span>`}
    </div>`;
}

/* ================= shop management (owner-only online-shop control) ================= */
function renderShopManage() {
  const info = S.shopInfo || {};
  const bannerCount = S.tileTypes.filter(t => t.banner).length;
  return `${backHeader("শপ ম্যানেজমেন্ট", "more")}
    <a class="btn btn-ghost" href="index.html" target="_blank" style="display:block; text-align:center; text-decoration:none; margin-bottom:18px;">${Icon.truck} লাইভ দোকান দেখুন</a>

    <div class="section-title" style="margin-top:0;"><h2>যোগাযোগ ও পেমেন্ট</h2></div>
    <div class="paver" style="margin-bottom:20px; padding:14px;">
      <p class="muted" style="margin-bottom:10px; line-height:1.6;">WhatsApp নম্বরে কাস্টমাররা ভাসমান বাটনে ট্যাপ করে সরাসরি চ্যাট করতে পারবে। অ্যাডভান্স পেমেন্ট বেছে নিলে বিকাশ/নগদ/ব্যাংকের তথ্য দেখানো হবে।</p>
      <div style="display:flex; flex-direction:column; gap:8px;">
        <div class="pay-acc" style="cursor:default;"><b>WhatsApp</b><span>${info.whatsapp ? escapeHtml(info.whatsapp) : "ফোন নম্বর ব্যবহার হবে"}</span></div>
        <div class="pay-acc" style="cursor:default;"><b>বিকাশ</b><span>${info.bkash ? escapeHtml(info.bkash) : "যোগ করা হয়নি"}</span></div>
        <div class="pay-acc" style="cursor:default;"><b>নগদ</b><span>${info.nagad ? escapeHtml(info.nagad) : "যোগ করা হয়নি"}</span></div>
        <div class="pay-acc" style="cursor:default;"><b>ব্যাংক</b><span>${info.bank ? escapeHtml(info.bank) : "যোগ করা হয়নি"}</span></div>
      </div>
      <button class="btn btn-dark btn-sm" data-action="open-shop-payment-form" style="margin-top:12px;">${Icon.edit} সম্পাদনা করুন</button>
    </div>

    <div class="section-title" style="margin-top:0;"><h2>ব্যানার</h2></div>
    <div class="paver" style="margin-bottom:20px; padding:14px;">
      <p class="muted" style="margin-bottom:12px; line-height:1.6;">সর্বোচ্চ ৬টা পণ্য ব্যানারে ঘুরতে থাকবে — এখন ${formatQty(bannerCount)}টা বাছাই করা আছে।</p>
      <button class="btn btn-dark btn-sm" data-action="open-banner-manage">${Icon.plus} ব্যানার নির্বাচন করুন</button>
    </div>

    <div class="section-title" style="margin-top:0;"><h2>পণ্যসমূহ (${formatQty(S.tileTypes.length)})</h2></div>
    <div class="row-list">
      ${S.tileTypes.map(t => `
        <div class="paver row-item" data-action="edit-shop-product" data-id="${t.id}">
          <div class="r-icon" style="${t.imageUrl ? "background-size:cover; background-position:center;" : ""}" ${t.imageUrl ? `data-img="${escapeHtml(t.imageUrl)}"` : ""}>${t.imageUrl ? "" : Icon.box}</div>
          <div class="r-body">
            <div class="r-title">${escapeHtml(t.name)} ${t.banner ? `<span class="badge accepted">ব্যানারে</span>` : ""}</div>
            <div class="r-sub">${t.description ? escapeHtml(t.description) : `<span class="muted">বিবরণ যোগ করা হয়নি</span>`}${t.soldCount ? ` · বিক্রি ${formatQty(t.soldCount)} পিস` : ""}</div>
          </div>
        </div>`).join("") || emptyState("এখনো কোনো টাইলসের ধরন নেই", "সেটিংসে গিয়ে যোগ করুন")}
    </div>`;
}
// Dedicated banner picker — every product in one searchable list, checkbox
// toggles, capped at 6. Separate from each product's own edit sheet so the
// owner doesn't have to open 25 products one by one to manage the banner.
function openBannerManageSheet() {
  const { close, overlay } = sheet({
    title: "ব্যানার নির্বাচন করুন",
    bodyHtml: `
      <div class="vp-search" style="margin-bottom:12px;"><input type="text" id="bannerSearchInput" placeholder="টাইলসের নাম খুঁজুন..." autocomplete="off"></div>
      <p class="muted" style="margin-bottom:12px;">সর্বোচ্চ ৬টা পণ্য বাছাই করা যাবে।</p>
      <div class="row-list" id="bannerList"></div>`
  });
  const renderList = (term) => {
    const t2 = term.trim().toLowerCase();
    const list = t2 ? S.tileTypes.filter(t => t.name.toLowerCase().includes(t2)) : S.tileTypes;
    overlay.querySelector("#bannerList").innerHTML = list.map(t => `
      <div class="paver row-item" style="cursor:default; padding:11px;">
        <div class="r-icon" style="${t.imageUrl ? "background-size:cover; background-position:center;" : ""}" ${t.imageUrl ? `data-img="${escapeHtml(t.imageUrl)}"` : ""}>${t.imageUrl ? "" : Icon.box}</div>
        <div class="r-body"><div class="r-title">${escapeHtml(t.name)}</div></div>
        <label class="check-row" style="margin:0;">
          <input type="checkbox" data-banner-toggle="${t.id}" ${t.banner ? "checked" : ""}>
        </label>
      </div>`).join("") || `<p class="muted center" style="padding:14px 0;">কিছু পাওয়া যায়নি</p>`;
    overlay.querySelectorAll("[data-img]").forEach(el => { el.style.backgroundImage = `url('${el.dataset.img.replace(/'/g, "%27")}')`; });
  };
  renderList("");
  overlay.querySelector("#bannerSearchInput").addEventListener("input", (e) => renderList(e.target.value));
  overlay.querySelector("#bannerList").addEventListener("change", async (e) => {
    const cb = e.target.closest("[data-banner-toggle]");
    if (!cb) return;
    const currentCount = S.tileTypes.filter(t => t.banner).length;
    if (cb.checked && currentCount >= 6) {
      cb.checked = false;
      showToast("সর্বোচ্চ ৬টা পণ্য ব্যানারে রাখা যাবে", "error");
      return;
    }
    await updateTileType(cb.dataset.bannerToggle, { banner: cb.checked });
    showToast(cb.checked ? "ব্যানারে যোগ হয়েছে" : "ব্যানার থেকে সরানো হয়েছে", "success");
  });
}
function openShopPaymentSheet() {
  const info = S.shopInfo || {};
  formSheet({
    title: "যোগাযোগ ও পেমেন্ট",
    bodyHtml: `
      <div class="field"><label>WhatsApp নম্বর</label><input name="whatsapp" value="${escapeHtml(info.whatsapp || "")}" placeholder="ফাঁকা রাখলে ফোন নম্বর ব্যবহার হবে"></div>
      <div class="field"><label>বিকাশ নম্বর</label><input name="bkash" value="${escapeHtml(info.bkash || "")}" placeholder="01XXXXXXXXX"></div>
      <div class="field"><label>নগদ নম্বর</label><input name="nagad" value="${escapeHtml(info.nagad || "")}" placeholder="01XXXXXXXXX"></div>
      <div class="field" style="margin-bottom:0;"><label>ব্যাংক অ্যাকাউন্ট</label><input name="bank" value="${escapeHtml(info.bank || "")}" placeholder="ব্যাংকের নাম, অ্যাকাউন্ট নং, নাম"></div>`,
    submitText: "সংরক্ষণ করুন",
    onSubmit: async (data, close) => {
      await updateShopInfo({
        whatsapp: (data.whatsapp || "").trim(),
        bkash: (data.bkash || "").trim(), nagad: (data.nagad || "").trim(), bank: (data.bank || "").trim()
      });
      showToast("তথ্য সংরক্ষণ হয়েছে", "success"); close();
    }
  });
}
function openShopProductSheet(t) {
  const variants = variantsFor(t.id);
  const { close, overlay } = sheet({
    title: t.name,
    bodyHtml: `
      <div class="field"><label>কোয়ালিটি</label>
        <select id="spQuality">${knownQualities().map(q => `<option value="${escapeHtml(q)}" ${t.quality === q ? "selected" : ""}>${escapeHtml(q)}</option>`).join("")}</select>
      </div>
      <div class="field"><label>ছবির লিংক (postimages.org থেকে Direct Link)</label><input id="spImageUrl" value="${escapeHtml(t.imageUrl || "")}" placeholder="https://i.postimg.cc/..."></div>
      <div class="field" style="margin-bottom:0;"><label>ছোট বিবরণ</label><textarea id="spDescription" placeholder="যেমনঃ টেকসই ও পানিরোধী, উঠান বা ছাদের জন্য উপযুক্ত">${escapeHtml(t.description || "")}</textarea></div>
      <button class="btn btn-dark btn-sm" id="spSaveBtn" style="width:100%; margin-top:14px;">সংরক্ষণ করুন</button>
      <div class="divider"></div>
      <div class="section-title" style="margin-top:0;"><h2>কালার</h2><span class="link" data-action="add-variant" data-id="${t.id}">+ নতুন</span></div>
      <div>
        ${variants.map(v => `
          <div class="paver row-item" style="cursor:default; padding:11px;">
            <span class="vswatch-dot" style="${colorSwatchStyle(v.color)} margin-inline-end:11px;"></span>
            <div class="r-body"><div class="r-title" style="font-size:13px;">${escapeHtml(variantDisplayLabel(v))}</div>
              <div class="r-sub">ফ্যাক্টরি ${formatQty(stockAt(v.id, "factory"))} · গোডাউন ${formatQty(stockAt(v.id, "godown"))}${v.soldCount ? ` · বিক্রি ${formatQty(v.soldCount)}` : ""}</div>
            </div>
            <button class="icon-btn" data-action="edit-variant" data-id="${v.id}">${Icon.edit}</button>
            ${variants.length > 1 ? `<button class="icon-btn" data-action="delete-variant" data-id="${v.id}" style="margin-inline-start:4px;">${Icon.trash}</button>` : ""}
          </div>`).join("") || emptyState("কোনো কালার নেই")}
      </div>`
  });
  overlay.querySelector("#spSaveBtn").addEventListener("click", async () => {
    await updateTileType(t.id, {
      quality: overlay.querySelector("#spQuality").value,
      imageUrl: overlay.querySelector("#spImageUrl").value.trim(),
      description: overlay.querySelector("#spDescription").value.trim()
    });
    showToast("পণ্য আপডেট হয়েছে", "success"); close();
  });
  overlay.addEventListener("click", (e) => {
    const t2 = e.target.closest("[data-action]");
    if (!t2) return;
    if (["add-variant", "edit-variant", "delete-variant"].includes(t2.dataset.action)) close();
    Promise.resolve(handleAction(t2.dataset.action, t2.dataset.id)).catch((err) => {
      console.error(err); showToast("কিছু একটা সমস্যা হয়েছে, আবার চেষ্টা করুন", "error");
    });
  });
}
// Colors must be typed in English — the auto-swatch matching only
// recognizes English (and a small Bangla set internally), and mixing scripts
// makes the product list inconsistent, so this is enforced at entry time.
function isEnglishColorText(s) {
  return /^[A-Za-z][A-Za-z\s\-]*$/.test((s || "").trim());
}
// Adds any number of new colors at once — one per line (or comma-separated)
// — instead of forcing the owner to open "+ নতুন" repeatedly per color.
function openBulkAddColorSheet(tileTypeId) {
  const t = S.tileTypes.find(x => x.id === tileTypeId);
  formSheet({
    title: `নতুন কালার — ${t ? t.name : ""}`,
    bodyHtml: `
      <div class="field" style="margin-bottom:0;">
        <label>কালারের নাম (একটার পর একটা নতুন লাইনে লিখুন — একসাথে যত ইচ্ছা তত যোগ করা যাবে)</label>
        <textarea name="colors" rows="5" placeholder="Red&#10;White&#10;Black&#10;Gray White" required></textarea>
        <div class="hint" style="color:var(--danger); font-weight:700;">⚠️ শুধুমাত্র ইংরেজিতে লিখুন (Red, White, Black...) — বাংলায় লিখলে এন্ট্রি নেওয়া হবে না</div>
      </div>`,
    submitText: "যোগ করুন",
    onSubmit: async (data, close) => {
      const colors = (data.colors || "").split(/[\n,]/).map(s => s.trim()).filter(Boolean);
      if (!colors.length) throw new Error("অন্তত একটা কালার লিখুন");
      const bad = colors.find(c => !isEnglishColorText(c));
      if (bad) throw new Error(`"${bad}" — শুধুমাত্র ইংরেজি অক্ষর ব্যবহার করুন, বাংলা নেওয়া হবে না`);
      for (const color of colors) {
        await addVariant({ tileTypeId, tileTypeName: t ? t.name : "", color });
      }
      showToast(`${formatQty(colors.length)}টা কালার যোগ হয়েছে`, "success");
      close();
    }
  });
}
function openVariantFormSheet(tileTypeId, existing) {
  const t = S.tileTypes.find(x => x.id === tileTypeId);
  formSheet({
    title: "কালার সম্পাদনা করুন",
    bodyHtml: `
      <div class="field" style="margin-bottom:0;"><label>কালার (শুধুমাত্র ইংরেজিতে)</label><input name="color" value="${escapeHtml((existing && existing.color) || "")}" placeholder="যেমনঃ Black, White, Red" required></div>
      <div class="hint" style="color:var(--danger); font-weight:700;">⚠️ বাংলায় লিখলে এন্ট্রি নেওয়া হবে না</div>`,
    submitText: "সংরক্ষণ করুন",
    onSubmit: async (data, close) => {
      const color = (data.color || "").trim();
      if (!isEnglishColorText(color)) throw new Error("শুধুমাত্র ইংরেজি অক্ষর ব্যবহার করুন, বাংলা নেওয়া হবে না");
      await updateVariant(existing.id, { color });
      showToast("আপডেট হয়েছে", "success");
      close();
    }
  });
}

/* ================= more ================= */
function renderMore() {
  return `${simpleHeader("আরও")}
    <div class="tile-grid">
      ${tileNav("staff", Icon.badge, "c1", "কর্মচারী ও ম্যানেজার", `${S.employees.length + S.managers.length} জন`)}
      ${tileNav("salary", Icon.wallet, "c2", "বেতন", "মাসিক বেতন ব্যবস্থাপনা")}
      ${tileNav("reports", Icon.chart, "c3", "রিপোর্ট", "বিক্রি ও উৎপাদন বিশ্লেষণ")}
      ${tileNav("shopManage", Icon.truck, "c4", "শপ ম্যানেজমেন্ট", "অনলাইন দোকান নিয়ন্ত্রণ")}
      ${tileNav("settings", Icon.settings, "c1", "সেটিংস", "দোকান ও টাইলসের ধরন")}
    </div>

    <div class="danger-zone">
      <div class="dz-label">${Icon.alert} বিপজ্জনক এলাকা</div>
      <button class="dz-btn" data-action="open-delete-all-data">সব ডেটা মুছে ফেলুন</button>
      <p class="dz-hint">অ্যাপের সব তথ্য স্থায়ীভাবে মুছে নতুন করে শুরু করুন</p>
    </div>`;
}

/* ================= danger zone: export & full wipe ================= */
async function downloadDataExport(btn) {
  const original = btn.innerHTML;
  btn.innerHTML = `<span class="spinner"></span>`;
  try {
    const data = await exportAllData();
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `4B-Tiles-Backup-${ymd()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("এক্সপোর্ট ডাউনলোড হয়েছে", "success");
  } catch (err) {
    console.error(err);
    showToast("এক্সপোর্ট করা যায়নি, আবার চেষ্টা করুন", "error");
  } finally {
    btn.innerHTML = original;
  }
}
function openDeleteWarningSheet() {
  const { close, overlay } = sheet({
    title: "⚠️ সব ডেটা মুছে ফেলুন",
    bodyHtml: `
      <p style="font-weight:700; margin-bottom:10px;">এই কাজটি করলে যা যা স্থায়ীভাবে মুছে যাবে (ফিরিয়ে আনা যাবে না):</p>
      <ul class="dz-list">
        <li>সব বিক্রি ও উৎপাদনের রেকর্ড</li>
        <li>সব স্টক তথ্য</li>
        <li>সব কাস্টমারের খাতা (বাকি হিসাব)</li>
        <li>সব কর্মচারী, হাজিরা, বেতন ও অগ্রিমের তথ্য</li>
        <li>সব অর্ডার (অভ্যন্তরীণ ও অনলাইন) এবং ফিডব্যাক-নোটিফিকেশন</li>
        <li>সব টাইলসের ধরন, ছবি ও বিবরণ</li>
        <li>দোকানের তথ্য (নাম, ঠিকানা, পেমেন্ট নম্বর)</li>
        <li>সব ম্যানেজারের প্রোফাইল — তারা আর লগইন করতে পারবেন না</li>
      </ul>
      <p class="muted" style="margin:12px 0; line-height:1.6;">শুধু আপনার (মালিকের) লগইন ঠিক থাকবে — আপনি অ্যাপে থাকবেন, কিন্তু সবকিছু একদম খালি অবস্থায় আবার শুরু হবে।</p>
      <button class="btn btn-ghost" id="dzExportBtn" style="width:100%; margin-bottom:14px;">${Icon.wallet} মোছার আগে একবার এক্সপোর্ট করে নিন</button>
      <div class="btn-block-row">
        <button class="btn btn-ghost" id="dzCancelBtn">বাতিল করুন</button>
        <button class="btn btn-danger" id="dzProceedBtn">আমি বুঝেছি, এগিয়ে যান</button>
      </div>`
  });
  overlay.querySelector("#dzCancelBtn").addEventListener("click", close);
  overlay.querySelector("#dzExportBtn").addEventListener("click", (e) => downloadDataExport(e.currentTarget));
  overlay.querySelector("#dzProceedBtn").addEventListener("click", () => { close(); setTimeout(openDeletePasswordSheet, 260); });
}
function openDeletePasswordSheet() {
  formSheet({
    title: "পাসওয়ার্ড নিশ্চিত করুন",
    bodyHtml: `
      <p class="muted" style="margin-bottom:14px; line-height:1.6;">নিরাপত্তার জন্য আপনার লগইন পাসওয়ার্ড দিন। নিশ্চিত করার সাথে সাথেই মোছা শুরু হয়ে যাবে — এই ধাপের পর আর থামানো যাবে না।</p>
      <div class="field" style="margin-bottom:0;"><label>পাসওয়ার্ড</label><input type="password" name="password" required autocomplete="current-password"></div>`,
    submitText: "নিশ্চিত করে মুছুন",
    danger: true,
    onSubmit: async (data, close) => {
      try {
        await reauthenticateWithPassword(data.password);
      } catch (err) {
        throw new Error(authErrorText(err));
      }
      close();
      setTimeout(() => runDataWipe(), 260);
    }
  });
}
function runDataWipe() {
  const overlay = document.createElement("div");
  overlay.className = "um-overlay show";
  overlay.innerHTML = `
    <div class="um-card">
      <div class="um-icon"><span class="um-ring"></span><span class="spinner" style="width:26px; height:26px;"></span></div>
      <h3 id="dwStatus">মুছে ফেলা হচ্ছে...</h3>
      <p class="muted" style="margin-top:10px; line-height:1.6;">দয়া করে অ্যাপ বন্ধ করবেন না — ডেটার পরিমাণ অনুযায়ী কিছুটা সময় লাগতে পারে।</p>
    </div>`;
  document.body.appendChild(overlay);
  wipeAllData(S.profile.id).then(() => {
    overlay.querySelector("#dwStatus").textContent = "সম্পন্ন হয়েছে";
    overlay.querySelector(".muted").textContent = "অ্যাপ এখন খালি অবস্থায় আবার চালু হবে...";
    setTimeout(() => location.reload(), 1400);
  }).catch((err) => {
    console.error(err);
    overlay.remove();
    showToast("মোছা সম্পূর্ণ হয়নি, আবার চেষ্টা করুন", "error");
  });
}

/* ================= orders ================= */
const ORDER_STATUS_LABEL = { pending: "পেন্ডিং", producing: "উৎপাদনে", ready: "প্রস্তুত", delivered: "ডেলিভারি হয়েছে", cancelled: "বাতিল" };
const ORDER_FILTERS = [
  { id: "active", label: "সক্রিয়" }, { id: "all", label: "সব" },
  { id: "pending", label: "পেন্ডিং" }, { id: "producing", label: "উৎপাদনে" },
  { id: "ready", label: "প্রস্তুত" }, { id: "delivered", label: "ডেলিভারি হয়েছে" },
];
function orderUrgent(o) { return !!o.dueDate && o.status !== "delivered" && o.status !== "cancelled" && o.dueDate <= ymd(); }
function orderDueLabel(o) {
  if (!o.dueDate) return "";
  if (o.status === "delivered" || o.status === "cancelled") return formatDateBN(new Date(o.dueDate));
  if (o.dueDate < ymd()) return `মেয়াদ শেষ · ${formatDateBN(new Date(o.dueDate))}`;
  if (o.dueDate === ymd()) return "আজই ডেলিভারি";
  return `ডেলিভারি ${formatDateBN(new Date(o.dueDate))}`;
}
function orderCartLineHtml(it, i) {
  return `<div class="cart-line">
    <div style="flex:1;"><div class="cl-name">${escapeHtml(variantLabel(it.tileTypeName, it.quality, it.color))}</div><div class="cl-meta">${formatQty(it.quantity)} পিস</div></div>
    <span class="cl-del" data-action="order-cart-remove" data-id="${i}">${Icon.trash}</span>
  </div>`;
}
function orderRow(o) {
  const itemsSummary = o.items.map(i => `${variantLabel(i.tileTypeName, i.quality, i.color)} ${formatQty(i.quantity)}`).join(", ");
  const urgent = orderUrgent(o);
  return `<div class="paver row-item" data-action="open-order" data-id="${o.id}">
    <div class="r-icon" style="${urgent ? "background:var(--danger-tint); color:var(--danger);" : ""}">${Icon.clipboard}</div>
    <div class="r-body">
      <div class="r-title">${escapeHtml(o.customerName)} <span class="badge ${o.status}">${ORDER_STATUS_LABEL[o.status]}</span></div>
      <div class="r-sub">${escapeHtml(itemsSummary)}</div>
    </div>
    <div class="r-end"><div class="r-time" style="${urgent ? "color:var(--danger); font-weight:700;" : ""}">${orderDueLabel(o)}</div></div>
  </div>`;
}
function renderOrders() {
  if (VS.orderMode === "create") return renderOrderCreate();
  const filtered = S.orders.filter(o => {
    if (VS.orderFilter === "all") return true;
    if (VS.orderFilter === "active") return o.status !== "delivered" && o.status !== "cancelled";
    return o.status === VS.orderFilter;
  });
  return `${backHeader("অর্ডার", "dashboard")}
    <button class="btn btn-primary" data-action="order-new" style="margin-bottom:16px; width:100%;">${Icon.plus} নতুন অর্ডার নিন</button>
    <div class="chip-select" style="margin-bottom:16px;">
      ${ORDER_FILTERS.map(f => `<span class="chip ${VS.orderFilter === f.id ? "active" : ""}" data-action="order-filter" data-id="${f.id}">${f.label}</span>`).join("")}
    </div>
    <div class="row-list">${filtered.map(orderRow).join("") || emptyState("কোনো অর্ডার নেই")}</div>`;
}
function renderOrderCreate() {
  return `
    <div style="display:flex; align-items:center; gap:10px; margin-bottom:14px;">
      <button class="icon-btn" data-action="order-cancel-create">${Icon.chevronLeft}</button>
      <h2 style="font-size:19px;">নতুন অর্ডার</h2>
    </div>
    <div class="paver" style="margin-bottom:16px;">
      ${variantSelectorHtml("order")}
      <div class="field" style="margin-top:10px; margin-bottom:0;"><label>পরিমাণ (পিস)</label><input type="number" id="orderQty" min="1" placeholder="০"></div>
      <button class="btn btn-dark btn-sm" data-action="order-cart-add" style="margin-top:12px;">${Icon.plus} যোগ করুন</button>
    </div>
    ${VS.orderCart.length ? `
    <div class="section-title" style="margin-top:0;"><h2>অর্ডারের আইটেম</h2></div>
    <div class="paver" style="margin-bottom:16px;">${VS.orderCart.map(orderCartLineHtml).join("")}</div>` : ""}
    <div class="section-title" style="margin-top:0;"><h2>ক্রেতার তথ্য</h2></div>
    <div class="paver" style="margin-bottom:16px;">
      <div class="field"><label>প্রতিষ্ঠান/দোকানের নাম</label><input id="orderCustName" placeholder="যেমনঃ রহিম ট্রেডার্স"></div>
      <div class="field"><label>ফোন নম্বর (ঐচ্ছিক)</label><input id="orderCustPhone" type="tel"></div>
      <div class="field"><label>ঠিকানা (ঐচ্ছিক)</label><input id="orderCustAddress"></div>
      <div class="field"><label>ডেলিভারি কবে দিতে হবে</label><input type="date" id="orderDueDate" value="${ymd()}"></div>
      <div class="field" style="margin-bottom:0;"><label>নোট (ঐচ্ছিক)</label><textarea id="orderNote" placeholder="বিশেষ কিছু থাকলে লিখুন"></textarea></div>
    </div>
    <button class="btn btn-primary" data-action="submit-order" ${(!VS.orderCart.length || VS.orderSubmitting) ? "disabled" : ""} style="width:100%;">${VS.orderSubmitting ? `<span class="spinner"></span>` : "অর্ডার সংরক্ষণ করুন"}</button>`;
}
function openOrderDetail(o) {
  const itemsHtml = o.items.map(it => `
    <div style="display:flex; justify-content:space-between; padding:7px 0; border-top:1px solid var(--line); font-size:13px;">
      <span>${escapeHtml(variantLabel(it.tileTypeName, it.quality, it.color))}</span><span style="font-weight:700;">${formatQty(it.quantity)} পিস</span>
    </div>`).join("");
  const actionBtn = o.status === "pending" ? `<button class="btn btn-dark" data-action="order-advance" data-id="${o.id}" style="width:100%; margin-top:14px;">উৎপাদনে নিন</button>`
    : o.status === "producing" ? `<button class="btn btn-dark" data-action="order-advance" data-id="${o.id}" style="width:100%; margin-top:14px;">প্রস্তুত হয়েছে</button>`
    : o.status === "ready" ? `<button class="btn btn-primary" data-action="order-deliver" data-id="${o.id}" style="width:100%; margin-top:14px;">${Icon.truck} ডেলিভারি করুন</button>`
    : "";
  const cancelBtn = (o.status !== "delivered" && o.status !== "cancelled")
    ? `<button class="btn btn-ghost" data-action="order-cancel" data-id="${o.id}" style="width:100%; margin-top:8px;">অর্ডার বাতিল করুন</button>` : "";
  const { close, overlay } = sheet({
    title: "অর্ডার বিস্তারিত",
    bodyHtml: `
      <div style="margin-bottom:12px;"><span class="badge ${o.status}">${ORDER_STATUS_LABEL[o.status]}</span></div>
      <div style="font-weight:800; font-size:15px;">${escapeHtml(o.customerName)}</div>
      ${o.customerPhone ? `<div class="muted" style="margin-top:2px;">${escapeHtml(o.customerPhone)}</div>` : ""}
      ${o.customerAddress ? `<div class="muted" style="margin-top:2px;">${escapeHtml(o.customerAddress)}</div>` : ""}
      <div class="muted" style="margin-top:8px;">${orderDueLabel(o)}</div>
      ${o.note ? `<div style="margin-top:10px; background:var(--cement); border-radius:10px; padding:10px 12px; font-size:12.5px;">${escapeHtml(o.note)}</div>` : ""}
      <div style="margin-top:14px;">${itemsHtml}</div>
      <div class="muted" style="margin-top:10px; font-size:11px;">নিয়েছেন: ${escapeHtml((o.createdBy && o.createdBy.name) || "")} · ${formatDateTimeBN(toDate(o.createdAt))}</div>
      ${actionBtn}${cancelBtn}`
  });
  overlay.addEventListener("click", (e) => {
    const t = e.target.closest("[data-action]");
    if (!t) return;
    if (["order-deliver", "order-advance", "order-cancel"].includes(t.dataset.action)) close();
    Promise.resolve(handleAction(t.dataset.action, t.dataset.id)).catch((err) => {
      console.error(err); showToast("কিছু একটা সমস্যা হয়েছে, আবার চেষ্টা করুন", "error");
    });
  });
}
function openDeliverSheet(o) {
  const itemsFields = o.items.map((it, i) => `
    <div class="field"><label>${escapeHtml(variantLabel(it.tileTypeName, it.quality, it.color))} — ${formatQty(it.quantity)} পিস — দর/পিস (৳)</label>
      <input type="number" name="price_${i}" min="0" required></div>`).join("");
  formSheet({
    title: "ডেলিভারি সম্পন্ন করুন",
    bodyHtml: `
      <div class="field"><label>লোকেশন (কোথা থেকে দেওয়া হচ্ছে)</label>
        <select name="location" required><option value="factory">ফ্যাক্টরি</option><option value="godown">গোডাউন</option></select></div>
      <div class="field"><label>পেমেন্ট</label>
        <select name="paymentType" required><option value="cash">নগদ</option><option value="baki">বাকি</option></select></div>
      ${itemsFields}`,
    submitText: "ডেলিভারি ও বিক্রি সম্পন্ন করুন",
    onSubmit: async (data, close) => {
      const pricedItems = o.items.map((it, i) => ({
        variantId: it.variantId, tileTypeId: it.tileTypeId, tileTypeName: it.tileTypeName,
        quality: it.quality || "", color: it.color || "", quantity: it.quantity,
        unitPrice: Number(data[`price_${i}`]) || 0
      }));
      try {
        const result = await deliverOrder(o, {
          location: data.location, paymentType: data.paymentType, pricedItems,
          managerId: S.profile.id, managerName: S.profile.name
        });
        const saleForMemo = {
          id: result.id, items: pricedItems, location: data.location, paymentType: data.paymentType,
          total: pricedItems.reduce((a, it) => a + it.quantity * it.unitPrice, 0),
          customerName: o.customerName, customerPhone: o.customerPhone, managerName: S.profile.name, date: new Date()
        };
        showToast("ডেলিভারি সম্পন্ন হয়েছে", "success"); close();
        showMemo(saleForMemo, S.shopInfo);
      } catch (err) {
        if (err && err.message === "insufficient-stock" && err.shortfalls) {
          await alertDialog({ title: "পর্যাপ্ত স্টক নেই", bodyHtml: shortfallBodyHtml(err.shortfalls), okText: "বুঝেছি" });
          throw Object.assign(new Error(), { silent: true });
        }
        throw new Error("ডেলিভারি সম্পন্ন করা যায়নি");
      }
    }
  });
}

/* ================= online orders (public shop inbox) ================= */
const OO_STATUS_LABEL = { new: "নতুন", accepted: "গৃহীত", rejected: "বাতিল" };
const OO_FILTERS = [
  { id: "new", label: "নতুন" }, { id: "all", label: "সব" },
  { id: "accepted", label: "গৃহীত" }, { id: "rejected", label: "বাতিল" },
];
function ooItemLine(it) {
  const size = it.customSize || it.size;
  const name = variantLabel(it.tileTypeName, it.quality, it.color);
  return `${name}${size ? ` (${size})` : ""} ${formatQty(it.quantity)}`;
}
function ooRow(o) {
  const itemsSummary = o.items.map(ooItemLine).join(", ");
  return `<div class="paver row-item" data-action="open-online-order" data-id="${o.id}">
    <div class="r-icon" style="${o.status === "new" ? "background:var(--danger-tint); color:var(--danger);" : ""}">${Icon.truck}</div>
    <div class="r-body">
      <div class="r-title">${escapeHtml(o.customerName)} <span class="badge ${o.status}">${OO_STATUS_LABEL[o.status]}</span></div>
      <div class="r-sub">${escapeHtml(itemsSummary)}</div>
    </div>
    <div class="r-end"><div class="r-time">${formatDateTimeBN(toDate(o.createdAt))}</div></div>
  </div>`;
}
function renderOnlineOrders() {
  const filtered = S.onlineOrders.filter(o => VS.ooFilter === "all" ? true : o.status === VS.ooFilter);
  return `${backHeader("অনলাইন অর্ডার", "dashboard")}
    <div class="chip-select" style="margin-bottom:16px;">
      ${OO_FILTERS.map(f => `<span class="chip ${VS.ooFilter === f.id ? "active" : ""}" data-action="oo-filter" data-id="${f.id}">${f.label}</span>`).join("")}
    </div>
    <div class="row-list">${filtered.map(ooRow).join("") || emptyState("কোনো অনলাইন অর্ডার নেই")}</div>`;
}
function openOnlineOrderDetail(o) {
  const itemsHtml = o.items.map(it => {
    const size = it.customSize || it.size;
    const name = variantLabel(it.tileTypeName, it.quality, it.color);
    return `<div style="display:flex; justify-content:space-between; padding:7px 0; border-top:1px solid var(--line); font-size:13px;">
      <span>${escapeHtml(name)}${size ? ` <span class="muted">(${escapeHtml(size)})</span>` : ""}</span><span style="font-weight:700;">${formatQty(it.quantity)} পিস</span>
    </div>`;
  }).join("");
  const payHtml = o.paymentType === "advance"
    ? `<div class="muted" style="margin-top:8px;">পেমেন্টঃ অ্যাডভান্স পেমেন্ট${o.trxInfo ? " · " + escapeHtml(o.trxInfo) : ""}</div>`
    : `<div class="muted" style="margin-top:8px;">পেমেন্টঃ ক্যাশ অন ডেলিভারি</div>`;
  const actionBtn = o.status === "new" ? `
    <button class="btn btn-primary" data-action="accept-online-order" data-id="${o.id}" style="width:100%; margin-top:14px;">${Icon.check} গ্রহণ করুন — অর্ডারে যোগ করুন</button>
    <button class="btn btn-ghost" data-action="reject-online-order" data-id="${o.id}" style="width:100%; margin-top:8px;">প্রত্যাখ্যান করুন</button>` : "";
  const { close, overlay } = sheet({
    title: "অনলাইন অর্ডার বিস্তারিত",
    bodyHtml: `
      <div style="margin-bottom:12px;"><span class="badge ${o.status}">${OO_STATUS_LABEL[o.status]}</span></div>
      <div style="font-weight:800; font-size:15px;">${escapeHtml(o.customerName)}</div>
      <div class="muted" style="margin-top:2px;">${escapeHtml(o.customerPhone)}</div>
      <div class="muted" style="margin-top:2px;">${escapeHtml(o.customerAddress)}</div>
      ${payHtml}
      ${o.note ? `<div style="margin-top:10px; background:var(--cement); border-radius:10px; padding:10px 12px; font-size:12.5px;">${escapeHtml(o.note)}</div>` : ""}
      <div style="margin-top:14px;">${itemsHtml}</div>
      <div class="muted" style="margin-top:10px; font-size:11px;">${formatDateTimeBN(toDate(o.createdAt))}</div>
      ${actionBtn}`
  });
  overlay.addEventListener("click", (e) => {
    const t = e.target.closest("[data-action]");
    if (!t) return;
    if (["accept-online-order", "reject-online-order"].includes(t.dataset.action)) close();
    Promise.resolve(handleAction(t.dataset.action, t.dataset.id)).catch((err) => {
      console.error(err); showToast("কিছু একটা সমস্যা হয়েছে, আবার চেষ্টা করুন", "error");
    });
  });
}
function openAcceptOnlineOrderSheet(o) {
  formSheet({
    title: "অর্ডার গ্রহণ করুন",
    bodyHtml: `
      <p class="muted" style="margin-bottom:14px; line-height:1.6;">গ্রহণ করলে এটা আপনার সাধারণ অর্ডার তালিকায় "পেন্ডিং" অবস্থায় যোগ হবে — সেখান থেকে দাম ঠিক করে ডেলিভারি করতে পারবেন।</p>
      <div class="field" style="margin-bottom:0;"><label>ডেলিভারি কবে দিতে হবে</label><input type="date" name="dueDate" value="${ymd()}" required></div>`,
    submitText: "গ্রহণ করুন",
    onSubmit: async (data, close) => {
      await convertOnlineOrder(o, { dueDate: data.dueDate, byUid: S.profile.id, byName: S.profile.name, byRole: "owner" });
      showToast("অর্ডার গৃহীত হয়েছে", "success"); close();
    }
  });
}

/* ================= after-render wiring (non-delegated inputs) ================= */
function afterRender() {
  if (VS.view === "orders" && VS.orderMode === "create") {
    wireVariantCascade("order");
  }
  if (VS.view === "saleEntry") {
    wireVariantCascade("line");
    if (VS.salePay === "baki" && !VS.selectedCustomer) {
      const input = document.getElementById("custQueryInput");
      if (input) {
        input.addEventListener("input", (e) => {
          const t = e.target.value.trim().toLowerCase();
          const wrap = document.getElementById("custResultsWrap");
          if (!t) { wrap.innerHTML = ""; return; }
          const matches = S.customers.filter(c => (c.name || "").toLowerCase().includes(t)).slice(0, 5);
          wrap.innerHTML = matches.map(c => `
            <div class="row-item paver tight" style="margin-top:8px; cursor:pointer;" data-action="select-customer" data-id="${c.id}">
              <div class="r-body"><div class="r-title">${escapeHtml(c.name)}</div><div class="r-sub">${escapeHtml(c.phone || "")}${c.totalDue ? " · বাকি " + formatMoney(c.totalDue) : ""}</div></div>
            </div>`).join("");
        });
      }
    }
  }
  if (VS.view === "shopManage") {
    viewEl.querySelectorAll(".r-icon[data-img]").forEach(el => {
      el.style.backgroundImage = `url('${el.dataset.img.replace(/'/g, "%27")}')`;
    });
  }
  if (VS.view === "dashboard") {
    viewEl.querySelectorAll("[data-count]").forEach(el => {
      countUpEl(el, Number(el.dataset.count));
    });
    requestAnimationFrame(() => {
      viewEl.querySelectorAll(".dash-cmp-bar, .dash-stk-f, .dash-stk-g").forEach(el => {
        el.style.width = (el.dataset.w || "0") + "%";
      });
      viewEl.querySelectorAll(".dash-ring-fg").forEach(el => {
        el.style.strokeDashoffset = el.dataset.target;
      });
      viewEl.querySelectorAll(".dash-dc-cash, .dash-dc-baki").forEach(el => {
        el.style.strokeDasharray = el.dataset.target;
      });
    });
  }
  if (VS.view === "customers") {
    const input = document.getElementById("custSearchInput");
    input.addEventListener("input", (e) => {
      VS.customerSearch = e.target.value;
      document.getElementById("custListWrap").innerHTML = buildCustomerListHtml();
    });
  }
  if (VS.view === "stock") {
    const input = document.getElementById("stockSearchInput");
    if (input) {
      input.addEventListener("input", (e) => {
        VS.stockSearch = e.target.value;
        document.getElementById("stockCardsWrap").innerHTML = buildStockCardsHtml();
      });
    }
  }
  if (VS.view === "attendance") {
    document.getElementById("attDateInput").addEventListener("change", (e) => {
      VS.attendanceDate = e.target.value;
      loadAttendanceForDate(VS.attendanceDate);
    });
  }
  if (VS.view === "salary") {
    document.getElementById("salaryMonthInput").addEventListener("change", (e) => {
      if (e.target.value) { watchSalaryMonth(e.target.value); render(); }
    });
  }
  if (VS.view === "reports") {
    document.getElementById("repStart").addEventListener("change", (e) => { VS.reportStart = e.target.value; render(); });
    document.getElementById("repEnd").addEventListener("change", (e) => { VS.reportEnd = e.target.value; render(); });
  }
  if (VS.view === "settings") {
    document.getElementById("shopForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.target).entries());
      await updateShopInfo(data);
      showToast("দোকানের তথ্য সংরক্ষণ হয়েছে", "success");
    });
    document.getElementById("tileTypeForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.target).entries());
      if (!data.name.trim()) return;
      const quality = data.qualitySelect === "__other__" ? (data.qualityOther || "").trim() : data.qualitySelect;
      try {
        await addTileType(data.name, data.size, quality);
        e.target.reset();
        showToast("যোগ হয়েছে", "success");
      } catch (err) {
        showToast("যোগ করা যায়নি, আবার চেষ্টা করুন", "error");
      }
    });
    document.querySelectorAll("#sizeChipRow .chip").forEach(chip => {
      chip.addEventListener("click", () => {
        document.getElementById("ttSizeInput").value = chip.dataset.size;
        document.querySelectorAll("#sizeChipRow .chip").forEach(c => c.classList.toggle("active", c === chip));
      });
    });
    document.getElementById("ttQualitySelect").addEventListener("change", (e) => {
      document.getElementById("ttQualityOther").style.display = e.target.value === "__other__" ? "" : "none";
    });
  }
}

/* ================= actions ================= */
async function handleAction(action, id) {
  switch (action) {
    case "filter-loc": VS.salesFilter.loc = id; render(); break;
    case "filter-pay": VS.salesFilter.pay = id; render(); break;
    case "staff-tab": VS.staffTab = id; render(); break;

    case "sale-set-loc": VS.saleLoc = id; render(); break;
    case "sale-set-pay": VS.salePay = id; render(); break;
    case "select-customer":
      VS.selectedCustomer = S.customers.find(c => c.id === id) || null;
      render(); break;
    case "clear-customer": VS.selectedCustomer = null; render(); break;

    case "cart-add": {
      const variantEl = document.getElementById("lineVariant");
      const qtyEl = document.getElementById("lineQty");
      const priceEl = document.getElementById("linePrice");
      const variantId = variantEl ? variantEl.dataset.value : "";
      const quantity = Number(qtyEl.value);
      const unitPrice = Number(priceEl.value);
      if (!variantId) { showToast("টাইলসের ধরন নির্বাচন করুন", "error"); return; }
      if (!quantity || quantity <= 0) { showToast("সঠিক পরিমাণ দিন", "error"); return; }
      if (unitPrice < 0 || priceEl.value === "") { showToast("দর দিন", "error"); return; }
      const v = S.variants.find(x => x.id === variantId);
      if (!v) { showToast("সঠিক ধরন নির্বাচন করুন", "error"); return; }
      const design = designOf(v.tileTypeId);
          const label = variantLabel(v.tileTypeName, design ? design.quality : "", v.color);

      const already = VS.cart.filter(c => c.variantId === variantId).reduce((a, c) => a + c.quantity, 0);
      const have = stockAt(variantId, VS.saleLoc);
      if (already + quantity > have) {
        await alertDialog({
          title: "পর্যাপ্ত স্টক নেই",
          bodyHtml: shortfallBodyHtml([{ tileTypeName: label, have: Math.max(0, have - already), need: quantity }]),
          okText: "বুঝেছি"
        });
        return;
      }

      VS.cart.push({ variantId, tileTypeId: v.tileTypeId, tileTypeName: v.tileTypeName, quality: (designOf(v.tileTypeId) || {}).quality || "", color: v.color, quantity, unitPrice });
      render();
      break;
    }
    case "cart-remove": VS.cart.splice(Number(id), 1); render(); break;

    case "submit-sale": {
      if (VS.saleSubmitting || !VS.cart.length) return;
      let customerId = null, customerName = null, customerPhone = null;
      if (VS.salePay === "baki") {
        if (VS.selectedCustomer) {
          customerId = VS.selectedCustomer.id; customerName = VS.selectedCustomer.name; customerPhone = VS.selectedCustomer.phone;
        } else {
          const qEl = document.getElementById("custQueryInput");
          const pEl = document.getElementById("custPhoneInput");
          customerName = qEl ? qEl.value.trim() : "";
          customerPhone = pEl ? pEl.value.trim() : "";
          if (!customerName) { showToast("বাকিতে বিক্রির জন্য কাস্টমারের নাম দিন", "error"); return; }
        }
      }
      const total = cartTotal();
      const sig = cartSignature(VS.cart, VS.saleLoc, VS.salePay, customerId || customerName);
      const dupSale = VS.lastSale;
      if (dupSale && dupSale.sig === sig && (Date.now() - dupSale.at) < 10 * 60 * 1000) {
        const proceed = await confirmDialog({
          title: "একই বিক্রি আবার?",
          message: `আপনি একটু আগেই ঠিক একই তালিকার (${formatQty(VS.cart.length)} আইটেম, মোট ${formatMoney(total)}) একটি বিক্রি এন্ট্রি করেছেন। আপনি কি সত্যিই আবার একই বিক্রি এন্ট্রি করতে চান?`,
          okText: "হ্যাঁ, আবার করুন", cancelText: "না, বাতিল করুন"
        });
        if (!proceed) return;
      }
      VS.saleSubmitting = true;
      render();
      try {
        const result = await createSale({
          items: VS.cart, location: VS.saleLoc, paymentType: VS.salePay,
          customerId, customerName, customerPhone, total,
          managerId: S.profile.id, managerName: S.profile.name, date: new Date()
        });
        const saleForMemo = {
          id: result.id, items: VS.cart, location: VS.saleLoc, paymentType: VS.salePay,
          total, customerName, customerPhone, managerName: S.profile.name, date: new Date()
        };
        VS.lastSale = { sig, at: Date.now() };
        VS.cart = []; VS.selectedCustomer = null; VS.saleLoc = "factory"; VS.salePay = "cash";
        showMemo(saleForMemo, S.shopInfo);
      } catch (err) {
        if (err && err.message === "insufficient-stock" && err.shortfalls) {
          await alertDialog({ title: "পর্যাপ্ত স্টক নেই", bodyHtml: shortfallBodyHtml(err.shortfalls), okText: "বুঝেছি" });
        } else {
          throw err;
        }
      } finally {
        VS.saleSubmitting = false;
        render();
      }
      break;
    }

    case "view-memo": {
      const sale = S.sales.find(s => s.id === id);
      if (sale) showMemo(sale, S.shopInfo);
      break;
    }
    case "delete-sale": {
      const sale = S.sales.find(s => s.id === id);
      if (!sale) return;
      const ok = await confirmDialog({ title: "বিক্রি মুছবেন?", message: "স্টক ও কাস্টমারের বাকি হিসাব আগের অবস্থায় ফিরে যাবে।", danger: true, okText: "মুছুন" });
      if (ok) { await deleteSale(sale); showToast("মুছে ফেলা হয়েছে", "success"); }
      break;
    }

    case "order-new": VS.orderMode = "create"; VS.orderCart = []; render(); break;
    case "order-cancel-create": VS.orderMode = "list"; VS.orderCart = []; render(); break;
    case "order-filter": VS.orderFilter = id; render(); break;
    case "open-order": {
      const o = S.orders.find(x => x.id === id);
      if (o) openOrderDetail(o);
      break;
    }
    case "order-cart-add": {
      const variantEl = document.getElementById("orderVariant");
      const qtyEl = document.getElementById("orderQty");
      if (!variantEl || !variantEl.dataset.value) { showToast("টাইলসের ধরন নির্বাচন করুন", "error"); return; }
      const quantity = Number(qtyEl.value);
      if (!quantity || quantity <= 0) { showToast("সঠিক পরিমাণ দিন", "error"); return; }
      const v = S.variants.find(x => x.id === variantEl.dataset.value);
      if (!v) { showToast("সঠিক ধরন নির্বাচন করুন", "error"); return; }
      VS.orderCart.push({ variantId: v.id, tileTypeId: v.tileTypeId, tileTypeName: v.tileTypeName, quality: (designOf(v.tileTypeId) || {}).quality || "", color: v.color, quantity });
      render();
      break;
    }
    case "order-cart-remove": VS.orderCart.splice(Number(id), 1); render(); break;

    case "submit-order": {
      if (VS.orderSubmitting || !VS.orderCart.length) return;
      const nameEl = document.getElementById("orderCustName");
      const phoneEl = document.getElementById("orderCustPhone");
      const addrEl = document.getElementById("orderCustAddress");
      const dueEl = document.getElementById("orderDueDate");
      const noteEl = document.getElementById("orderNote");
      const customerName = nameEl.value.trim();
      if (!customerName) { showToast("প্রতিষ্ঠান/দোকানের নাম দিন", "error"); return; }
      VS.orderSubmitting = true;
      render();
      try {
        await createOrder({
          items: VS.orderCart, customerName, customerPhone: phoneEl.value.trim(),
          customerAddress: addrEl.value.trim(), dueDate: dueEl.value, note: noteEl.value.trim(),
          byUid: S.profile.id, byName: S.profile.name, byRole: "owner"
        });
        showToast("অর্ডার সংরক্ষণ হয়েছে", "success");
        VS.orderCart = []; VS.orderMode = "list";
      } finally {
        VS.orderSubmitting = false;
        render();
      }
      break;
    }

    case "order-advance": {
      const o = S.orders.find(x => x.id === id);
      if (!o) return;
      const next = o.status === "pending" ? "producing" : o.status === "producing" ? "ready" : null;
      if (next) { await updateOrderStatus(id, next); showToast("আপডেট হয়েছে", "success"); }
      break;
    }
    case "order-cancel": {
      const ok = await confirmDialog({ title: "অর্ডার বাতিল করবেন?", danger: true, okText: "বাতিল করুন" });
      if (ok) { await updateOrderStatus(id, "cancelled"); showToast("অর্ডার বাতিল হয়েছে", "success"); }
      break;
    }
    case "order-deliver": {
      const o = S.orders.find(x => x.id === id);
      if (o) openDeliverSheet(o);
      break;
    }

    case "oo-filter": VS.ooFilter = id; render(); break;
    case "open-online-order": {
      const o = S.onlineOrders.find(x => x.id === id);
      if (o) openOnlineOrderDetail(o);
      break;
    }
    case "accept-online-order": {
      const o = S.onlineOrders.find(x => x.id === id);
      if (o) openAcceptOnlineOrderSheet(o);
      break;
    }
    case "reject-online-order": {
      const ok = await confirmDialog({ title: "অর্ডার প্রত্যাখ্যান করবেন?", message: "এই অনলাইন অর্ডারটা প্রত্যাখ্যান করা হবে।", danger: true, okText: "প্রত্যাখ্যান করুন" });
      if (ok) { await updateOnlineOrderStatus(id, "rejected"); showToast("প্রত্যাখ্যান করা হয়েছে", "success"); }
      break;
    }

    case "delete-production": {
      const p = S.production.find(x => x.id === id);
      if (!p) return;
      const ok = await confirmDialog({ title: "উৎপাদন এন্ট্রি মুছবেন?", message: "ফ্যাক্টরির স্টক থেকে এই পরিমাণ বাদ যাবে।", danger: true, okText: "মুছুন" });
      if (!ok) break;
      try {
        await deleteProduction(p);
        showToast("মুছে ফেলা হয়েছে", "success");
      } catch (err) {
        if (err && err.message === "insufficient-stock" && err.shortfalls) {
          await alertDialog({
            title: "এখন মোছা যাবে না",
            bodyHtml: `<p class="muted" style="margin-bottom:12px; line-height:1.6;">এর মধ্যে এই উৎপাদনের কিছু মাল বিক্রি বা ট্রান্সফার হয়ে গেছে — মুছলে ফ্যাক্টরির স্টক নেগেটিভ হয়ে যাবে, তাই এটা আটকানো হয়েছে।</p>${shortfallBodyHtml(err.shortfalls)}`,
            okText: "বুঝেছি"
          });
        } else {
          throw err;
        }
      }
      break;
    }
    case "delete-attendance": {
      const ok = await confirmDialog({ title: "হাজিরা এন্ট্রি মুছবেন?", danger: true, okText: "মুছুন" });
      if (ok) { await deleteAttendance(id); showToast("মুছে ফেলা হয়েছে", "success"); }
      break;
    }
    case "delete-tiletype": {
      const ok = await confirmDialog({ title: "টাইলসের ধরন মুছবেন?", message: "আগের বিক্রি/স্টক রেকর্ডে নাম থেকে যাবে।", danger: true, okText: "মুছুন" });
      if (ok) { await deleteTileType(id); showToast("মুছে ফেলা হয়েছে", "success"); }
      break;
    }

    case "edit-shop-product": {
      const t = S.tileTypes.find(x => x.id === id);
      if (t) openShopProductSheet(t);
      break;
    }
    case "open-shop-payment-form": openShopPaymentSheet(); break;
    case "open-banner-manage": openBannerManageSheet(); break;

    case "add-variant": openBulkAddColorSheet(id); break;
    case "edit-variant": {
      const v = S.variants.find(x => x.id === id);
      if (v) openVariantFormSheet(v.tileTypeId, v);
      break;
    }
    case "delete-variant": {
      const v = S.variants.find(x => x.id === id);
      if (!v) return;
      const factory = stockAt(v.id, "factory"), godown = stockAt(v.id, "godown");
      if (factory + godown > 0) {
        await alertDialog({ title: "মোছা যাবে না", bodyHtml: `<p>এই ধরনে এখনো স্টক আছে (ফ্যাক্টরি ${formatQty(factory)}, গোডাউন ${formatQty(godown)}) — আগে স্টক ট্রান্সফার বা সমন্বয় করুন।</p>`, okText: "বুঝেছি" });
        return;
      }
      const ok = await confirmDialog({ title: "এই ধরনটি মুছবেন?", message: escapeHtml(variantDisplayLabel(v)), danger: true, okText: "মুছুন" });
      if (ok) { await deleteVariant(id); showToast("মুছে ফেলা হয়েছে", "success"); }
      break;
    }

    case "toggle-stock-card": {
      document.querySelectorAll(".stock-card.expanded").forEach(card => {
        if (card.dataset.design !== id) card.classList.remove("expanded");
      });
      const target = document.querySelector(`.stock-card[data-design="${id}"]`);
      if (target) target.classList.toggle("expanded");
      break;
    }

    case "open-transfer": {
      const { form } = formSheet({
        title: "স্টক ট্রান্সফার",
        bodyHtml: `
          ${variantSelectorHtml("transfer")}
          <div class="field"><label>উৎস (থেকে)</label><select name="from" required><option value="factory">ফ্যাক্টরি</option><option value="godown">গোডাউন</option></select></div>
          <div class="field"><label>গন্তব্য (যেখানে)</label><select name="to" required><option value="godown">গোডাউন</option><option value="factory">ফ্যাক্টরি</option></select></div>
          <div class="field"><label>পরিমাণ</label><input type="number" name="qty" min="1" required></div>`,
        submitText: "ট্রান্সফার করুন",
        onSubmit: async (data, close) => {
          if (data.from === data.to) throw new Error("উৎস ও গন্তব্য একই হতে পারবে না");
          const variantId = document.getElementById("transferVariant").dataset.value;
          if (!variantId) throw new Error("টাইলসের ধরন নির্বাচন করুন");
          const v = S.variants.find(x => x.id === variantId);
          if (!v) throw new Error("সঠিক ধরন নির্বাচন করুন");
          const qty = Number(data.qty);
          const design = designOf(v.tileTypeId);
          const label = variantLabel(v.tileTypeName, design ? design.quality : "", v.color);
          const dupT = VS.lastTransfer;
          if (dupT && dupT.variantId === variantId && dupT.from === data.from && dupT.to === data.to && dupT.qty === qty && (Date.now() - dupT.at) < 10 * 60 * 1000) {
            const proceed = await confirmDialog({
              title: "একই ট্রান্সফার আবার?",
              message: `আপনি একটু আগেই ${escapeHtml(label)} — ${formatQty(qty)} পিস ঠিক একই রুটে ট্রান্সফার করেছেন। আপনি কি সত্যিই আবার একই ট্রান্সফার করতে চান?`,
              okText: "হ্যাঁ, আবার করুন", cancelText: "না, বাতিল করুন"
            });
            if (!proceed) throw Object.assign(new Error(), { silent: true });
          }
          try {
            await transferStock({
              fromLocation: data.from, toLocation: data.to,
              variantId: v.id, tileTypeId: v.tileTypeId, tileTypeName: v.tileTypeName, quality: design ? design.quality : "", color: v.color,
              qty, byUid: S.profile.id, byName: S.profile.name, byRole: "owner"
            });
          } catch (err) {
            if (err && err.message === "insufficient-stock" && err.shortfalls) {
              await alertDialog({ title: "পর্যাপ্ত স্টক নেই", bodyHtml: shortfallBodyHtml(err.shortfalls), okText: "বুঝেছি" });
              throw Object.assign(new Error(), { silent: true });
            }
            throw new Error("ট্রান্সফার ব্যর্থ হয়েছে");
          }
          VS.lastTransfer = { variantId, from: data.from, to: data.to, qty, at: Date.now() };
          showToast("স্টক ট্রান্সফার সম্পন্ন হয়েছে", "success"); close();
        }
      });
      wireVariantCascade("transfer");
      break;
    }

    case "open-add-customer":
      formSheet({
        title: "নতুন কাস্টমার",
        bodyHtml: `
          <div class="field"><label>নাম</label><input name="name" required></div>
          <div class="field"><label>ফোন</label><input name="phone"></div>
          <div class="field"><label>শুরুর বাকি (ঐচ্ছিক)</label><input type="number" name="openingDue" placeholder="0"></div>`,
        onSubmit: async (data, close) => {
          await addCustomer(data);
          showToast("কাস্টমার যোগ হয়েছে", "success"); close();
        }
      });
      break;

    case "open-payment":
      formSheet({
        title: "পেমেন্ট জমা",
        bodyHtml: `<div class="field"><label>জমার পরিমাণ</label><input type="number" name="amount" min="1" required></div>`,
        submitText: "জমা নিন",
        onSubmit: async (data, close) => {
          const c = S.customers.find(x => x.id === id);
          await addPayment({ customerId: id, customerName: c.name, amount: Number(data.amount), managerId: S.profile.id, managerName: S.profile.name });
          showToast("পেমেন্ট জমা হয়েছে", "success"); close();
          getCustomerLedger(id).then(d => { VS.ledgerData = d; render(); });
        }
      });
      break;

    case "open-add-employee":
      formSheet({
        title: "নতুন শ্রমিক",
        bodyHtml: `
          <div class="field"><label>নাম</label><input name="name" required></div>
          <div class="field"><label>ফোন</label><input name="phone"></div>
          <div class="field"><label>মাসিক বেতন</label><input type="number" name="monthlySalary" required></div>`,
        onSubmit: async (data, close) => { await addEmployee(data); showToast("শ্রমিক যোগ হয়েছে", "success"); close(); }
      });
      break;
    case "edit-employee": {
      const emp = S.employees.find(e => e.id === id);
      formSheet({
        title: "শ্রমিকের তথ্য এডিট",
        bodyHtml: `
          <div class="field"><label>নাম</label><input name="name" value="${escapeHtml(emp.name)}" required></div>
          <div class="field"><label>ফোন</label><input name="phone" value="${escapeHtml(emp.phone || "")}"></div>
          <div class="field"><label>মাসিক বেতন</label><input type="number" name="monthlySalary" value="${emp.monthlySalary || 0}" required></div>`,
        onSubmit: async (data, close) => {
          await updateEmployee(id, { name: data.name, phone: data.phone, monthlySalary: Number(data.monthlySalary) });
          showToast("আপডেট হয়েছে", "success"); close();
        }
      });
      break;
    }
    case "toggle-employee": {
      const emp = S.employees.find(e => e.id === id);
      await setEmployeeActive(id, emp.active === false);
      showToast(emp.active === false ? "সক্রিয় করা হয়েছে" : "নিষ্ক্রিয় করা হয়েছে", "success");
      break;
    }

    case "open-delete-all-data": openDeleteWarningSheet(); break;

    case "open-add-manager":
      formSheet({
        title: "নতুন ম্যানেজার",
        bodyHtml: `
          <div class="field"><label>নাম</label><input name="name" required></div>
          <div class="field"><label>ফোন</label><input name="phone"></div>
          <div class="field"><label>মাসিক বেতন (৳)</label><input type="number" name="monthlySalary" min="0" required></div>
          <div class="field"><label>ইমেইল (লগইনের জন্য)</label><input type="email" name="email" required></div>
          <div class="field"><label>পাসওয়ার্ড</label><input name="password" required minlength="6"><div class="hint">এই পাসওয়ার্ড ম্যানেজারকে জানিয়ে দিন</div></div>`,
        submitText: "অ্যাকাউন্ট তৈরি করুন",
        onSubmit: async (data, close) => {
          try {
            await createManagerAccount(data);
          } catch (err) { throw new Error(authErrorText(err)); }
          showToast("ম্যানেজার অ্যাকাউন্ট তৈরি হয়েছে", "success"); close();
        }
      });
      break;
    case "edit-manager": {
      const mgr = S.managers.find(m => m.id === id);
      if (!mgr) return;
      formSheet({
        title: "ম্যানেজার সম্পাদনা",
        bodyHtml: `
          <div class="field"><label>নাম</label><input name="name" value="${escapeHtml(mgr.name || "")}" required></div>
          <div class="field"><label>ফোন</label><input name="phone" value="${escapeHtml(mgr.phone || "")}"></div>
          <div class="field" style="margin-bottom:0;"><label>মাসিক বেতন (৳)</label><input type="number" name="monthlySalary" min="0" value="${mgr.monthlySalary || 0}" required></div>`,
        onSubmit: async (data, close) => {
          await updateManager(id, { name: data.name.trim(), phone: data.phone || "", monthlySalary: Number(data.monthlySalary) || 0 });
          showToast("আপডেট হয়েছে", "success"); close();
        }
      });
      break;
    }
    case "toggle-manager": {
      const mgr = S.managers.find(m => m.id === id);
      await setManagerActive(id, mgr.active === false);
      showToast(mgr.active === false ? "সক্রিয় করা হয়েছে" : "নিষ্ক্রিয় করা হয়েছে", "success");
      break;
    }

    case "generate-salaries": {
      const ok = await confirmDialog({ title: "এই মাসের বেতন তৈরি করবেন?", message: `${VS.salaryMonth} মাসের জন্য সকল সক্রিয় শ্রমিক ও ম্যানেজারের বেতন এন্ট্রি তৈরি হবে (অগ্রিম বাদ দিয়ে)। যা পরিশোধিত হয়ে গেছে তা বদলাবে না।`, okText: "তৈরি করুন" });
      if (ok) {
        await generateMonthSalaries(VS.salaryMonth, allStaff(), S.advances, "owner", S.profile.id, S.profile.name);
        showToast("বেতন তৈরি হয়েছে", "success");
      }
      break;
    }
    case "toggle-salary": {
      const sal = S.salaries.find(s => s.id === id);
      await markSalaryPaid(id, !sal.paid);
      break;
    }
    case "edit-salary": {
      const sal = S.salaries.find(s => s.id === id);
      formSheet({
        title: "বেতনের পরিমাণ",
        bodyHtml: `<div class="field"><label>প্রদেয় পরিমাণ</label><input type="number" name="amount" value="${sal.amount}" required></div>`,
        onSubmit: async (data, close) => { await updateSalary(id, { amount: Number(data.amount) }); showToast("আপডেট হয়েছে", "success"); close(); }
      });
      break;
    }
    case "download-payslip": {
      const sal = S.salaries.find(s => s.id === id);
      if (sal) showPayslip(sal, S.shopInfo, VS.salaryMonth);
      break;
    }
    case "download-salary-sheet": {
      if (!S.salaries.length) { showToast("এই মাসের বেতন তৈরি করুন আগে", "error"); return; }
      showSalarySheet(S.salaries, VS.salaryMonth, S.shopInfo);
      break;
    }
    case "open-advance-form": {
      const staff = allStaff();
      formSheet({
        title: "অগ্রিম বেতন এন্ট্রি",
        bodyHtml: `
          <div class="field"><label>কর্মচারী / ম্যানেজার</label><select name="employeeId" required>${staff.map(e => `<option value="${e.id}">${escapeHtml(e.name)}${e.staffType === "manager" ? " (ম্যানেজার)" : ""}</option>`).join("") || `<option value="">কোনো সক্রিয় কর্মচারী নেই</option>`}</select></div>
          <div class="field"><label>পরিমাণ (৳)</label><input type="number" name="amount" min="1" required></div>
          <div class="field"><label>তারিখ</label><input type="date" name="date" value="${ymd()}" required></div>
          <div class="field" style="margin-bottom:0;"><label>নোট (ঐচ্ছিক)</label><input name="note"></div>`,
        submitText: "সংরক্ষণ করুন",
        onSubmit: async (data, close) => {
          const emp = staff.find(e => e.id === data.employeeId);
          if (!emp) throw new Error("কর্মচারী নির্বাচন করুন");
          try {
            await addAdvance({
              employeeId: emp.id, employeeName: emp.name, amount: Number(data.amount), date: data.date,
              monthlySalary: emp.monthlySalary || 0, note: data.note,
              byUid: S.profile.id, byName: S.profile.name, byRole: "owner"
            });
            showToast("অগ্রিম এন্ট্রি হয়েছে", "success"); close();
          } catch (err) {
            if (err && err.message === "advance-limit") {
              throw new Error(`মাসিক বেতনের বেশি অগ্রিম দেওয়া যাবে না (এই মাসে ইতিমধ্যে ${formatMoney(err.already)} নেওয়া হয়েছে, বেতন ${formatMoney(err.monthlySalary)})`);
            }
            throw new Error("অগ্রিম এন্ট্রি করা যায়নি");
          }
        }
      });
      break;
    }
    case "delete-advance": {
      const adv = S.advances.find(a => a.id === id);
      if (!adv) return;
      const ok = await confirmDialog({ title: "অগ্রিম এন্ট্রি মুছবেন?", message: `${escapeHtml(adv.employeeName)} — ${formatMoney(adv.amount)}`, danger: true, okText: "মুছুন" });
      if (ok) { await deleteAdvance(id); showToast("মুছে ফেলা হয়েছে", "success"); }
      break;
    }

    case "mark-feedback-read": {
      const fb = S.feedback.find(f => f.id === id);
      if (fb && !fb.read) await markFeedbackRead(id, true);
      break;
    }

    case "mark-notif-read": {
      const n = S.notifications.find(x => x.id === id);
      if (n && !n.read) await markNotificationRead(id);
      break;
    }
    case "mark-all-notif": {
      const ids = S.notifications.filter(x => !x.read).map(x => x.id);
      await markAllNotificationsRead(ids);
      break;
    }

    default:
      if (action.startsWith("nav:")) navTo(action.slice(4), { id });
  }
}
