// Read-only end-to-end check of the lead forms on the LIVE database.
// Simulates a third-party website embedding the snippet + the hosted link.
// Every POST to /submit is intercepted (recorded, never sent), and any
// other non-GET request is aborted, so nothing is written.
import { chromium } from 'playwright';
import fs from 'fs';

const BASE = 'http://localhost:3001';
const TOKEN = 'e877e365-d5b7-4839-b386-d5253f0c1141';
const SLUGS = ['quick-card-3gg6', 'detailed-multi-step-qbvs', 'pricing-calculator-gozm'];
const OUT = 'tmp/embedchk/shots';
fs.mkdirSync(OUT, { recursive: true });

const future = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);

async function guard(page, captured) {
  await page.route('**/*', async (route) => {
    const req = route.request();
    if (req.method() === 'POST' && /\/api\/public\/embed\/.+\/submit/.test(req.url())) {
      captured.push(JSON.parse(req.postData() || '{}'));
      return route.fulfill({
        status: 200,
        headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
        body: JSON.stringify({ ok: true, message: 'INTERCEPTED - not saved' }),
      });
    }
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method())) return route.abort();
    if (req.url().includes('spitbraaidelivery.co.za')) return route.fulfill({ status: 200, contentType: 'text/html', body: 'thank-you page' });
    return route.continue();
  });
}

async function fillVisible(page) {
  // Operates inside the open shadow root (Playwright CSS pierces it).
  return page.evaluate(({ future }) => {
    const host = document.querySelector('[data-embed-form]');
    const root = host.shadowRoot;
    const isShown = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
    const filled = [];
    root.querySelectorAll('.cms-field').forEach((wrap) => {
      if (!isShown(wrap)) return;
      const fid = wrap.dataset.fid;
      const radios = wrap.querySelectorAll('input[type=radio]');
      if (radios.length) { if (![...radios].some((r) => r.checked)) { radios[0].checked = true; radios[0].dispatchEvent(new Event('change', { bubbles: true })); } filled.push(fid); return; }
      const sel = wrap.querySelector('select.cms-select');
      if (sel && !wrap.querySelector('.cms-catalogue-picker')) {
        if (!sel.value && sel.options.length > 1) { sel.value = sel.options[1].value; sel.dispatchEvent(new Event('change', { bubbles: true })); }
        filled.push(fid); return;
      }
      const inp = wrap.querySelector('input.cms-input, textarea');
      if (!inp || inp.value) return;
      const v = { email: 'visitor@example.com', tel: '+27 82 123 4567', date: future, time: '18:30', number: '50' }[inp.type]
        || (inp.tagName === 'TEXTAREA' ? 'Test note' : 'Test Visitor');
      inp.value = v;
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      inp.dispatchEvent(new Event('change', { bubbles: true }));
      filled.push(fid);
    });
    return filled;
  }, { future });
}

async function shadowInfo(page) {
  return page.evaluate(() => {
    const root = document.querySelector('[data-embed-form]').shadowRoot;
    const errs = [...root.querySelectorAll('.cms-error')].map((e) => e.textContent).filter(Boolean);
    const selects = [...root.querySelectorAll('select.cms-select')].map((s) => `${s.name}=${JSON.stringify(s.value)}`);
    const fields = [...root.querySelectorAll('.cms-field')].map((f) => f.dataset.fid);
    const alert = root.querySelector('.cms-alert');
    const success = root.querySelector('.cms-success');
    return { fields, selects, errs, alert: alert && !alert.hidden ? alert.textContent : null, success: success ? success.textContent : null };
  });
}

async function submitFlow(page) {
  for (let i = 0; i < 4; i++) {
    await fillVisible(page);
    const next = page.locator('[data-embed-form] button:has-text("Next")');
    if (await next.count() && await next.isVisible()) { await next.click(); await page.waitForTimeout(250); continue; }
    break;
  }
  await page.locator('[data-embed-form] button[type=submit]').click();
  await page.waitForTimeout(800);
}

const browser = await chromium.launch({ executablePath: 'C:/Users/raj/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe', args: ['--disable-features=LocalNetworkAccessChecks,BlockInsecurePrivateNetworkRequests,PrivateNetworkAccessRespectPreflightResults'] });
const report = [];
for (const slug of SLUGS) {
  for (const width of [1280, 390]) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('framenavigated', (f) => { if (f === page.mainFrame()) console.error('NAV', f.url()); });
    const captured = [];
    await guard(page, captured);
    // A "third-party website" on another origin with the pasted snippet.
    await page.route('http://127.0.0.1:8099/**', (route) => route.fulfill({
      status: 200, contentType: 'text/html',
      body: `<!doctype html><html><head><meta name=viewport content="width=device-width,initial-scale=1"><title>Caterer site</title>
      <style>body{font-family:Georgia,serif;margin:0;background:#fafaf5}header{background:#333;color:#fff;padding:16px}main{max-width:900px;margin:0 auto;padding:16px}</style></head>
      <body><header>Some caterer website</header><main><h1>Get a quote</h1>
      <div data-embed-form data-token="${TOKEN}" data-slug="${slug}"></div>
      <script async src="${BASE}/embed/loader.js"></script></main></body></html>`,
    }));
    await page.goto('http://127.0.0.1:8099/quote');
    await page.waitForFunction(() => document.querySelector('[data-embed-form]')?.shadowRoot?.querySelector('form'), null, { timeout: 30000 });
    const before = await shadowInfo(page);
    // Submit empty first: required fields must show errors, nothing posted.
    await page.locator('[data-embed-form] button[type=submit], [data-embed-form] button:has-text("Next")').first().click();
    await page.waitForTimeout(300);
    const emptyErrs = (await shadowInfo(page)).errs;
    await page.screenshot({ path: `${OUT}/${slug}-${width}-embed.png`, fullPage: true });
    await submitFlow(page);
    await page.waitForTimeout(500);
    const after = await shadowInfo(page).catch(() => ({ success: 'REDIRECTED to ' + page.url() }));
    await page.screenshot({ path: `${OUT}/${slug}-${width}-after.png`, fullPage: true }).catch(() => {});
    report.push({ where: 'third-party snippet', slug, width, fields: before.fields, initialSelects: before.selects, emptySubmitErrors: emptyErrs.length, postedBeforeFill: captured.length > 1, after: after.success ? 'SUCCESS' : after, payload: captured[captured.length - 1]?.payload, pageErrors: errors });
    await ctx.close();
  }
  // Hosted share link + preview link.
  for (const mode of ['link', 'preview']) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('framenavigated', (f) => { if (f === page.mainFrame()) console.error('NAV', f.url()); });
    const captured = [];
    await guard(page, captured);
    await page.goto(`${BASE}/embed/form.html?token=${TOKEN}&slug=${slug}${mode === 'preview' ? '&preview=1' : ''}`);
    await page.waitForFunction(() => document.querySelector('[data-embed-form]')?.shadowRoot?.querySelector('form'), null, { timeout: 30000 });
    await page.screenshot({ path: `${OUT}/${slug}-${mode}.png`, fullPage: true });
    await submitFlow(page);
    await page.waitForTimeout(500);
    const after = await shadowInfo(page).catch(() => ({ success: 'REDIRECTED to ' + page.url() }));
    report.push({ where: `hosted ${mode}`, slug, title: await page.title().catch(() => ''), submitsSent: captured.length, after: after.success ? after.success.slice(0, 90) : after, pageErrors: errors });
    await ctx.close();
  }
}
await browser.close();
console.log(JSON.stringify(report, null, 1));
