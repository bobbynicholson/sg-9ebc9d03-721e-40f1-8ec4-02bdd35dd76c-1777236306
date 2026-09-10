/**
 * Faithful render of the REAL live pay page (INV-005550) using the exact
 * content currently on it (deposit paid state). Mirrors the real layout
 * of src/pages/pay/i/[token].tsx so we can see, here, how it looks.
 * Run: node scripts/preview-real-invoice.mjs
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const primary = "#1e06db";
const logoUrl = "https://spitbraaidelivery.co.za/wp-content/uploads/2015/09/Spit-braai-delivery-logo-rebrand-2015-220w1.png";
const fmt = (n) => { const [i,d]=Number(n).toFixed(2).split("."); return "R "+i.replace(/\B(?=(\d{3})+(?!\d))/g," ")+"."+d; };

const total = 9301.03, paid = 4650.52, deposit = 4650.52, balance = 4650.51, balanceDue = 4650.51, remainingAfter = 0;

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Tax Invoice INV-005550 from Spit Braai Delivery</title>
<style>
  :root{--p:${primary};}
  body{margin:0;background:#fafaf9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1c1917;}
  .wrap{max-width:768px;margin:0 auto;padding:28px 18px;}
  .bar{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:14px;flex-wrap:wrap;}
  .chip{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:600;padding:5px 11px;border-radius:999px;background:#f5f5f4;color:#57534e;border:1px solid #e7e5e4;}
  .btn{font-size:13px;font-weight:600;padding:7px 12px;border-radius:8px;border:1px solid #d6d3d1;background:#fff;color:#44403c;}
  .header{background:color-mix(in srgb,var(--p) 10%,white);border:1px solid color-mix(in srgb,var(--p) 30%,white);border-radius:14px;padding:26px;margin-bottom:16px;}
  .htop{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;}
  .brandrow{display:flex;align-items:center;gap:12px;margin-bottom:12px;}
  .brandrow img{height:40px;width:auto;max-width:180px;object-fit:contain;}
  .brandname{font-size:12px;letter-spacing:.2em;text-transform:uppercase;color:var(--p);font-weight:700;}
  h1{font-family:Georgia,serif;font-size:32px;font-weight:700;margin:0;line-height:1.1;}
  .meta{font-size:13px;color:#57534e;margin-top:8px;}
  .vat{font-size:12px;color:#78716c;margin-top:4px;}
  .badge{font-size:13px;font-weight:600;padding:6px 12px;border-radius:999px;color:#fff;background:var(--p);white-space:nowrap;}
  .card{background:#fff;border:1px solid #e7e5e4;border-radius:14px;padding:22px;margin-bottom:16px;}
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:18px;}
  .lbl{font-size:10px;text-transform:uppercase;letter-spacing:.15em;color:var(--p);font-weight:700;margin:0 0 3px;}
  .big{font-size:20px;font-weight:700;margin:0;font-variant-numeric:tabular-nums;}
  .green{color:#047857;}
  .plan{display:grid;grid-template-columns:1fr 1fr;gap:16px;background:#fafaf9;border-radius:10px;padding:16px;}
  .plan .amt{font-size:18px;font-weight:700;margin:0;font-variant-numeric:tabular-nums;}
  .plan .sub{font-size:11px;color:#78716c;margin:2px 0 0;}
  .balbox{margin-top:18px;background:color-mix(in srgb,var(--p) 10%,white);border:2px solid var(--p);border-radius:12px;padding:18px;display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;}
  .balamt{font-family:Georgia,serif;font-size:30px;font-weight:700;margin:4px 0 0;font-variant-numeric:tabular-nums;}
  .due{font-size:12px;color:#57534e;margin-top:6px;}
  .events{margin-top:16px;background:#fafaf9;border-radius:10px;padding:16px;font-size:14px;color:#44403c;}
  .events p{margin:2px 0;}
  .paytitle{font-size:15px;font-weight:700;margin:0;}
  .paysub{font-size:12px;color:#78716c;margin:4px 0 14px;}
  .field{background:#fafaf9;border:1px solid #e7e5e4;border-radius:10px;padding:16px;}
  .field label{display:block;font-size:14px;font-weight:600;color:#292524;margin-bottom:8px;}
  .input{width:100%;box-sizing:border-box;height:46px;border:1px solid #d6d3d1;border-radius:8px;padding:0 12px;font-size:16px;font-weight:600;font-variant-numeric:tabular-nums;}
  .line{display:flex;justify-content:space-between;align-items:center;font-size:16px;margin-top:12px;}
  .line .v{font-weight:700;font-size:18px;font-variant-numeric:tabular-nums;}
  .shortcut{margin-top:14px;}
  .pillbtn{font-size:14px;font-weight:600;border:1px solid #d6d3d1;background:#fff;border-radius:999px;padding:8px 16px;color:#44403c;}
  .paybtn{margin-top:16px;display:flex;align-items:center;justify-content:center;gap:8px;width:100%;box-sizing:border-box;padding:15px;border-radius:10px;color:#fff;font-weight:700;font-size:16px;background:var(--p);border:none;}
  .foot{margin-top:18px;text-align:center;font-size:13px;color:#78716c;}
</style></head>
<body>
<div class="wrap">

  <div class="bar">
    <span class="chip">📅 Due in 6 days</span>
    <button class="btn">🖨 Save as PDF</button>
  </div>

  <div class="header">
    <div class="htop">
      <div>
        <div class="brandrow"><img src="${logoUrl}" alt="Spit Braai Delivery"><span class="brandname">Spit Braai Delivery</span></div>
        <h1>Tax Invoice INV-005550</h1>
        <p class="meta">Issued 19 June 2026 · viewed 20 June 2026</p>
        <p class="vat">VAT Reg No: <span style="font-family:monospace">4250305390</span></p>
      </div>
      <span class="badge">Awaiting payment</span>
    </div>
  </div>

  <div class="card">
    <div class="grid2">
      <div><p class="lbl">Total</p><p class="big">${fmt(total)}</p></div>
      <div><p class="lbl">Paid to date</p><p class="big green">${fmt(paid)}</p></div>
    </div>

    <div class="plan">
      <div>
        <p class="lbl">Deposit payment (50%)</p>
        <p class="amt">${fmt(deposit)}</p>
        <p class="sub">Payable to confirm your booking</p>
      </div>
      <div>
        <p class="lbl">Balance payment (50%)</p>
        <p class="amt">${fmt(balance)}</p>
        <p class="sub">Payable before the event</p>
      </div>
    </div>

    <div class="balbox">
      <div>
        <p class="lbl" style="color:var(--p)">Balance due</p>
        <p class="balamt">${fmt(balanceDue)}</p>
        <p class="due">📅 Due 26 June 2026</p>
      </div>
    </div>

    <div class="events">
      <p class="lbl" style="margin-bottom:4px">Event details</p>
      <p>Date: 28 June 2026</p>
      <p>Guests: 35</p>
    </div>
  </div>

  <div class="card">
    <p class="paytitle">Pay this invoice</p>
    <p class="paysub">Secure card / EFT payment. The provider depends on what Spit Braai Delivery has set up.</p>
    <div class="field">
      <label>Amount to pay now (R)</label>
      <input class="input" value="4650.51">
      <div class="line"><span style="color:#57534e">Outstanding balance</span><span class="v">${fmt(balanceDue)}</span></div>
      <div class="line"><span style="color:#57534e">Balance remaining after this payment</span><span class="v">${fmt(remainingAfter)}</span></div>
      <div class="shortcut"><button class="pillbtn">Pay full balance: ${fmt(balanceDue)}</button></div>
    </div>
    <button class="paybtn">💳 Pay ${fmt(balanceDue)} now</button>
  </div>

  <p class="foot">Spit Braai Delivery<br>hello@spitbraaidelivery.co.za · 0826411373</p>

</div>
</body></html>`;

const out = join(process.cwd(), "real-invoice-preview.html");
writeFileSync(out, html, "utf8");
console.log("Wrote", out);
