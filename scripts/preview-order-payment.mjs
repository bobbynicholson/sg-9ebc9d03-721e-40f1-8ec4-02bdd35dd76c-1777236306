/**
 * Local preview of the order-link payment section after the change:
 *  - top "Payment" stat now reads "Deposit paid" (not "Paid") for a 50%
 *    deposit
 *  - bottom Payment card now clearly lists Order total, Deposit paid,
 *    and Remaining balance
 *
 * Static HTML approximation of src/pages/c/order/[id].tsx (Tailwind/
 * shadcn) so we can eyeball the wording + breakdown without spinning up
 * Next + a real tokenised order. Run: node scripts/preview-order-payment.mjs
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const primary = "#9333ea";
const secondary = "#ec4899";
const fmt = (n) => "R" + Number(n).toLocaleString("en-ZA", { maximumFractionDigits: 0 });

const total = 12000;
const paid = 6000;        // 50% deposit
const remaining = total - paid;

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Order link payment preview</title>
<style>
  body{margin:0;background:linear-gradient(135deg,${primary}08,${secondary}08);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a;}
  .wrap{max-width:768px;margin:0 auto;padding:24px 16px;}
  .card{background:#fff;border-radius:14px;box-shadow:0 10px 25px rgba(15,23,42,.08);margin-bottom:24px;overflow:hidden;}
  .card .body{padding:24px;}
  .chip{display:inline-block;font-size:12px;font-weight:600;padding:2px 10px;border-radius:999px;background:#dbeafe;color:#1e40af;border:1px solid #bfdbfe;margin-bottom:8px;}
  h2{font-size:24px;margin:0;font-weight:700;}
  .muted{color:#64748b;font-size:13px;}
  .statgrid{display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin-top:20px;padding-top:20px;border-top:1px solid #f1f5f9;}
  .stat .lbl{font-size:12px;color:#64748b;margin-bottom:4px;}
  .stat .val{font-weight:600;}
  .ctitle{font-size:16px;font-weight:600;display:flex;align-items:center;gap:8px;padding:20px 24px 0;}
  .dot{width:8px;height:8px;border-radius:50%;background:${primary};display:inline-block;}
  .row{display:flex;justify-content:space-between;align-items:center;font-size:14px;padding:4px 0;}
  .row .r{font-weight:600;font-variant-numeric:tabular-nums;}
  .paid{color:#059669;}
  .due{color:#0f172a;}
  .divider{margin-top:8px;padding-top:12px;border-top:1px solid #f1f5f9;}
  .note{font-size:12px;color:#94a3b8;text-align:center;margin-top:8px;}
  .tag{font-size:11px;background:#ecfdf5;color:#059669;border:1px solid #a7f3d0;border-radius:6px;padding:1px 6px;margin-left:6px;}
</style></head>
<body>
<div class="wrap">

  <!-- Event headline card with top stats incl. Payment -->
  <div class="card"><div class="body">
    <div class="chip">confirmed</div>
    <h2>Birthday Braai</h2>
    <p class="muted">Order #ORD-1042</p>
    <div class="statgrid">
      <div class="stat"><div class="lbl">In 12 days</div><div class="val">02 Jul 2026</div></div>
      <div class="stat"><div class="lbl">Event start</div><div class="val">13:00</div></div>
      <div class="stat"><div class="lbl">Guests</div><div class="val">80</div></div>
      <div class="stat"><div class="lbl">Total</div><div class="val">${fmt(total)}</div></div>
      <div class="stat"><div class="lbl">Payment</div><div class="val">Deposit paid <span class="tag">was "Paid"</span></div></div>
    </div>
  </div></div>

  <!-- Payment card (bottom) -->
  <div class="card">
    <div class="ctitle"><span class="dot"></span> Payment</div>
    <div class="body" style="padding-top:14px;">
      <div class="row"><span class="due">Deposit (paid)</span><span class="r paid">${fmt(paid)}</span></div>
      <div class="row"><span class="due">Balance (due 02 Jul)</span><span class="r due">${fmt(remaining)}</span></div>

      <div class="divider">
        <div class="row"><span class="due">Order total</span><span class="r due">${fmt(total)}</span></div>
        <div class="row"><span class="due">Deposit paid</span><span class="r paid">${fmt(paid)}</span></div>
        <div class="row"><span class="due">Remaining balance</span><span class="r due">${fmt(remaining)}</span></div>
      </div>

      <a href="#" style="margin-top:16px;display:flex;align-items:center;justify-content:center;gap:8px;width:100%;box-sizing:border-box;padding:12px;border-radius:10px;color:#fff;font-weight:600;font-size:14px;text-decoration:none;background:linear-gradient(135deg,${primary},${secondary});">Pay ${fmt(remaining)} now</a>
      <p class="note">Updates live - when the deposit lands or the balance clears, this refreshes on its own.</p>
    </div>
  </div>

</div>
</body></html>`;

const out = join(process.cwd(), "order-payment-preview.html");
writeFileSync(out, html, "utf8");
console.log("Wrote", out);
