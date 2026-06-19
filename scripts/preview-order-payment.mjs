/**
 * Local preview of the order-link payment section in BOTH states, using
 * a 50% deposit example:
 *   - BEFORE deposit paid  (status Pending, nothing paid yet)
 *   - AFTER deposit paid    (status "Deposit paid", 50% down, balance left)
 *
 * Mirrors src/pages/c/order/[id].tsx (the top "Payment" stat + the
 * bottom Payment card). The deposit % is data-driven in the real page
 * (companies.deposit_percent); 50% is just the example Raj asked for.
 * Balance is due balance_due_days (default 7) BEFORE the event.
 *
 * Run: node scripts/preview-order-payment.mjs
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const primary = "#9333ea";
const secondary = "#ec4899";
const fmt = (n) => "R" + Number(n).toLocaleString("en-ZA", { maximumFractionDigits: 0 });

const total = 12000;
const depositPercent = 50;                 // companies.deposit_percent (example)
const deposit = Math.round(total * depositPercent / 100); // R6,000
const eventDate = "02 Jul 2026";
const balanceDueDate = "25 Jun 2026";      // event - balance_due_days (7)

// Renders one full "state" column: the headline stat strip + the
// Payment card, driven by how much has been paid so far.
function stateColumn(titleTag, paid) {
  const remaining = Math.max(0, total - paid);
  const ps = paid <= 0 ? "pending" : paid >= total ? "paid" : "partial";
  const chipText =
    ps === "paid" ? "Paid in full" :
    ps === "partial" ? "Deposit paid" : "Pending";
  const chipBg = ps === "pending" ? "#fef3c7" : "#dbeafe";
  const chipFg = ps === "pending" ? "#92400e" : "#1e40af";
  const chipBd = ps === "pending" ? "#fde68a" : "#bfdbfe";

  const pct = total > 0 && paid > 0 && paid < total ? Math.round(paid / total * 100) : null;
  const paidRowLabel = ps === "paid" ? "Paid in full"
    : paid > 0 ? `Deposit paid${pct != null ? ` (${pct}%)` : ""}` : "Amount paid";

  // Pay button: deposit first when nothing's down, balance when the
  // deposit has landed but money is still owing.
  const payLabel = paid <= 0 ? `Pay deposit ${fmt(deposit)} now` : `Pay ${fmt(remaining)} now`;
  const showPay = remaining > 0;

  return `
  <div class="col">
    <div class="coltag">${titleTag}</div>

    <!-- headline + top stats incl. Payment -->
    <div class="card"><div class="body">
      <div class="chip" style="background:${chipBg};color:${chipFg};border-color:${chipBd};">confirmed</div>
      <h2>Birthday Braai</h2>
      <p class="muted">Order #ORD-1042</p>
      <div class="statgrid">
        <div class="stat"><div class="lbl">In 12 days</div><div class="val">${eventDate}</div></div>
        <div class="stat"><div class="lbl">Guests</div><div class="val">80</div></div>
        <div class="stat"><div class="lbl">Total</div><div class="val">${fmt(total)}</div></div>
        <div class="stat"><div class="lbl">Payment</div><div class="val">${chipText}</div></div>
      </div>
    </div></div>

    <!-- Payment card (bottom of the page) -->
    <div class="card">
      <div class="ctitle"><span class="dot"></span> Payment</div>
      <div class="body" style="padding-top:14px;">
        <div class="row"><span class="due">Deposit ${paid > 0 ? "(paid)" : "(due)"}</span><span class="r ${paid > 0 ? "paid" : "due"}">${fmt(deposit)}</span></div>
        <div class="row"><span class="due">Balance (due ${balanceDueDate})</span><span class="r due">${fmt(total - deposit)}</span></div>

        <div class="divider">
          <div class="row"><span class="due">Order total</span><span class="r due">${fmt(total)}</span></div>
          <div class="row"><span class="due">${paidRowLabel}</span><span class="r ${paid > 0 ? "paid" : "due"}">${fmt(paid)}</span></div>
          <div class="row"><span class="due">${remaining > 0 ? "Remaining balance" : "Remaining"}</span><span class="r ${remaining === 0 && paid > 0 ? "paid" : "due"}">${fmt(remaining)}</span></div>
        </div>

        ${showPay ? `<a href="#" class="pay">${payLabel}</a>` : `<div class="settled">All settled - thank you</div>`}
        <p class="note">Deposit (${depositPercent}%) up front; balance due ${balanceDueDate}, before the event. Updates live as payments land.</p>
      </div>
    </div>
  </div>`;
}

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Order link payment - before & after</title>
<style>
  body{margin:0;background:linear-gradient(135deg,${primary}08,${secondary}08);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a;}
  .page{max-width:1040px;margin:0 auto;padding:24px 16px;}
  h1{font-size:20px;margin:0 0 4px;}
  .sub{color:#64748b;font-size:13px;margin:0 0 20px;}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:24px;align-items:start;}
  .coltag{font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#475569;margin-bottom:10px;}
  .card{background:#fff;border-radius:14px;box-shadow:0 10px 25px rgba(15,23,42,.08);margin-bottom:20px;overflow:hidden;}
  .card .body{padding:20px;}
  .chip{display:inline-block;font-size:12px;font-weight:600;padding:2px 10px;border-radius:999px;border:1px solid;margin-bottom:8px;}
  h2{font-size:22px;margin:0;font-weight:700;}
  .muted{color:#64748b;font-size:13px;margin:2px 0 0;}
  .statgrid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:18px;padding-top:18px;border-top:1px solid #f1f5f9;}
  .stat .lbl{font-size:11px;color:#64748b;margin-bottom:4px;}
  .stat .val{font-weight:600;font-size:14px;}
  .ctitle{font-size:16px;font-weight:600;display:flex;align-items:center;gap:8px;padding:18px 20px 0;}
  .dot{width:8px;height:8px;border-radius:50%;background:${primary};display:inline-block;}
  .row{display:flex;justify-content:space-between;align-items:center;font-size:14px;padding:4px 0;}
  .row .r{font-weight:600;font-variant-numeric:tabular-nums;}
  .paid{color:#059669;}
  .due{color:#0f172a;}
  .divider{margin-top:8px;padding-top:12px;border-top:1px solid #f1f5f9;}
  .pay{margin-top:16px;display:flex;align-items:center;justify-content:center;gap:8px;width:100%;box-sizing:border-box;padding:12px;border-radius:10px;color:#fff;font-weight:600;font-size:14px;text-decoration:none;background:linear-gradient(135deg,${primary},${secondary});}
  .settled{margin-top:16px;text-align:center;font-size:13px;font-weight:600;color:#059669;background:#ecfdf5;border:1px solid #a7f3d0;border-radius:10px;padding:12px;}
  .note{font-size:12px;color:#94a3b8;text-align:center;margin-top:8px;}
  @media (max-width:760px){.grid{grid-template-columns:1fr;}}
</style></head>
<body>
<div class="page">
  <h1>Client order link - payment, before & after deposit</h1>
  <p class="sub">Example: ${fmt(total)} order, ${depositPercent}% deposit. Left = before any payment. Right = after the deposit is paid.</p>
  <div class="grid">
    ${stateColumn("Before deposit paid", 0)}
    ${stateColumn(`After deposit paid (${depositPercent}%)`, deposit)}
  </div>
</div>
</body></html>`;

const out = join(process.cwd(), "order-payment-preview.html");
writeFileSync(out, html, "utf8");
console.log("Wrote", out);
