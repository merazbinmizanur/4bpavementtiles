// ============================================================
// 4B PAVEMENT TILES — sales memo (image / PDF export)
// ============================================================
import { formatMoney, formatQty, formatDateTimeBN, loadScript, showToast, openOverlay, closeOverlay, escapeHtml } from "./utils.js";

const H2C_SRC = "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";
const JSPDF_SRC = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";

export function showMemo(sale, shopInfo = {}) {
  const overlay = document.createElement("div");
  overlay.className = "overlay";
  const dateObj = sale.date?.toDate ? sale.date.toDate()
    : (sale.date instanceof Date ? sale.date
    : (sale.createdAt?.toDate ? sale.createdAt.toDate() : new Date()));

  const rowsHtml = sale.items.map(it => `
    <tr>
      <td>${escapeHtml(it.tileTypeName)}</td>
      <td style="text-align:center;">${formatQty(it.quantity)}</td>
      <td style="text-align:right;">${formatMoney(it.unitPrice)}</td>
      <td style="text-align:right;">${formatMoney(it.unitPrice * it.quantity)}</td>
    </tr>`).join("");

  overlay.innerHTML = `
    <div class="sheet" style="max-width:460px; padding:0 0 22px;">
      <div class="sheet-handle"></div>
      <div class="memo" id="memoCapture">
        <div class="memo-head">
          <b>${escapeHtml(shopInfo.name || "4B PAVEMENT TILES")}</b>
          <span>${shopInfo.address ? escapeHtml(shopInfo.address) + " · " : ""}${shopInfo.phone ? "ফোনঃ " + escapeHtml(shopInfo.phone) : ""}</span>
        </div>
        <div class="memo-row"><span>মেমো নং</span><b>#${sale.id.slice(-6).toUpperCase()}</b></div>
        <div class="memo-row"><span>তারিখ</span><span>${formatDateTimeBN(dateObj)}</span></div>
        <div class="memo-row"><span>স্থান</span><span>${sale.location === "factory" ? "ফ্যাক্টরি" : "গোডাউন"}</span></div>
        ${sale.customerName ? `<div class="memo-row"><span>ক্রেতা</span><span>${escapeHtml(sale.customerName)}${sale.customerPhone ? " · " + escapeHtml(sale.customerPhone) : ""}</span></div>` : ""}
        <div class="memo-row"><span>পেমেন্ট</span><span>${sale.paymentType === "cash" ? "নগদ" : "বাকি"}</span></div>
        <table>
          <thead><tr><th>টাইলস</th><th style="text-align:center;">পরিমাণ</th><th style="text-align:right;">দর</th><th style="text-align:right;">মোট</th></tr></thead>
          <tbody>${rowsHtml}</tbody>
        </table>
        <div class="m-total"><span>সর্বমোট</span><span>${formatMoney(sale.total)}</span></div>
        <div class="memo-row" style="margin-top:14px; justify-content:center; color:var(--ink-faint);"><span>বিক্রেতা: ${escapeHtml(sale.managerName || "")}</span></div>
      </div>
      <div style="padding:16px 18px 0;">
        <div class="btn-block-row">
          <button class="btn btn-dark" id="memoSaveImg">ছবি হিসেবে সেইভ</button>
          <button class="btn btn-ghost" id="memoSavePdf">PDF ডাউনলোড</button>
        </div>
        <button class="btn btn-primary" id="memoClose" style="margin-top:10px;">বন্ধ করুন</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  requestAnimationFrame(() => openOverlay(overlay));

  const cleanup = () => {
    closeOverlay(overlay);
    setTimeout(() => overlay.remove(), 250);
  };
  overlay.addEventListener("click", (e) => { if (e.target === overlay) cleanup(); });
  overlay.querySelector("#memoClose").addEventListener("click", cleanup);

  overlay.querySelector("#memoSaveImg").addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    const original = btn.textContent;
    btn.innerHTML = `<span class="spinner"></span>`;
    try {
      await loadScript(H2C_SRC);
      const node = overlay.querySelector("#memoCapture");
      if (document.fonts && document.fonts.ready) { await document.fonts.ready; }
      const canvas = await window.html2canvas(node, { scale: 2.5, backgroundColor: "#ffffff" });
      const link = document.createElement("a");
      link.download = `4B-Memo-${sale.id.slice(-6)}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
      showToast("মেমোর ছবি সেইভ হয়েছে", "success");
    } catch (err) {
      showToast("ছবি তৈরি করা যায়নি, আবার চেষ্টা করুন", "error");
    } finally {
      btn.textContent = original;
    }
  });

  overlay.querySelector("#memoSavePdf").addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    const original = btn.textContent;
    btn.innerHTML = `<span class="spinner"></span>`;
    try {
      await loadScript(H2C_SRC);
      await loadScript(JSPDF_SRC);
      const node = overlay.querySelector("#memoCapture");
      if (document.fonts && document.fonts.ready) { await document.fonts.ready; }
      const canvas = await window.html2canvas(node, { scale: 2.5, backgroundColor: "#ffffff" });
      const { jsPDF } = window.jspdf;
      const imgData = canvas.toDataURL("image/png");
      const pdfWidth = 210;
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      const pdf = new jsPDF({ unit: "mm", format: [pdfWidth, pdfHeight] });
      pdf.addImage(imgData, "PNG", 0, 0, pdfWidth, pdfHeight);
      pdf.save(`4B-Memo-${sale.id.slice(-6)}.pdf`);
      showToast("PDF ডাউনলোড হয়েছে", "success");
    } catch (err) {
      showToast("PDF তৈরি করা যায়নি, আবার চেষ্টা করুন", "error");
    } finally {
      btn.textContent = original;
    }
  });
}

export function showPayslip(salary, shopInfo = {}, monthLabel = "") {
  const overlay = document.createElement("div");
  overlay.className = "overlay";
  const base = salary.baseAmount != null ? salary.baseAmount : salary.amount;
  const advance = salary.advanceAmount || 0;

  overlay.innerHTML = `
    <div class="sheet" style="max-width:460px; padding:0 0 22px;">
      <div class="sheet-handle"></div>
      <div class="memo" id="payslipCapture">
        <div class="memo-head">
          <b>${escapeHtml(shopInfo.name || "4B PAVEMENT TILES")}</b>
          <span>${shopInfo.address ? escapeHtml(shopInfo.address) + " · " : ""}${shopInfo.phone ? "ফোনঃ " + escapeHtml(shopInfo.phone) : ""}</span>
        </div>
        <div class="memo-row" style="justify-content:center; font-family:var(--font-display); font-size:15px; margin-bottom:8px;"><span>বেতন স্লিপ — ${escapeHtml(monthLabel)}</span></div>
        <div class="memo-row"><span>কর্মচারী</span><b>${escapeHtml(salary.employeeName)}</b></div>
        <div class="memo-row"><span>মূল বেতন</span><span>${formatMoney(base)}</span></div>
        ${advance ? `<div class="memo-row"><span>অগ্রিম বাদ</span><span>-${formatMoney(advance)}</span></div>` : ""}
        <div class="memo-row"><span>অবস্থা</span><span>${salary.paid ? "পরিশোধিত" : "বকেয়া"}</span></div>
        <div class="m-total"><span>মোট প্রদেয়</span><span>${formatMoney(salary.amount)}</span></div>
      </div>
      <div style="padding:16px 18px 0;">
        <div class="btn-block-row">
          <button class="btn btn-dark" id="pSaveImg">ছবি হিসেবে সেইভ</button>
          <button class="btn btn-ghost" id="pSavePdf">PDF ডাউনলোড</button>
        </div>
        <button class="btn btn-primary" id="pClose" style="margin-top:10px;">বন্ধ করুন</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  requestAnimationFrame(() => openOverlay(overlay));
  const cleanup = () => { closeOverlay(overlay); setTimeout(() => overlay.remove(), 250); };
  overlay.addEventListener("click", (e) => { if (e.target === overlay) cleanup(); });
  overlay.querySelector("#pClose").addEventListener("click", cleanup);

  const fname = `4B-Payslip-${(salary.employeeName || "").replace(/\s+/g, "")}-${monthLabel}`;
  overlay.querySelector("#pSaveImg").addEventListener("click", async (e) => {
    const btn = e.currentTarget; const original = btn.textContent;
    btn.innerHTML = `<span class="spinner"></span>`;
    try {
      await loadScript(H2C_SRC);
      if (document.fonts && document.fonts.ready) { await document.fonts.ready; }
      const canvas = await window.html2canvas(overlay.querySelector("#payslipCapture"), { scale: 2.5, backgroundColor: "#ffffff" });
      const link = document.createElement("a");
      link.download = `${fname}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
      showToast("ছবি সেইভ হয়েছে", "success");
    } catch (err) {
      showToast("ছবি তৈরি করা যায়নি, আবার চেষ্টা করুন", "error");
    } finally { btn.textContent = original; }
  });
  overlay.querySelector("#pSavePdf").addEventListener("click", async (e) => {
    const btn = e.currentTarget; const original = btn.textContent;
    btn.innerHTML = `<span class="spinner"></span>`;
    try {
      await loadScript(H2C_SRC);
      await loadScript(JSPDF_SRC);
      if (document.fonts && document.fonts.ready) { await document.fonts.ready; }
      const canvas = await window.html2canvas(overlay.querySelector("#payslipCapture"), { scale: 2.5, backgroundColor: "#ffffff" });
      const { jsPDF } = window.jspdf;
      const imgData = canvas.toDataURL("image/png");
      const pdfWidth = 210;
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      const pdf = new jsPDF({ unit: "mm", format: [pdfWidth, pdfHeight] });
      pdf.addImage(imgData, "PNG", 0, 0, pdfWidth, pdfHeight);
      pdf.save(`${fname}.pdf`);
      showToast("PDF ডাউনলোড হয়েছে", "success");
    } catch (err) {
      showToast("PDF তৈরি করা যায়নি, আবার চেষ্টা করুন", "error");
    } finally { btn.textContent = original; }
  });
}

export function showSalarySheet(salaries, monthLabel, shopInfo = {}) {
  const overlay = document.createElement("div");
  overlay.className = "overlay";
  const rows = salaries.map(s => `
    <tr>
      <td>${escapeHtml(s.employeeName)}</td>
      <td style="text-align:right;">${formatMoney(s.baseAmount != null ? s.baseAmount : s.amount)}</td>
      <td style="text-align:right;">${s.advanceAmount ? "-" + formatMoney(s.advanceAmount) : "—"}</td>
      <td style="text-align:right;">${formatMoney(s.amount)}</td>
      <td style="text-align:center;">${s.paid ? "✓" : "বকেয়া"}</td>
    </tr>`).join("");
  const totalBase = salaries.reduce((a, s) => a + (s.baseAmount != null ? s.baseAmount : s.amount), 0);
  const totalAdvance = salaries.reduce((a, s) => a + (s.advanceAmount || 0), 0);
  const totalNet = salaries.reduce((a, s) => a + (s.amount || 0), 0);

  overlay.innerHTML = `
    <div class="sheet" style="max-width:520px; padding:0 0 22px;">
      <div class="sheet-handle"></div>
      <div class="memo" id="salarySheetCapture">
        <div class="memo-head">
          <b>${escapeHtml(shopInfo.name || "4B PAVEMENT TILES")}</b>
          <span>${shopInfo.address ? escapeHtml(shopInfo.address) + " · " : ""}${shopInfo.phone ? "ফোনঃ " + escapeHtml(shopInfo.phone) : ""}</span>
        </div>
        <div class="memo-row" style="justify-content:center; font-family:var(--font-display); font-size:15px; margin-bottom:4px;"><span>মাসিক বেতন শীট — ${escapeHtml(monthLabel)}</span></div>
        <table>
          <thead><tr><th>কর্মচারী</th><th style="text-align:right;">মূল বেতন</th><th style="text-align:right;">অগ্রিম</th><th style="text-align:right;">প্রদেয়</th><th style="text-align:center;">অবস্থা</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <div class="m-total"><span>সর্বমোট প্রদেয়</span><span>${formatMoney(totalNet)}</span></div>
        <div class="memo-row" style="color:var(--ink-faint);"><span>মূল বেতন সর্বমোট: ${formatMoney(totalBase)}</span><span>অগ্রিম সর্বমোট: ${formatMoney(totalAdvance)}</span></div>
      </div>
      <div style="padding:16px 18px 0;">
        <div class="btn-block-row">
          <button class="btn btn-dark" id="sSaveImg">ছবি হিসেবে সেইভ</button>
          <button class="btn btn-ghost" id="sSavePdf">PDF ডাউনলোড</button>
        </div>
        <button class="btn btn-primary" id="sClose" style="margin-top:10px;">বন্ধ করুন</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  requestAnimationFrame(() => openOverlay(overlay));
  const cleanup = () => { closeOverlay(overlay); setTimeout(() => overlay.remove(), 250); };
  overlay.addEventListener("click", (e) => { if (e.target === overlay) cleanup(); });
  overlay.querySelector("#sClose").addEventListener("click", cleanup);

  const fname = `4B-Salary-Sheet-${monthLabel}`;
  overlay.querySelector("#sSaveImg").addEventListener("click", async (e) => {
    const btn = e.currentTarget; const original = btn.textContent;
    btn.innerHTML = `<span class="spinner"></span>`;
    try {
      await loadScript(H2C_SRC);
      if (document.fonts && document.fonts.ready) { await document.fonts.ready; }
      const canvas = await window.html2canvas(overlay.querySelector("#salarySheetCapture"), { scale: 2.5, backgroundColor: "#ffffff" });
      const link = document.createElement("a");
      link.download = `${fname}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
      showToast("ছবি সেইভ হয়েছে", "success");
    } catch (err) {
      showToast("ছবি তৈরি করা যায়নি, আবার চেষ্টা করুন", "error");
    } finally { btn.textContent = original; }
  });
  overlay.querySelector("#sSavePdf").addEventListener("click", async (e) => {
    const btn = e.currentTarget; const original = btn.textContent;
    btn.innerHTML = `<span class="spinner"></span>`;
    try {
      await loadScript(H2C_SRC);
      await loadScript(JSPDF_SRC);
      if (document.fonts && document.fonts.ready) { await document.fonts.ready; }
      const canvas = await window.html2canvas(overlay.querySelector("#salarySheetCapture"), { scale: 2.5, backgroundColor: "#ffffff" });
      const { jsPDF } = window.jspdf;
      const imgData = canvas.toDataURL("image/png");
      const pdfWidth = 210;
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      const pdf = new jsPDF({ unit: "mm", format: [pdfWidth, pdfHeight] });
      pdf.addImage(imgData, "PNG", 0, 0, pdfWidth, pdfHeight);
      pdf.save(`${fname}.pdf`);
      showToast("PDF ডাউনলোড হয়েছে", "success");
    } catch (err) {
      showToast("PDF তৈরি করা যায়নি, আবার চেষ্টা করুন", "error");
    } finally { btn.textContent = original; }
  });
}
