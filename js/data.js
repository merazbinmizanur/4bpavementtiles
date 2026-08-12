// ============================================================
// 4B PAVEMENT TILES — Firestore data-access layer
// Shared by owner.js and manager.js so both panels talk to the
// same collections the same way.
// ============================================================
import { db, getSecondaryAuth } from "./firebase-config.js";
import {
  createUserWithEmailAndPassword, signOut as secondarySignOut
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";
import {
  collection, doc, addDoc, setDoc, updateDoc, deleteDoc,
  onSnapshot, query, where, orderBy, limit as qLimit,
  serverTimestamp, runTransaction, increment, getDoc, getDocs, writeBatch
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";
import { ymd } from "./utils.js";

/* ================= tile types (designs) ================= */
// A "tile type" is a design (e.g. "8Bit") with one fixed size. Quality and
// color live one level down, as tileVariants — see below. Every design
// always has at least one variant (auto-created here) so every stock/sale/
// production flow can uniformly reference a variantId, never a bare design.
export function subscribeTileTypes(cb) {
  const q = query(collection(db, "tileTypes"), orderBy("name"));
  return onSnapshot(q, snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}
export async function addTileType(name, size, quality) {
  const trimmedName = name.trim();
  const ref = await addDoc(collection(db, "tileTypes"), {
    name: trimmedName, size: (size || "").trim(), quality: (quality || "").trim(), createdAt: serverTimestamp()
  });
  await addDoc(collection(db, "tileVariants"), {
    tileTypeId: ref.id, tileTypeName: trimmedName, color: "", soldCount: 0, createdAt: serverTimestamp()
  });
  return ref.id;
}
export function updateTileType(id, data) {
  return updateDoc(doc(db, "tileTypes", id), data);
}
// Deleting a design also deletes all its variants — otherwise they'd be
// orphaned (still holding stock references to a design that no longer exists).
export async function deleteTileType(id) {
  const variantSnap = await getDocs(query(collection(db, "tileVariants"), where("tileTypeId", "==", id)));
  const batch = writeBatch(db);
  variantSnap.docs.forEach(d => batch.delete(d.ref));
  batch.delete(doc(db, "tileTypes", id));
  await batch.commit();
}

/* ================= tile variants (quality × color, per design) ================= */
export function subscribeVariants(cb) {
  const q = query(collection(db, "tileVariants"), orderBy("tileTypeName"));
  return onSnapshot(q, snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}
export function addVariant({ tileTypeId, tileTypeName, color }) {
  return addDoc(collection(db, "tileVariants"), {
    tileTypeId, tileTypeName, color: (color || "").trim(),
    soldCount: 0, createdAt: serverTimestamp()
  });
}
export function updateVariant(id, data) {
  return updateDoc(doc(db, "tileVariants", id), data);
}
export function deleteVariant(id) {
  return deleteDoc(doc(db, "tileVariants", id));
}
// Consistent "8Bit · Premium · Black" style label used anywhere a variant
// needs to be shown as one line of text (stock hints, shortfall dialogs,
// notifications). Blank quality/color are simply skipped.
export function variantLabel(name, quality, color) {
  const bits = [name];
  if (quality) bits.push(quality);
  if (color) bits.push(color);
  return bits.join(" · ");
}

/* ================= stock (keyed by location + variant) ================= */
const stockId = (location, variantId) => `${location}__${variantId}`;

export function subscribeStock(cb) {
  return onSnapshot(collection(db, "stock"), snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}

export async function transferStock({ fromLocation, toLocation, variantId, tileTypeId, tileTypeName, quality, color, qty, byUid, byName, byRole }) {
  if (fromLocation === toLocation) throw new Error("same-location");
  const label = variantLabel(tileTypeName, quality, color);
  const fromRef = doc(db, "stock", stockId(fromLocation, variantId));
  const toRef = doc(db, "stock", stockId(toLocation, variantId));
  await runTransaction(db, async (tx) => {
    const fromSnap = await tx.get(fromRef);
    const have = fromSnap.exists() ? (fromSnap.data().quantity || 0) : 0;
    if (have < qty) {
      throw Object.assign(new Error("insufficient-stock"), { shortfalls: [{ tileTypeName: label, have, need: qty }] });
    }
    tx.set(fromRef, {
      location: fromLocation, variantId, tileTypeId, tileTypeName, quality: quality || "", color: color || "",
      quantity: increment(-qty), updatedAt: serverTimestamp()
    }, { merge: true });
    tx.set(toRef, {
      location: toLocation, variantId, tileTypeId, tileTypeName, quality: quality || "", color: color || "",
      quantity: increment(qty), updatedAt: serverTimestamp()
    }, { merge: true });
  });
  // The core operation (stock quantities) is already committed above via the
  // atomic transaction. The audit log below is a secondary record — its
  // failure must never make an already-successful transfer look failed.
  try {
    await addDoc(collection(db, "stockTransfers"), {
      fromLocation, toLocation, variantId, tileTypeId, tileTypeName, quality: quality || "", color: color || "",
      qty, byUid, byName, createdAt: serverTimestamp()
    });
  } catch (e) {
    console.error("stock transfer log write failed (ignored):", e);
  }
  if (byRole === "manager") {
    await pushNotification({ type: "stock", tileTypeName: label, qty, fromLocation, toLocation, managerId: byUid, managerName: byName });
  }
}

/* ================= sales ================= */
// items: [{ variantId, tileTypeId, tileTypeName, quality, color, quantity, unitPrice }]
export async function createSale({ items, location, paymentType, customerId, customerName, customerPhone, total, managerId, managerName, date }) {
  const saleRef = doc(collection(db, "sales"));
  let finalCustomerId = customerId || null;

  await runTransaction(db, async (tx) => {
    // ---- reads first ---- (aggregate quantities per variant, in case the
    // cart has more than one line for the same variant — stock must be
    // checked against the COMBINED demand, not each line in isolation)
    const neededByVariant = {};
    items.forEach(it => { neededByVariant[it.variantId] = (neededByVariant[it.variantId] || 0) + it.quantity; });
    const variantIds = Object.keys(neededByVariant);
    const stockRefs = {};
    const haves = {};
    for (const vid of variantIds) {
      stockRefs[vid] = doc(db, "stock", stockId(location, vid));
      const snap = await tx.get(stockRefs[vid]);
      haves[vid] = snap.exists() ? (snap.data().quantity || 0) : 0;
    }

    let customerRef = null, customerSnap = null;
    if (paymentType === "baki") {
      if (!finalCustomerId) {
        customerRef = doc(collection(db, "customers"));
        finalCustomerId = customerRef.id;
      } else {
        customerRef = doc(db, "customers", finalCustomerId);
        customerSnap = await tx.get(customerRef);
      }
    }

    // ---- validate stock (before any writes — stock must never go negative) ----
    const shortfalls = variantIds
      .filter(vid => haves[vid] < neededByVariant[vid])
      .map(vid => {
        const it = items.find(x => x.variantId === vid) || {};
        return { tileTypeName: variantLabel(it.tileTypeName, it.quality, it.color), have: haves[vid], need: neededByVariant[vid] };
      });
    if (shortfalls.length) {
      throw Object.assign(new Error("insufficient-stock"), { shortfalls });
    }

    // ---- writes ----
    variantIds.forEach(vid => {
      const it = items.find(x => x.variantId === vid) || {};
      tx.set(stockRefs[vid], {
        location, variantId: vid, tileTypeId: it.tileTypeId, tileTypeName: it.tileTypeName,
        quality: it.quality || "", color: it.color || "",
        quantity: haves[vid] - neededByVariant[vid], updatedAt: serverTimestamp()
      }, { merge: true });
      // running sold-count at both levels — variant (for internal reporting)
      // and design (aggregate, powers the public shop's "সবচেয়ে বিক্রিত"
      // badge) — without ever exposing the sales collection itself.
      tx.set(doc(db, "tileVariants", vid), { soldCount: increment(neededByVariant[vid]) }, { merge: true });
      if (it.tileTypeId) {
        tx.set(doc(db, "tileTypes", it.tileTypeId), { soldCount: increment(neededByVariant[vid]) }, { merge: true });
      }
    });

    if (paymentType === "baki") {
      if (customerSnap && customerSnap.exists()) {
        tx.update(customerRef, { totalDue: increment(total), lastSaleAt: serverTimestamp() });
      } else {
        tx.set(customerRef, {
          name: customerName || "নাম নেই", phone: customerPhone || "",
          totalDue: total, createdAt: serverTimestamp(), lastSaleAt: serverTimestamp()
        }, { merge: true });
      }
    }

    tx.set(saleRef, {
      items, location, paymentType, total,
      customerId: finalCustomerId, customerName: customerName || null, customerPhone: customerPhone || null,
      managerId, managerName, date: date || serverTimestamp(), createdAt: serverTimestamp()
    });
  });

  await pushNotification({
    type: "sale", location, total, itemCount: items.length,
    managerId, managerName
  });
  return { id: saleRef.id, customerId: finalCustomerId };
}

export function subscribeSales(cb, { max = 100 } = {}) {
  const q = query(collection(db, "sales"), orderBy("createdAt", "desc"), qLimit(max));
  return onSnapshot(q, snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}

export async function deleteSale(sale) {
  await runTransaction(db, async (tx) => {
    const stockRefs = sale.items.map(it => doc(db, "stock", stockId(sale.location, it.variantId)));
    const stockSnaps = [];
    for (const ref of stockRefs) stockSnaps.push(await tx.get(ref));

    let customerRef = null;
    if (sale.paymentType === "baki" && sale.customerId) {
      customerRef = doc(db, "customers", sale.customerId);
    }

    sale.items.forEach((it, i) => {
      const have = stockSnaps[i].exists() ? (stockSnaps[i].data().quantity || 0) : 0;
      tx.set(stockRefs[i], {
        location: sale.location, variantId: it.variantId, tileTypeId: it.tileTypeId, tileTypeName: it.tileTypeName,
        quality: it.quality || "", color: it.color || "",
        quantity: have + it.quantity, updatedAt: serverTimestamp()
      }, { merge: true });
    });

    if (customerRef) tx.update(customerRef, { totalDue: increment(-sale.total) });
    tx.delete(doc(db, "sales", sale.id));
  });
}

/* ================= production ================= */
export async function createProduction({ variantId, tileTypeId, tileTypeName, quality, color, quantity, managerId, managerName, date }) {
  const prodRef = doc(collection(db, "production"));
  const stockRef = doc(db, "stock", stockId("factory", variantId));
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(stockRef);
    const have = snap.exists() ? (snap.data().quantity || 0) : 0;
    tx.set(stockRef, {
      location: "factory", variantId, tileTypeId, tileTypeName, quality: quality || "", color: color || "",
      quantity: have + quantity, updatedAt: serverTimestamp()
    }, { merge: true });
    tx.set(prodRef, {
      variantId, tileTypeId, tileTypeName, quality: quality || "", color: color || "", quantity, managerId, managerName,
      date: date || serverTimestamp(), createdAt: serverTimestamp()
    });
  });
  await pushNotification({ type: "production", tileTypeName: variantLabel(tileTypeName, quality, color), quantity, managerId, managerName });
  return prodRef.id;
}

export function subscribeProduction(cb, { max = 100 } = {}) {
  const q = query(collection(db, "production"), orderBy("createdAt", "desc"), qLimit(max));
  return onSnapshot(q, snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}

export async function deleteProduction(prod) {
  const stockRef = doc(db, "stock", stockId("factory", prod.variantId));
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(stockRef);
    const have = snap.exists() ? (snap.data().quantity || 0) : 0;
    if (have < prod.quantity) {
      throw Object.assign(new Error("insufficient-stock"), {
        shortfalls: [{ tileTypeName: variantLabel(prod.tileTypeName, prod.quality, prod.color), have, need: prod.quantity }]
      });
    }
    tx.set(stockRef, { quantity: have - prod.quantity, updatedAt: serverTimestamp() }, { merge: true });
    tx.delete(doc(db, "production", prod.id));
  });
}

/* ================= orders (field-collected bookings) ================= */
// items: [{ variantId, tileTypeId, tileTypeName, quality, color, quantity }]
// — no price yet; price is agreed at delivery time when the order becomes
// an actual sale.
export async function createOrder({ items, customerName, customerPhone, customerAddress, dueDate, note, byUid, byName, byRole }) {
  const ref = await addDoc(collection(db, "orders"), {
    items, customerName: customerName || "নাম নেই", customerPhone: customerPhone || "", customerAddress: customerAddress || "",
    dueDate: dueDate || "", note: note || "", status: "pending",
    createdBy: { uid: byUid, name: byName, role: byRole },
    createdAt: serverTimestamp(), updatedAt: serverTimestamp()
  });
  if (byRole === "manager") {
    await pushNotification({ type: "order", customerName: customerName || "নাম নেই", itemCount: items.length, managerId: byUid, managerName: byName });
  }
  return ref.id;
}
export function subscribeOrders(cb, { max = 200 } = {}) {
  const q = query(collection(db, "orders"), orderBy("createdAt", "desc"), qLimit(max));
  return onSnapshot(q, snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}
export function updateOrderStatus(id, status) {
  return updateDoc(doc(db, "orders", id), { status, updatedAt: serverTimestamp() });
}
export function deleteOrder(id) {
  return deleteDoc(doc(db, "orders", id));
}
// Converts an order into an actual sale (stock decrement + baki if applicable,
// reusing createSale's own insufficient-stock guard), then marks it delivered.
// pricedItems carry the same variantId/quality/color as the order's own items,
// with unitPrice added at this step.
export async function deliverOrder(order, { location, paymentType, pricedItems, managerId, managerName }) {
  const total = pricedItems.reduce((a, it) => a + it.quantity * it.unitPrice, 0);
  const result = await createSale({
    items: pricedItems, location, paymentType,
    customerId: null, customerName: order.customerName, customerPhone: order.customerPhone,
    total, managerId, managerName, date: new Date()
  });
  await updateDoc(doc(db, "orders", order.id), {
    status: "delivered", saleId: result.id, deliveredAt: serverTimestamp(), updatedAt: serverTimestamp()
  });
  return result;
}

/* ================= online orders (public shop, no-login customers) ================= */
// items: [{ variantId, tileTypeId, tileTypeName, quality, color, size, customSize, quantity }]
export async function createOnlineOrder({ items, customerName, customerPhone, customerAddress, note, paymentType, trxInfo }) {
  const ref = await addDoc(collection(db, "onlineOrders"), {
    items, customerName: customerName || "নাম নেই", customerPhone: customerPhone || "",
    customerAddress: customerAddress || "", note: note || "",
    paymentType: paymentType || "cod", trxInfo: trxInfo || "",
    status: "new", createdAt: serverTimestamp(), updatedAt: serverTimestamp()
  });
  try {
    await pushNotification({ type: "onlineOrder", customerName: customerName || "নাম নেই", itemCount: items.length, managerId: "", managerName: "" });
  } catch (e) { /* bell is best-effort — the order itself is already saved */ }
  return ref.id;
}
export function subscribeOnlineOrders(cb, { max = 200 } = {}) {
  const q = query(collection(db, "onlineOrders"), orderBy("createdAt", "desc"), qLimit(max));
  return onSnapshot(q, snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}
export function updateOnlineOrderStatus(id, status) {
  return updateDoc(doc(db, "onlineOrders", id), { status, updatedAt: serverTimestamp() });
}
export function deleteOnlineOrder(id) {
  return deleteDoc(doc(db, "onlineOrders", id));
}
// Accepts an online order: creates a regular order (entering the existing
// pending → producing → ready → delivered pipeline) and links it back.
export async function convertOnlineOrder(o, { dueDate, byUid, byName, byRole }) {
  const noteParts = [];
  if (o.note) noteParts.push(o.note);
  noteParts.push(o.paymentType === "advance" ? `অনলাইন অর্ডার · অ্যাডভান্স${o.trxInfo ? " · " + o.trxInfo : ""}` : "অনলাইন অর্ডার · ক্যাশ অন ডেলিভারি");
  const orderId = await createOrder({
    items: o.items.map(it => ({
      variantId: it.variantId, tileTypeId: it.tileTypeId,
      tileTypeName: it.customSize ? `${it.tileTypeName} (${it.customSize})` : it.tileTypeName,
      quality: it.quality || "", color: it.color || "",
      quantity: it.quantity
    })),
    customerName: o.customerName, customerPhone: o.customerPhone, customerAddress: o.customerAddress,
    dueDate, note: noteParts.join(" — "), byUid, byName, byRole
  });
  await updateDoc(doc(db, "onlineOrders", o.id), { status: "accepted", orderId, updatedAt: serverTimestamp() });
  return orderId;
}

// Public order-tracking lookups (exact-ID get only — see firestore.rules).
// A customer needs their own order's exact ID plus phone number; the phone
// check happens client-side after the fetch since a "get" rule can't compare
// against an unverified anonymous visitor's claimed phone number.
export async function trackOnlineOrder(id, phone) {
  const snap = await getDoc(doc(db, "onlineOrders", id));
  if (!snap.exists()) return null;
  const order = { id: snap.id, ...snap.data() };
  if ((order.customerPhone || "").replace(/\D/g, "") !== (phone || "").replace(/\D/g, "")) return null;
  let linkedOrder = null;
  if (order.orderId) {
    const osnap = await getDoc(doc(db, "orders", order.orderId));
    if (osnap.exists()) linkedOrder = { id: osnap.id, ...osnap.data() };
  }
  return { order, linkedOrder };
}

/* ================= customers / baki khata ================= */
export function subscribeCustomers(cb) {
  const q = query(collection(db, "customers"), orderBy("totalDue", "desc"));
  return onSnapshot(q, snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}

export async function searchCustomersByName(term) {
  const snap = await getDocs(collection(db, "customers"));
  const t = term.trim().toLowerCase();
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(c => c.name && c.name.toLowerCase().includes(t))
    .slice(0, 8);
}

export function addCustomer({ name, phone, openingDue }) {
  return addDoc(collection(db, "customers"), {
    name: name.trim(), phone: phone || "", totalDue: Number(openingDue) || 0, createdAt: serverTimestamp()
  });
}

export async function addPayment({ customerId, customerName, amount, managerId, managerName }) {
  const customerRef = doc(db, "customers", customerId);
  const payRef = doc(collection(db, "payments"));
  await runTransaction(db, async (tx) => {
    tx.update(customerRef, { totalDue: increment(-amount) });
    tx.set(payRef, { customerId, customerName, amount, managerId, managerName, createdAt: serverTimestamp() });
  });
  return payRef.id;
}

export async function getCustomerLedger(customerId) {
  const [salesSnap, paysSnap] = await Promise.all([
    getDocs(query(collection(db, "sales"), where("customerId", "==", customerId))),
    getDocs(query(collection(db, "payments"), where("customerId", "==", customerId)))
  ]);
  const sales = salesSnap.docs.map(d => ({ id: d.id, kind: "sale", ...d.data() }));
  const pays = paysSnap.docs.map(d => ({ id: d.id, kind: "payment", ...d.data() }));
  return [...sales, ...pays].sort((a, b) => {
    const ta = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
    const tb = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
    return tb - ta;
  });
}

/* ================= employees (factory workers, no login) ================= */
export function subscribeEmployees(cb) {
  const q = query(collection(db, "employees"), orderBy("name"));
  return onSnapshot(q, snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}
export function addEmployee({ name, phone, monthlySalary }) {
  return addDoc(collection(db, "employees"), {
    name: name.trim(), phone: phone || "", monthlySalary: Number(monthlySalary) || 0,
    active: true, createdAt: serverTimestamp()
  });
}
export function updateEmployee(id, data) {
  return updateDoc(doc(db, "employees", id), data);
}
export function setEmployeeActive(id, active) {
  return updateDoc(doc(db, "employees", id), { active });
}

/* ================= attendance ================= */
export function markAttendance({ employeeId, employeeName, date, status, managerId, managerName }) {
  const d = date || ymd();
  return setDoc(doc(db, "attendance", `${employeeId}_${d}`), {
    employeeId, employeeName, date: d, status, managerId, managerName, updatedAt: serverTimestamp()
  }, { merge: true });
}
export function subscribeAttendanceForDate(date, cb) {
  const q = query(collection(db, "attendance"), where("date", "==", date));
  return onSnapshot(q, snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}
export async function getAttendanceForDate(date) {
  const snap = await getDocs(query(collection(db, "attendance"), where("date", "==", date)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
export function deleteAttendance(id) {
  return deleteDoc(doc(db, "attendance", id));
}
// Saves a whole day's attendance in one batch, then notifies the owner.
// Every submission (including corrections/re-submissions) sends a fresh
// notification, so the owner has a log of each change.
export async function submitAttendance({ date, entries, managerId, managerName }) {
  const batch = writeBatch(db);
  entries.forEach(en => {
    batch.set(doc(db, "attendance", `${en.employeeId}_${date}`), {
      employeeId: en.employeeId, employeeName: en.employeeName, date, status: en.status,
      managerId, managerName, updatedAt: serverTimestamp()
    }, { merge: true });
  });
  await batch.commit();
  const counts = { present: 0, absent: 0, leave: 0 };
  entries.forEach(en => { counts[en.status] = (counts[en.status] || 0) + 1; });
  await pushNotification({
    type: "attendance", date,
    present: counts.present, absent: counts.absent, leave: counts.leave,
    total: entries.length, managerId, managerName
  });
}
export async function getAttendanceForMonth(monthStr) {
  const start = `${monthStr}-01`;
  const end = `${monthStr}-31`;
  const snap = await getDocs(query(
    collection(db, "attendance"), where("date", ">=", start), where("date", "<=", end)
  ));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
export async function getAttendanceForRange(startDate, endDate) {
  const snap = await getDocs(query(
    collection(db, "attendance"), where("date", ">=", startDate), where("date", "<=", endDate)
  ));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/* ================= advances (against monthly salary) ================= */
export async function addAdvance({ employeeId, employeeName, amount, date, monthlySalary, note, byUid, byName, byRole }) {
  const month = date.slice(0, 7);
  const existingSnap = await getDocs(query(
    collection(db, "advances"), where("employeeId", "==", employeeId), where("month", "==", month)
  ));
  const already = existingSnap.docs.reduce((a, d) => a + (d.data().amount || 0), 0);
  if (already + amount > (monthlySalary || 0)) {
    throw Object.assign(new Error("advance-limit"), { already, monthlySalary: monthlySalary || 0, requested: amount });
  }
  const ref = await addDoc(collection(db, "advances"), {
    employeeId, employeeName, amount, date, month, note: note || "",
    createdBy: { uid: byUid, name: byName, role: byRole }, createdAt: serverTimestamp()
  });
  if (byRole === "manager") {
    await pushNotification({ type: "advance", employeeName, amount, managerId: byUid, managerName: byName });
  }
  return ref.id;
}
export function subscribeAdvancesForMonth(month, cb) {
  const q = query(collection(db, "advances"), where("month", "==", month));
  return onSnapshot(q, snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}
export function deleteAdvance(id) {
  return deleteDoc(doc(db, "advances", id));
}

/* ================= salaries ================= */
export function subscribeSalaries(cb, month) {
  const q = query(collection(db, "salaries"), where("month", "==", month));
  return onSnapshot(q, snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}
// staffList: employees AND managers together (any person drawing a monthly
// salary). advances: this month's advance entries, auto-deducted from base.
// Already-paid entries are left untouched so a re-generate never overwrites a
// finalized, already-disbursed amount.
export async function generateMonthSalaries(monthStr, staffList, advances, byRole, byUid, byName) {
  const advanceByEmp = {};
  (advances || []).forEach(a => { advanceByEmp[a.employeeId] = (advanceByEmp[a.employeeId] || 0) + (a.amount || 0); });
  const existingSnap = await getDocs(query(collection(db, "salaries"), where("month", "==", monthStr)));
  const paidIds = new Set(existingSnap.docs.filter(d => d.data().paid).map(d => d.id));
  const activeStaff = staffList.filter(e => e.active !== false);
  const batch = writeBatch(db);
  activeStaff.forEach(emp => {
    const id = `${emp.id}_${monthStr}`;
    if (paidIds.has(id)) return;
    const base = emp.monthlySalary || 0;
    const advance = advanceByEmp[emp.id] || 0;
    const ref = doc(db, "salaries", id);
    batch.set(ref, {
      employeeId: emp.id, employeeName: emp.name, month: monthStr,
      staffType: emp.staffType || "employee",
      baseAmount: base, advanceAmount: advance, amount: Math.max(0, base - advance),
      paid: false, createdAt: serverTimestamp()
    }, { merge: true });
  });
  await batch.commit();
  if (byRole === "manager") {
    await pushNotification({ type: "salary", month: monthStr, count: activeStaff.length, managerId: byUid, managerName: byName });
  }
}
export function updateSalary(id, data) {
  return updateDoc(doc(db, "salaries", id), data);
}
export function markSalaryPaid(id, paid) {
  return updateDoc(doc(db, "salaries", id), { paid, paidDate: paid ? serverTimestamp() : null });
}

/* ================= feedback ================= */
export function sendFeedback({ message, managerId, managerName }) {
  return addDoc(collection(db, "feedback"), {
    message: message.trim(), managerId, managerName, read: false, createdAt: serverTimestamp()
  });
}
export function subscribeFeedback(cb) {
  const q = query(collection(db, "feedback"), orderBy("createdAt", "desc"), qLimit(100));
  return onSnapshot(q, snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}
export function markFeedbackRead(id, read = true) {
  return updateDoc(doc(db, "feedback", id), { read });
}

/* ================= notifications (manager action -> owner) ================= */
// Structured, not pre-formatted text — the UI decides how to phrase/localize each type.
// Never lets a notification-write failure (e.g. rules not yet published) surface as
// a failure of the actual sale/production/transfer that already succeeded.
async function pushNotification({ type, managerId, managerName, ...rest }) {
  try {
    await addDoc(collection(db, "notifications"), {
      type, managerId, managerName, ...rest, read: false, createdAt: serverTimestamp()
    });
  } catch (e) {
    console.error("notification push failed (ignored):", e);
  }
}
export function subscribeNotifications(cb, { max = 100 } = {}) {
  const q = query(collection(db, "notifications"), orderBy("createdAt", "desc"), qLimit(max));
  return onSnapshot(q, snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}
export function markNotificationRead(id) {
  return updateDoc(doc(db, "notifications", id), { read: true });
}
export function markAllNotificationsRead(ids) {
  if (!ids.length) return Promise.resolve();
  const batch = writeBatch(db);
  ids.forEach(id => batch.update(doc(db, "notifications", id), { read: true }));
  return batch.commit();
}

/* ================= managers (users with role='manager') ================= */
export function subscribeManagers(cb) {
  const q = query(collection(db, "users"), where("role", "==", "manager"));
  return onSnapshot(q, snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}

// Creates a brand-new manager login WITHOUT logging the owner out, using
// an isolated secondary Firebase App instance (see firebase-config.js).
export async function createManagerAccount({ name, phone, email, password, monthlySalary }) {
  const secondaryAuth = getSecondaryAuth();
  const cred = await createUserWithEmailAndPassword(secondaryAuth, email.trim(), password);
  const uid = cred.user.uid;
  await setDoc(doc(db, "users", uid), {
    name: name.trim(), phone: phone || "", email: email.trim(), role: "manager",
    monthlySalary: Number(monthlySalary) || 0,
    active: true, createdAt: serverTimestamp()
  });
  await secondarySignOut(secondaryAuth);
  return uid;
}
export function updateManager(uid, data) {
  return updateDoc(doc(db, "users", uid), data);
}
export function setManagerActive(uid, active) {
  return updateDoc(doc(db, "users", uid), { active });
}

/* ================= shop info (shown on the printed memo) ================= */
export function subscribeShopInfo(cb) {
  return onSnapshot(doc(db, "settings", "shop"), snap => cb(snap.exists() ? snap.data() : {}));
}
export function updateShopInfo(data) {
  return setDoc(doc(db, "settings", "shop"), data, { merge: true });
}

/* ================= full data export / wipe (owner "danger zone") ================= */
const ALL_BUSINESS_COLLECTIONS = [
  "sales", "production", "orders", "onlineOrders", "stock", "stockTransfers",
  "customers", "payments", "employees", "attendance", "salaries", "advances",
  "feedback", "notifications", "tileTypes", "tileVariants"
];

// Firestore Timestamps don't serialize to anything readable via plain
// JSON.stringify — turn them into ISO date strings so the exported file is
// actually useful as a human-readable backup.
function sanitizeForExport(value) {
  if (value && typeof value.toDate === "function") return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(sanitizeForExport);
  if (value && typeof value === "object") {
    const out = {};
    for (const k in value) out[k] = sanitizeForExport(value[k]);
    return out;
  }
  return value;
}

// Fetches every document in every business collection, plus managers/staff
// profiles and shop settings, as one plain JSON-safe object.
export async function exportAllData() {
  const out = {};
  for (const name of ALL_BUSINESS_COLLECTIONS) {
    const snap = await getDocs(collection(db, name));
    out[name] = snap.docs.map(d => sanitizeForExport({ id: d.id, ...d.data() }));
  }
  const usersSnap = await getDocs(collection(db, "users"));
  out.users = usersSnap.docs.map(d => sanitizeForExport({ id: d.id, ...d.data() }));
  const shopSnap = await getDoc(doc(db, "settings", "shop"));
  out.shopInfo = shopSnap.exists() ? sanitizeForExport(shopSnap.data()) : {};
  out.exportedAt = new Date().toISOString();
  return out;
}

async function deleteAllInCollection(name, excludeId) {
  const snap = await getDocs(collection(db, name));
  const ids = snap.docs.map(d => d.id).filter(id => id !== excludeId);
  for (let i = 0; i < ids.length; i += 450) {
    const chunk = ids.slice(i, i + 450);
    const batch = writeBatch(db);
    chunk.forEach(id => batch.delete(doc(db, name, id)));
    await batch.commit();
  }
}

// Wipes every business collection AND every other user's profile
// (managers) so they can no longer log in, but deliberately leaves the
// CALLING owner's own users/{ownerUid} doc untouched — that doc is what
// keeps them signed in and recognized as owner once the wipe finishes.
// Their Firebase Auth email/password entries themselves aren't touched
// (the client SDK can only delete the currently-signed-in account, never
// someone else's) — only their app profile/role, which is what actually
// gates access.
export async function wipeAllData(ownerUid) {
  for (const name of ALL_BUSINESS_COLLECTIONS) {
    await deleteAllInCollection(name);
  }
  await deleteAllInCollection("users", ownerUid);
  await deleteDoc(doc(db, "settings", "shop"));
}
