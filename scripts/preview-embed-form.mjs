// Renders the live embed form on a simulated third-party website using the
// REAL snippet (loader.js from prod + a real token/slug), in a real browser.
// Proves: (a) the script works on an external page, (b) every field renders.
// Outputs a screenshot + the full list of fields the visitor would fill.
import http from "node:http";
import { chromium } from "playwright";

const TOKEN = process.env.TOKEN || "e877e365-d5b7-4839-b386-d5253f0c1141"; // Spit Braai Delivery
const SLUG  = process.env.SLUG  || "quick-card-3gg6";
const HOST  = process.env.EMBED_HOST || "https://cateringms.com";
const OUT   = process.env.OUT || "embed-form-preview.png";

// A bare "customer website" that only contains the two-line snippet.
const pageHtml = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Acme Caterers - Get a quote</title>
<style>body{font-family:system-ui,sans-serif;margin:0;background:#f1f5f9}
.wrap{max-width:640px;margin:0 auto;padding:32px 16px}
h1{font-size:22px;color:#0f172a}.host{background:#fff;border-radius:12px;padding:8px;box-shadow:0 1px 3px rgba(0,0,0,.1)}</style>
</head><body><div class="wrap">
<h1>Request a catering quote</h1>
<p>This page is a stand-in for a customer's own website. The form below is the embedded snippet.</p>
<div class="host">
<!-- ===== REAL EMBED SNIPPET ===== -->
<div data-embed-form data-token="${TOKEN}" data-slug="${SLUG}"></div>
<script async src="${HOST}/embed/loader.js"></script>
<!-- ============================== -->
</div></div></body></html>`;

const server = http.createServer((req, res) => {
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(pageHtml);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;
const url = `http://127.0.0.1:${port}/`;
console.log("Serving fake customer site at", url);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 720, height: 1100 } });
const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
page.on("requestfailed", (r) => errors.push(`reqfail ${r.url()} ${r.failure()?.errorText}`));

await page.goto(url, { waitUntil: "networkidle" });

// The form renders inside an open shadow root on the host div. Wait for it.
await page.waitForFunction(() => {
  const host = document.querySelector("[data-embed-form]");
  const sr = host && host.shadowRoot;
  return !!sr && sr.querySelectorAll("input,select,textarea").length > 0;
}, { timeout: 20000 }).catch(() => {});

const result = await page.evaluate(() => {
  const host = document.querySelector("[data-embed-form]");
  const sr = host && host.shadowRoot;
  if (!sr) return { ok: false, fields: [], heading: null };
  const fields = [];
  sr.querySelectorAll("input,select,textarea").forEach((el) => {
    const type = el.tagName.toLowerCase() === "select" ? "select"
      : el.tagName.toLowerCase() === "textarea" ? "textarea"
      : (el.getAttribute("type") || "text");
    if (["hidden", "submit", "button"].includes(type)) return;
    // honeypot fields are visually hidden
    const cs = getComputedStyle(el);
    const hidden = cs.display === "none" || cs.visibility === "hidden";
    // find a label: aria-label, associated <label>, or preceding label text
    let label = el.getAttribute("aria-label") || el.getAttribute("placeholder") || "";
    if (el.id) {
      const lab = sr.querySelector(`label[for="${el.id}"]`);
      if (lab) label = lab.textContent.trim();
    }
    if (!label) {
      const wrapLab = el.closest("label") || (el.parentElement && el.parentElement.querySelector("label"));
      if (wrapLab) label = wrapLab.textContent.trim();
    }
    fields.push({ label: label || "(no label)", type, required: el.required || el.getAttribute("aria-required") === "true", hidden });
  });
  const headingEl = sr.querySelector("h1,h2,h3,legend");
  const btn = sr.querySelector("button[type=submit], .cms-submit, button");
  return { ok: true, heading: headingEl ? headingEl.textContent.trim() : null, submitLabel: btn ? btn.textContent.trim() : null, fields };
});

await page.screenshot({ path: OUT, fullPage: true });

console.log("\n=== Rendered form ===");
console.log("Heading:", result.heading);
console.log("Submit button:", result.submitLabel);
console.log("Fields the visitor fills:");
for (const f of result.fields.filter((x) => !x.hidden)) {
  console.log(`  - ${f.label}  [${f.type}]${f.required ? "  *required" : ""}`);
}
const hidden = result.fields.filter((x) => x.hidden);
if (hidden.length) console.log(`(+ ${hidden.length} hidden anti-spam field(s))`);
console.log("\nScreenshot saved to:", OUT);
if (errors.length) { console.log("\nBrowser errors/warnings:"); errors.forEach((e) => console.log("  ", e)); }
else console.log("\nNo browser errors. Script loaded and rendered cleanly.");

await browser.close();
server.close();
process.exit(0);
