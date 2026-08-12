// ============================================================
// 4B PAVEMENT TILES — Manager panel
// ============================================================
import { guardPage, logout } from "./auth.js";
import { Icon } from "./icons.js";
import { showMemo, showPayslip, showSalarySheet } from "./memo.js";
import {
  subscribeTileTypes, subscribeVariants, variantLabel, subscribeStock, transferStock,
  createSale, subscribeSales, createProduction,
  subscribeCustomers, subscribeEmployees, subscribeManagers,
  subscribeAttendanceForDate, getAttendanceForDate, submitAttendance,
  sendFeedback, subscribeFeedback, subscribeShopInfo,
  createOrder, subscribeOrders, updateOrderStatus, deliverOrder,
  subscribeSalaries, generateMonthSalaries, subscribeAdvancesForMonth, addAdvance,
  subscribeOnlineOrders, updateOnlineOrderStatus, convertOnlineOrder
} from "./data.js";
import {
  formatMoney, formatQty, formatDateBN, formatDateTimeBN, formatWeekdayBN, toDate, ymd, ym,
  showToast, confirmDialog, formSheet, sheet, escapeHtml, alertDialog, shortfallBodyHtml, initUpdateWatcher, initA2HSPrompt
} from "./utils.js";

const S = {
  profile: null,
  tileTypes: [], variants: [], stock: [], sales: [], customers: [], employees: [], managers: [],
  attendanceToday: [], feedback: [], shopInfo: {}, orders: [], salaries: [], advances: [], onlineOrders: [],
  loaded: {}
};
const VS = {
  view: "dashboard",
  cart: [], saleLoc: "factory", salePay: "cash", selectedCustomer: null,
  attDate: ymd(), attDateData: [], attDraft: null, attSubmitting: false,
  saleSubmitting: false, productionSubmitting: false,
  lastProduction: null, lastSale: null, lastTransfer: null,
  orderMode: "list", orderFilter: "active", orderCart: [], orderSubmitting: false,
  salaryMonth: ym(),
  ooFilter: "new", stockSearch: "",
};
const viewEl = document.getElementById("view");
let renderTimer = null;
const VIEW_DEPS = {
  dashboard: ["sales", "stock", "employees", "orders", "attendanceToday"],
  sale: ["tileTypes", "variants", "stock", "customers"],
  production: ["tileTypes", "variants"],
  stock: ["stock", "tileTypes", "variants"],
  attendance: ["attendanceToday", "employees"],
  orders: ["orders", "tileTypes", "variants"],
  salary: ["salaries", "employees"],
  onlineOrders: ["onlineOrders"],
};
function scheduleRender(key) {
  if (key) S.loaded[key] = true;
  clearTimeout(renderTimer); renderTimer = setTimeout(render, 60);
}
let unsubSalary = null;
let unsubAdvances = null;
function watchSalaryMonth(month) {
  if (unsubSalary) unsubSalary();
  if (unsubAdvances) unsubAdvances();
  VS.salaryMonth = month;
  unsubSalary = subscribeSalaries(v => { S.salaries = v; scheduleRender("salaries"); }, month);
  unsubAdvances = subscribeAdvancesForMonth(month, v => { S.advances = v; scheduleRender(); });
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

guardPage("manager", (profile) => {
  S.profile = profile;
  document.getElementById("brandMarkHolder").innerHTML = Icon.brand;
  document.getElementById("splash").remove();
  document.getElementById("app").style.display = "";
  document.getElementById("mgrNameLabel").textContent = profile.name ? `স্বাগতম, ${profile.name}` : "ম্যানেজার প্যানেল";

  const navIcons = { dashboard: Icon.home, sale: Icon.sale, production: Icon.factory, stock: Icon.box, attendance: Icon.calendarCheck };
  document.querySelectorAll(".nav-item").forEach(el => {
    el.querySelector("span").innerHTML = navIcons[el.dataset.nav] || "";
    el.addEventListener("click", () => navTo(el.dataset.nav));
  });

  const feedbackBtn = document.getElementById("feedbackBtn");
  feedbackBtn.innerHTML = Icon.message;
  feedbackBtn.addEventListener("click", openFeedbackSheet);

  const logoutBtn = document.getElementById("logoutBtn");
  logoutBtn.innerHTML = Icon.logout;
  logoutBtn.addEventListener("click", async () => {
    const ok = await confirmDialog({ title: "লগআউট করবেন?", danger: true, okText: "লগআউট" });
    if (ok) { await logout(); window.location.href = "login.html"; }
  });

  viewEl.addEventListener("click", onViewClick);
  initSubscriptions();
  navTo("dashboard");
});

if ("serviceWorker" in navigator) {
  initUpdateWatcher();
}
initA2HSPrompt();

function initSubscriptions() {
  subscribeTileTypes(v => { S.tileTypes = v; scheduleRender("tileTypes"); });
  subscribeVariants(v => { S.variants = v; scheduleRender("variants"); });
  subscribeStock(v => { S.stock = v; scheduleRender("stock"); });
  subscribeSales(v => { S.sales = v; scheduleRender("sales"); }, { max: 100 });
  subscribeCustomers(v => { S.customers = v; scheduleRender("customers"); });
  subscribeEmployees(v => { S.employees = v; scheduleRender("employees"); });
  subscribeManagers(v => { S.managers = v; scheduleRender("managers"); });
  subscribeAttendanceForDate(ymd(), v => { S.attendanceToday = v; scheduleRender("attendanceToday"); });
  subscribeFeedback(v => { S.feedback = v; scheduleRender("feedback"); });
  subscribeOrders(v => { S.orders = v; scheduleRender("orders"); });
  subscribeOnlineOrders(v => { S.onlineOrders = v; scheduleRender("onlineOrders"); });
  watchSalaryMonth(VS.salaryMonth);
  subscribeShopInfo(v => { S.shopInfo = v; S.loaded.shopInfo = true; });
}

/* ================= nav / render ================= */
function navTo(view) {
  VS.view = view;
  if (view === "attendance") { VS.attDraft = null; loadAttendanceForDate(VS.attDate); }
  document.querySelectorAll(".nav-item").forEach(el => el.classList.toggle("active", el.dataset.nav === view));
  render();
}
async function loadAttendanceForDate(date) {
  if (date === ymd()) { VS.attDateData = S.attendanceToday; render(); return; }
  VS.attDateData = await getAttendanceForDate(date);
  if (VS.attDate === date) render();
}

function render() {
  const renderers = { dashboard: renderDashboard, sale: renderSaleEntry, production: renderProductionEntry, stock: renderStock, attendance: renderAttendanceEntry, orders: renderOrders, salary: renderSalary, onlineOrders: renderOnlineOrders };
  const deps = VIEW_DEPS[VS.view] || [];
  if (!deps.every(k => S.loaded[k])) {
    viewEl.innerHTML = skeletonFor(VS.view);
    return;
  }
  viewEl.innerHTML = (renderers[VS.view] || renderDashboard)();
  afterRender();
}

/* ================= skeleton loading placeholders ================= */
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
const LIST_SKELETON_VIEWS = new Set(["sale", "production", "attendance", "orders", "onlineOrders"]);
function skeletonFor(view) {
  if (view === "dashboard") return skeletonDashboard();
  if (view === "stock") return skeletonCards(4);
  if (LIST_SKELETON_VIEWS.has(view)) return skeletonList(5);
  return skeletonList(3);
}

function onViewClick(e) {
  const t = e.target.closest("[data-action]");
  if (!t) return;
  Promise.resolve(handleAction(t.dataset.action, t.dataset.id)).catch((err) => {
    console.error(err);
    showToast("কিছু একটা সমস্যা হয়েছে, আবার চেষ্টা করুন", "error");
  });
}

/* ================= shared bits ================= */
function simpleHeader(title) { return `<h2 style="font-size:19px; margin-bottom:14px;">${title}</h2>`; }
function emptyState(msg, sub = "") { return `<div class="empty-state">${Icon.empty}<b>${msg}</b><span>${sub}</span></div>`; }
function tileNav(view, icon, colorClass, label, sub) {
  return `<div class="paver tile-nav ${colorClass}" data-action="nav:${view}">
    <div class="t-icon">${icon}</div><div><b>${label}</b><br><small>${sub}</small></div>
  </div>`;
}

/* ================= dashboard ================= */
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
function renderDashboard() {
  const today = ymd();
  const todaySales = S.sales.filter(s => ymd(toDate(s.date || s.createdAt)) === today);
  const todayTotal = todaySales.reduce((a, s) => a + (s.total || 0), 0);
  const mySales = todaySales.filter(s => s.managerId === S.profile.id);
  const myTotal = mySales.reduce((a, s) => a + (s.total || 0), 0);
  const myFeedback = S.feedback.filter(f => f.managerId === S.profile.id).slice(0, 3);
  const totalStock = S.stock.reduce((a, s) => a + (s.quantity || 0), 0);

  const totalEmployees = S.employees.filter(e => e.active !== false).length;
  const presentToday = S.attendanceToday.filter(a => a.status === "present").length;

  // --- plain-language comparison with yesterday (own sales) ---
  const yesterday = ymd(new Date(Date.now() - 86400000));
  const myYesterday = S.sales.filter(s => s.managerId === S.profile.id && ymd(toDate(s.date || s.createdAt)) === yesterday).reduce((a, s) => a + (s.total || 0), 0);
  let cmpLine = "";
  if (myTotal > 0 || myYesterday > 0) {
    const diff = myTotal - myYesterday;
    if (diff > 0) cmpLine = `গতকালের চেয়ে ${formatMoney(diff)} বেশি ▲`;
    else if (diff < 0) cmpLine = `গতকালের চেয়ে ${formatMoney(-diff)} কম ▼`;
    else cmpLine = "গতকালের সমান";
  }

  // --- orders overview ---
  const activeOrders = S.orders.filter(o => o.status !== "delivered" && o.status !== "cancelled");
  const overdueOrders = activeOrders.filter(o => orderUrgent(o));
  const newOnlineOrders = S.onlineOrders.filter(o => o.status === "new");

  // --- আজকের কাজ (plain-language task checklist) ---
  const attendanceSubmitted = S.attendanceToday.length > 0;
  const tasks = [];
  if (newOnlineOrders.length) {
    tasks.push(`<div class="mgr-task danger" data-action="nav:onlineOrders"><span class="dot"></span> ${formatQty(newOnlineOrders.length)} টি নতুন অনলাইন অর্ডার এসেছে <span class="chev">›</span></div>`);
  }
  if (totalEmployees > 0) {
    tasks.push(attendanceSubmitted
      ? `<div class="mgr-task ok" data-action="nav:attendance"><span class="dot"></span> আজকের হাজিরা জমা হয়েছে (${formatQty(presentToday)}/${formatQty(totalEmployees)} উপস্থিত) <span class="chev">›</span></div>`
      : `<div class="mgr-task warn" data-action="nav:attendance"><span class="dot"></span> আজকের হাজিরা এখনো জমা হয়নি — জমা দিন <span class="chev">›</span></div>`);
  }
  if (overdueOrders.length) {
    tasks.push(`<div class="mgr-task danger" data-action="nav:orders"><span class="dot"></span> ${formatQty(overdueOrders.length)} টি অর্ডারের ডেলিভারির সময় আজ বা পেরিয়ে গেছে <span class="chev">›</span></div>`);
  } else if (activeOrders.length) {
    tasks.push(`<div class="mgr-task ok" data-action="nav:orders"><span class="dot"></span> ${formatQty(activeOrders.length)} টি সক্রিয় অর্ডার — সময়মতো চলছে <span class="chev">›</span></div>`);
  }
  if (!tasks.length) {
    tasks.push(`<div class="mgr-task ok" style="cursor:default;"><span class="dot"></span> আজকের সব কাজ ঠিকঠাক আছে</div>`);
  }

  const action = (view, icon, color, label, sub) =>
    `<div class="mgr-action dash-rise" data-action="nav:${view}" style="animation-delay:${actionDelay()}s">
      <div class="chip" style="background:${color};">${icon}</div>
      <b>${label}</b><small>${sub}</small>
    </div>`;
  let ad = 0.14;
  function actionDelay() { ad += 0.03; return ad.toFixed(2); }

  return `
    <div class="dash-bg"><div class="dash-lattice"></div></div>

    <div class="dash-hdr dash-rise">
      <div class="date">${formatWeekdayBN(new Date())}, ${formatDateBN(new Date())}</div>
      <div class="greet">শুভেচ্ছা, <span>${escapeHtml(S.profile.name || "ম্যানেজার")}</span></div>
      <div class="dash-live"><span class="dash-radar"><i></i><b></b></span> সব হিসাব লাইভ আপডেট হচ্ছে</div>
    </div>

    <div class="mgr-hero dash-rise" style="animation-delay:.05s">
      <div class="l">আপনার আজকের বিক্রি</div>
      <div class="v" data-count="${myTotal}">৳0</div>
      <div class="cmp">${cmpLine ? cmpLine + " · " : ""}আজ ${formatQty(mySales.length)} টি এন্ট্রি</div>
    </div>

    <div class="mgr-stats dash-rise" style="animation-delay:.09s">
      <div class="mgr-stat"><div class="l">দোকানের আজকের মোট</div><div class="v" data-count="${todayTotal}">৳0</div></div>
      <div class="mgr-stat"><div class="l">মোট স্টক</div><div class="v">${formatQty(totalStock)} পিস</div></div>
    </div>

    <div class="dash-section-lbl dash-rise" style="animation-delay:.11s">আজকের কাজ</div>
    <div class="mgr-tasks dash-rise" style="animation-delay:.12s">${tasks.join("")}</div>

    <div class="dash-section-lbl dash-rise" style="animation-delay:.14s">কাজ শুরু করুন</div>
    <div class="mgr-actions">
      ${action("sale", Icon.sale, "var(--terracotta)", "বিক্রি এন্ট্রি", "নতুন বিক্রি করুন")}
      ${action("production", Icon.factory, "var(--ochre)", "উৎপাদন এন্ট্রি", "উৎপাদন যোগ করুন")}
      ${action("stock", Icon.box, "var(--moss)", "স্টক", "দেখুন ও ট্রান্সফার")}
      ${action("attendance", Icon.calendarCheck, "var(--ink)", "হাজিরা", attendanceSubmitted ? `${formatQty(presentToday)}/${formatQty(totalEmployees)} উপস্থিত` : "আজকেরটা জমা দিন")}
      ${action("orders", Icon.clipboard, "var(--terracotta-deep)", "অর্ডার", `${formatQty(activeOrders.length)} টি সক্রিয়`)}
      ${action("onlineOrders", Icon.truck, "var(--moss-deep)", "অনলাইন অর্ডার", newOnlineOrders.length ? `${formatQty(newOnlineOrders.length)} টি নতুন` : "কোনো নতুন নেই")}
      ${action("salary", Icon.wallet, "var(--ochre-deep)", "বেতন", "তালিকা ও অগ্রিম")}
    </div>

    <div class="section-title"><h2>আপনার সাম্প্রতিক বিক্রি</h2></div>
    <div class="row-list">${mySales.slice(0, 5).map(saleRow).join("") || emptyState("আজ এখনো কোনো বিক্রি করেননি")}</div>
    ${myFeedback.length ? `
      <div class="section-title"><h2>আপনার ফিডব্যাক</h2></div>
      <div class="row-list">${myFeedback.map(f => `
        <div class="paver row-item" style="cursor:default;">
          <div class="r-icon">${Icon.message}</div>
          <div class="r-body"><div class="r-title">${escapeHtml(f.message)}</div><div class="r-sub">${formatDateTimeBN(toDate(f.createdAt))} · ${f.read ? "মালিক দেখেছেন" : "এখনো দেখেননি"}</div></div>
        </div>`).join("")}</div>` : ""}`;
}
function saleRow(s) {
  return `<div class="paver row-item" data-action="view-memo" data-id="${s.id}">
    <div class="r-icon">${Icon.sale}</div>
    <div class="r-body">
      <div class="r-title">${escapeHtml(s.items.map(i => variantLabel(i.tileTypeName, i.quality, i.color)).join(", "))}</div>
      <div class="r-sub">${s.location === "factory" ? "ফ্যাক্টরি" : "গোডাউন"} · <span class="badge ${s.paymentType}">${s.paymentType === "cash" ? "নগদ" : "বাকি"}</span></div>
    </div>
    <div class="r-end"><div class="r-amount">${formatMoney(s.total)}</div><div class="r-time">${formatDateTimeBN(toDate(s.date || s.createdAt))}</div></div>
  </div>`;
}

/* ================= sale entry ================= */
function cartTotal() { return VS.cart.reduce((a, it) => a + it.quantity * it.unitPrice, 0); }
function variantsFor(tileTypeId) {
  return S.variants.filter(v => v.tileTypeId === tileTypeId);
}
function variantDisplayLabel(v) {
  return v.color || "সাধারণ";
}
const designOf = (tileTypeId) => S.tileTypes.find(t => t.id === tileTypeId);
function stockAt(variantId, location) {
  const s = S.stock.find(x => x.variantId === variantId && x.location === location);
  return s ? (s.quantity || 0) : 0;
}
function stockHintText(variantId) {
  return `উপলব্ধ — ফ্যাক্টরি: ${formatQty(stockAt(variantId, "factory"))} · গোডাউন: ${formatQty(stockAt(variantId, "godown"))}`;
}
// Two-level "ডিজাইন" + "ধরন (কোয়ালিটি/কালার)" select pair, reused anywhere a
// specific variant needs picking (sale/production entry, stock transfer,
// order creation). idPrefix namespaces the element IDs so more than one of
// these can exist on the same page without colliding.
// ---- color-name -> swatch matching ----
// The owner/manager types a color as free text ("Red", "Gray White", "কালো")
// — this maps common color words (English + Bangla) to real hex values so
// the picker can show an actual color swatch instead of a photo. Compound
// names ("Gray White") match multiple words and render as a split two-tone
// swatch; anything unrecognized falls back to a neutral placeholder.
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
    return `<div class="field"><label>ডিজাইন</label><div class="vpicker-field" style="cursor:default;"><span class="vpicker-label">প্রথমে মালিককে টাইলসের ধরন যোগ করতে বলুন</span></div></div>`;
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
    ${simpleHeader("বিক্রি এন্ট্রি")}
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

/* ================= production entry ================= */
function renderProductionEntry() {
  return `
    ${simpleHeader("উৎপাদন এন্ট্রি")}
    <div class="paver" style="margin-bottom:16px;">
      ${variantSelectorHtml("prod")}
    </div>
    <div class="field"><label>পরিমাণ (পিস)</label><input type="number" id="prodQty" min="1"></div>
    <div class="field"><label>তারিখ</label><input type="date" id="prodDate" value="${ymd()}"></div>
    <button class="btn btn-primary" data-action="submit-production" ${VS.productionSubmitting ? "disabled" : ""}>${VS.productionSubmitting ? `<span class="spinner"></span>` : "উৎপাদন যোগ করুন"}</button>`;
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
      </div>`).join("") || emptyState(term ? `"${escapeHtml(VS.stockSearch)}" এর সাথে মিলে এমন কিছু পাওয়া যায়নি` : "কোনো টাইলসের ধরন নেই", "");
}
function renderStock() {
  return `${simpleHeader("বর্তমান স্টক")}
    <button class="btn btn-dark" data-action="open-transfer" style="margin-bottom:12px;">${Icon.transfer} স্টক ট্রান্সফার</button>
    <div class="vp-search" style="margin-bottom:16px;"><input type="text" id="stockSearchInput" value="${escapeHtml(VS.stockSearch)}" placeholder="টাইলসের নাম খুঁজুন..." autocomplete="off"></div>
    <div id="stockCardsWrap">${buildStockCardsHtml()}</div>`;
}

/* ================= attendance entry ================= */
// All staff a manager can salary/advance for: employees + managers together.
function allStaff() {
  return [
    ...S.employees.filter(e => e.active !== false).map(e => ({ id: e.id, name: e.name, monthlySalary: e.monthlySalary || 0, active: e.active, staffType: "employee" })),
    ...S.managers.filter(m => m.active !== false).map(m => ({ id: m.id, name: m.name, monthlySalary: m.monthlySalary || 0, active: m.active, staffType: "manager" })),
  ];
}
function savedAttendanceMap() {
  const list = VS.attDate === ymd() ? S.attendanceToday : VS.attDateData;
  const map = {};
  list.forEach(a => { map[a.employeeId] = a.status; });
  return map;
}
function renderAttendanceEntry() {
  const saved = savedAttendanceMap();
  if (VS.attDraft === null) VS.attDraft = { ...saved };
  const active = S.employees.filter(e => e.active !== false);
  const changed = active.some(e => (VS.attDraft[e.id] || "") !== (saved[e.id] || ""));
  const markedCount = active.filter(e => VS.attDraft[e.id]).length;
  const btn = (empId, status, label) => {
    const isActive = VS.attDraft[empId] === status;
    const cls = isActive ? (status === "present" ? "btn-success" : status === "absent" ? "btn-danger" : "btn-dark") : "btn-ghost";
    return `<button class="btn btn-sm ${cls}" style="flex:1;" data-action="mark-att" data-id="${empId}|${status}">${label}</button>`;
  };
  return `${simpleHeader("হাজিরা এন্ট্রি")}
    <input type="date" id="attDateInput" value="${VS.attDate}" style="width:100%; height:44px; border-radius:10px; border:1.5px solid var(--line); background:var(--card); padding:0 13px; margin-bottom:16px;">
    <div class="row-list" style="margin-bottom:16px;">
      ${active.map(e => `
        <div class="paver" style="padding:13px;">
          <div style="font-weight:700; font-size:13.5px; margin-bottom:10px;">${escapeHtml(e.name)}${(VS.attDraft[e.id] || "") !== (saved[e.id] || "") ? ' <span class="badge baki">অসংরক্ষিত</span>' : ""}</div>
          <div class="btn-block-row">
            ${btn(e.id, "present", "উপস্থিত")}
            ${btn(e.id, "absent", "অনুপস্থিত")}
            ${btn(e.id, "leave", "ছুটি")}
          </div>
        </div>`).join("") || emptyState("এখনো কোনো শ্রমিক যোগ করা হয়নি", "মালিককে যোগ করতে বলুন")}
    </div>
    ${active.length ? `
    <button class="btn btn-primary" data-action="submit-attendance" ${(!markedCount || !changed || VS.attSubmitting) ? "disabled" : ""} style="width:100%;">${VS.attSubmitting ? `<span class="spinner"></span>` : `জমা দিন (${formatQty(markedCount)}/${formatQty(active.length)} জন মার্ক করা)`}</button>
    <p class="muted center" style="margin-top:8px; font-size:11.5px;">জমা দিলে মালিকের কাছে নোটিফিকেশন যাবে। পরে ভুল সংশোধন করে আবার জমা দেওয়া যাবে।</p>` : ""}`;
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
  return `${simpleHeader("অর্ডার")}
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

/* ================= salary ================= */
function renderSalary() {
  const total = S.salaries.reduce((a, s) => a + (s.amount || 0), 0);
  const paid = S.salaries.filter(s => s.paid).reduce((a, s) => a + (s.amount || 0), 0);
  const totalAdvance = S.advances.reduce((a, adv) => a + (adv.amount || 0), 0);
  return `${simpleHeader("বেতন")}
    <input type="month" id="salaryMonthInput" value="${VS.salaryMonth}" style="width:100%; height:44px; border-radius:10px; border:1.5px solid var(--line); background:var(--card); padding:0 13px; margin-bottom:14px;">
    <div class="stat-row" style="margin-bottom:14px;">
      <div class="paver stat-card"><div class="s-label">মোট বেতন</div><div class="s-value">${formatMoney(total)}</div></div>
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
        <div class="paver row-item" data-action="download-payslip" data-id="${s.id}" style="align-items:flex-start;">
          <div class="r-icon">${Icon.wallet}</div>
          <div class="r-body">
            <div class="r-title">${escapeHtml(s.employeeName)} <span class="badge ${s.paid ? "paid" : "due"}">${s.paid ? "পরিশোধিত" : "বকেয়া"}</span></div>
            <div class="r-sub" style="margin-top:3px;">মূল ${formatMoney(s.baseAmount != null ? s.baseAmount : s.amount)}${s.advanceAmount ? ` · অগ্রিম -${formatMoney(s.advanceAmount)}` : ""} · প্রদেয় <b>${formatMoney(s.amount)}</b></div>
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
        </div>`).join("") || emptyState("এই মাসে কোনো অগ্রিম নেওয়া হয়নি")}
    </div>`;
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
  return `${simpleHeader("অনলাইন অর্ডার")}
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
      <p class="muted" style="margin-bottom:14px; line-height:1.6;">গ্রহণ করলে এটা সাধারণ অর্ডার তালিকায় "পেন্ডিং" অবস্থায় যোগ হবে — সেখান থেকে দাম ঠিক করে ডেলিভারি করতে পারবেন। মালিককেও জানানো হবে।</p>
      <div class="field" style="margin-bottom:0;"><label>ডেলিভারি কবে দিতে হবে</label><input type="date" name="dueDate" value="${ymd()}" required></div>`,
    submitText: "গ্রহণ করুন",
    onSubmit: async (data, close) => {
      await convertOnlineOrder(o, { dueDate: data.dueDate, byUid: S.profile.id, byName: S.profile.name, byRole: "manager" });
      showToast("অর্ডার গৃহীত হয়েছে", "success"); close();
    }
  });
}

/* ================= feedback sheet ================= */
function openFeedbackSheet() {
  formSheet({
    title: "মালিককে ফিডব্যাক পাঠান",
    bodyHtml: `<div class="field"><label>বার্তা</label><textarea name="message" required placeholder="যা জানাতে চান লিখুন..."></textarea></div>`,
    submitText: "পাঠিয়ে দিন",
    onSubmit: async (data, close) => {
      await sendFeedback({ message: data.message, managerId: S.profile.id, managerName: S.profile.name });
      showToast("ফিডব্যাক পাঠানো হয়েছে", "success"); close();
    }
  });
}

/* ================= after-render wiring ================= */
function afterRender() {
  if (VS.view === "dashboard") {
    viewEl.querySelectorAll("[data-count]").forEach(el => {
      countUpEl(el, Number(el.dataset.count));
    });
    requestAnimationFrame(() => {
      viewEl.querySelectorAll(".dash-stk-f, .dash-stk-g, .dash-share-bar > div").forEach(el => {
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
  if (VS.view === "salary") {
    const monthInput = document.getElementById("salaryMonthInput");
    if (monthInput) {
      monthInput.addEventListener("change", (e) => {
        if (e.target.value) { watchSalaryMonth(e.target.value); render(); }
      });
    }
  }
  if (VS.view === "orders" && VS.orderMode === "create") {
    wireVariantCascade("order");
  }
  if (VS.view === "sale") {
    wireVariantCascade("line");
  }
  if (VS.view === "production") {
    wireVariantCascade("prod");
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
  if (VS.view === "sale" && VS.salePay === "baki" && !VS.selectedCustomer) {
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
  if (VS.view === "attendance") {
    document.getElementById("attDateInput").addEventListener("change", (e) => {
      VS.attDate = e.target.value;
      VS.attDraft = null;
      loadAttendanceForDate(VS.attDate);
    });
  }
}

/* ================= actions ================= */
async function handleAction(action, id) {
  switch (action) {
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

    case "submit-production": {
      if (VS.productionSubmitting) return;
      const variantEl = document.getElementById("prodVariant");
      const qtyEl = document.getElementById("prodQty");
      const dateEl = document.getElementById("prodDate");
      if (!variantEl || !variantEl.dataset.value) { showToast("টাইলসের ধরন নির্বাচন করুন", "error"); return; }
      const quantity = Number(qtyEl.value);
      if (!quantity || quantity <= 0) { showToast("সঠিক পরিমাণ দিন", "error"); return; }
      const v = S.variants.find(x => x.id === variantEl.dataset.value);
      if (!v) { showToast("সঠিক ধরন নির্বাচন করুন", "error"); return; }
      const design = designOf(v.tileTypeId);
      const label = variantLabel(v.tileTypeName, design ? design.quality : "", v.color);
      const dateVal = dateEl.value;

      const dup = VS.lastProduction;
      if (dup && dup.variantId === v.id && dup.quantity === quantity && (Date.now() - dup.at) < 10 * 60 * 1000) {
        const proceed = await confirmDialog({
          title: "একই এন্ট্রি আবার?",
          message: `আপনি একটু আগেই ${escapeHtml(label)} — ${formatQty(quantity)} পিস উৎপাদন এন্ট্রি করেছেন। আপনি কি সত্যিই আবার একই এন্ট্রি করতে চান?`,
          okText: "হ্যাঁ, আবার করুন", cancelText: "না, বাতিল করুন"
        });
        if (!proceed) return;
      }

      VS.productionSubmitting = true;
      render();
      try {
        await createProduction({
          variantId: v.id, tileTypeId: v.tileTypeId, tileTypeName: v.tileTypeName, quality: design ? design.quality : "", color: v.color, quantity,
          managerId: S.profile.id, managerName: S.profile.name,
          date: dateVal ? new Date(dateVal) : new Date()
        });
        VS.lastProduction = { variantId: v.id, quantity, at: Date.now() };
        showToast("উৎপাদন যোগ হয়েছে", "success");
      } finally {
        VS.productionSubmitting = false;
        render();
      }
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
              qty, byUid: S.profile.id, byName: S.profile.name, byRole: "manager"
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
          byUid: S.profile.id, byName: S.profile.name, byRole: "manager"
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

    case "generate-salaries": {
      const ok = await confirmDialog({ title: "এই মাসের বেতন তৈরি করবেন?", message: `${VS.salaryMonth} মাসের জন্য সকল সক্রিয় শ্রমিক ও ম্যানেজারের বেতন এন্ট্রি তৈরি হবে (অগ্রিম বাদ দিয়ে)। মালিককে জানানো হবে।`, okText: "তৈরি করুন" });
      if (ok) {
        await generateMonthSalaries(VS.salaryMonth, allStaff(), S.advances, "manager", S.profile.id, S.profile.name);
        showToast("বেতন তৈরি হয়েছে, মালিককে জানানো হয়েছে", "success");
      }
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
              byUid: S.profile.id, byName: S.profile.name, byRole: "manager"
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

    case "mark-att": {
      const [empId, status] = id.split("|");
      if (!VS.attDraft) VS.attDraft = savedAttendanceMap();
      VS.attDraft[empId] = status;
      render();
      break;
    }

    case "submit-attendance": {
      if (VS.attSubmitting || !VS.attDraft) return;
      const active = S.employees.filter(e => e.active !== false);
      const entries = active
        .filter(e => VS.attDraft[e.id])
        .map(e => ({ employeeId: e.id, employeeName: e.name, status: VS.attDraft[e.id] }));
      if (!entries.length) return;
      VS.attSubmitting = true;
      render();
      try {
        await submitAttendance({ date: VS.attDate, entries, managerId: S.profile.id, managerName: S.profile.name });
        showToast("হাজিরা জমা হয়েছে, মালিককে জানানো হয়েছে", "success");
        if (VS.attDate !== ymd()) await loadAttendanceForDate(VS.attDate);
      } finally {
        VS.attSubmitting = false;
        render();
      }
      break;
    }

    case "view-memo": {
      const sale = S.sales.find(s => s.id === id);
      if (sale) showMemo(sale, S.shopInfo);
      break;
    }

    default:
      if (action.startsWith("nav:")) navTo(action.slice(4));
  }
}
