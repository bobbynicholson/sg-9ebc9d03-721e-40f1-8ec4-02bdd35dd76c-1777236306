// End-to-end check against the production build on :3002 (live DB).
// Spit Braai forms: every submit is intercepted (no real leads).
// Raj PayFast Test Company (user's sandbox): ONE real submission.
import { chromium } from 'playwright';
import fs from 'fs';

const BASE = 'http://localhost:3002';
const OUT = 'tmp/embedchk/shots2';
fs.mkdirSync(OUT, { recursive: true });
const future = new Date(Date.now() + 45 * 864e5).toISOString().slice(0, 10);
const browser = await chromium.launch({
  executablePath: 'C:/Users/raj/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe',
  args: ['--disable-features=LocalNetworkAccessChecks,BlockInsecurePrivateNetworkRequests,PrivateNetworkAccessRespectPreflightResults'],
});
const report = [];

async function newPage(width, { intercept }) {
  const ctx = await browser.newContext({ viewport: { width, height: 950 } });
  const page = await ctx.newPage();
  const errors = [];
  const captured = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
  await page.route('**/*', async (route) => {
    const req = route.request();
    if (req.method() === 'POST' && /\/submit$/.test(req.url()) && intercept) {
      captured.push(JSON.parse(req.postData() || '{}'));
      return route.fulfill({ status: 200, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' }, body: JSON.stringify({ ok: true, message: 'INTERCEPTED' }) });
    }
    if (req.url().includes('spitbraaidelivery.co.za/thank-you')) return route.fulfill({ status: 200, contentType: 'text/html', body: 'thank-you page' });
    return route.continue();
  });
  return { ctx, page, errors, captured };
}

const root = (page) => page.locator('[data-embed-form]');
async function waitForm(page) {
  await page.waitForFunction(() => document.querySelector('[data-embed-form]')?.shadowRoot?.querySelector('form'), null, { timeout: 45000 });
}
async function info(page) {
  return page.evaluate(() => {
    const r = document.querySelector('[data-embed-form]').shadowRoot;
    const form = r.querySelector('form');
    return {
      fields: [...r.querySelectorAll('.cms-field')].map((f) => f.dataset.fid),
      hasHowCanWeHelp: r.textContent.includes('How can we help'),
      formWidth: form ? Math.round(form.getBoundingClientRect().width) : 0,
      viewport: window.innerWidth,
      success: r.querySelector('.cms-success')?.textContent || null,
      alert: (() => { const a = r.querySelector('.cms-alert'); return a && !a.hidden ? a.textContent : null; })(),
      errors: [...r.querySelectorAll('.cms-error')].map((e) => e.textContent).filter(Boolean),
    };
  });
}

// Fill visible plain fields in the current step (pickers/address handled separately).
async function fillVisible(page) {
  await page.evaluate((future) => {
    const r = document.querySelector('[data-embed-form]').shadowRoot;
    const shown = (el) => !!(el.offsetWidth || el.offsetHeight);
    r.querySelectorAll('.cms-field').forEach((wrap) => {
      if (!shown(wrap) || wrap.querySelector('.cms-catalogue-picker')) return;
      const radios = wrap.querySelectorAll('input[type=radio]');
      if (radios.length) { if (![...radios].some((x) => x.checked)) { radios[0].checked = true; radios[0].dispatchEvent(new Event('change', { bubbles: true })); } return; }
      const sel = wrap.querySelector('select');
      if (sel) { if (!sel.value && sel.options.length > 1) { sel.value = sel.options[sel.options.length - 1].value; sel.dispatchEvent(new Event('change', { bubbles: true })); } return; }
      const inp = wrap.querySelector('input.cms-input, textarea');
      if (!inp || inp.value) return;
      if (inp.getAttribute('role') === 'combobox' && wrap.dataset.fid !== 'venue') return;
      if (wrap.dataset.fid === 'venue' || inp.getAttribute('autocomplete') === 'street-address') return;
      inp.value = { email: 'raj267748+e2e@gmail.com', tel: '+27 82 555 0101', date: future, time: '18:30', number: '40' }[inp.type]
        || (inp.tagName === 'TEXTAREA' ? 'E2E test - please ignore' : 'E2E Test Visitor');
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      inp.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }, future);
}

async function typeAndPick(page, selector, text, expectSuggestion = true) {
  const input = root(page).locator(selector).first();
  if (!(await input.count()) || !(await input.isVisible())) return { skipped: true };
  await input.click();
  await input.pressSequentially(text, { delay: 40 });
  // Scope to this field's own dropdown.
  const field = root(page).locator(selector).first().locator('xpath=ancestor::div[contains(@class,"cms-field")][1]');
  const item = field.locator('.cms-suggest-item').first();
  try { await item.waitFor({ state: 'visible', timeout: 8000 }); } catch { return { suggestion: null }; }
  const labels = await field.locator('.cms-suggest-item').allTextContents();
  await page.waitForTimeout(150);
  await item.dispatchEvent('mousedown');
  return { suggestion: labels[0], count: labels.length, anyPrice: labels.some((l) => /R\s?\d/.test(l)) };
}

async function walkAndSubmit(page, extras) {
  for (let i = 0; i < 5; i++) {
    await fillVisible(page);
    if (extras) await extras(page);
    const next = root(page).locator('button:has-text("Next")');
    if (await next.count() && await next.isVisible()) { await next.click(); await page.waitForTimeout(300); continue; }
    break;
  }
  const resp = page.waitForResponse((r) => r.url().endsWith('/submit'), { timeout: 30000 }).catch(() => null);
  await root(page).locator('button[type=submit]').click();
  await resp;
  await page.waitForTimeout(1500);
}

// A. Clean links, Spit Braai, desktop + mobile, intercepted.
for (const slug of ['quick-card-3gg6', 'detailed-multi-step-qbvs', 'pricing-calculator-gozm']) {
  for (const width of [1440, 390]) {
    const { ctx, page, errors, captured } = await newPage(width, { intercept: true });
    await page.goto(`${BASE}/quote/spit-braai-delivery/${slug}`);
    await waitForm(page);
    await page.waitForTimeout(800);
    const before = await info(page);
    await page.screenshot({ path: `${OUT}/${slug}-${width}.png`, fullPage: width === 390 });
    const picks = {};
    await walkAndSubmit(page, async (p) => {
      if (!picks.venue) { const r = await typeAndPick(p, 'input[name="venue"]', 'Long Street Cape Town'); if (!r.skipped) picks.venue = r; }
      if (!picks.menu) { const r = await typeAndPick(p, '[data-fid="menu_item_ids"] input[type=search]', 'lamb'); if (!r.skipped) picks.menu = r; }
    });
    const after = await info(page).catch(() => ({ success: 'REDIRECTED ' + page.url() }));
    report.push({ test: `clean link ${slug} @${width}`, fields: before.fields.length, hasHowCanWeHelp: before.hasHowCanWeHelp, formWidth: `${before.formWidth}/${before.viewport}`, picks, submitted: captured.length, payloadMenu: captured[0]?.payload?.menu_item_ids, payloadVenue: captured[0]?.payload?.venue, result: after.success || after.alert || after.errors, pageErrors: errors });
    await ctx.close();
  }
}

// B. Snippet on a third-party site (loader from :3002), intercepted.
{
  const { ctx, page, errors, captured } = await newPage(1280, { intercept: true });
  await page.route('http://127.0.0.1:8099/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: `<!doctype html><html><head><meta name=viewport content="width=device-width,initial-scale=1"></head><body style="font-family:Georgia;background:#fafaf5;margin:0"><header style="background:#333;color:#fff;padding:16px">Caterer website</header><main style="max-width:1000px;margin:0 auto;padding:24px"><h1>Get a quote</h1><div data-embed-form data-token="e877e365-d5b7-4839-b386-d5253f0c1141" data-slug="quick-card-3gg6"></div><script async src="${BASE}/embed/loader.js"></script></main></body></html>` }));
  await page.goto('http://127.0.0.1:8099/quote');
  await waitForm(page);
  const before = await info(page);
  await page.screenshot({ path: `${OUT}/third-party.png`, fullPage: true });
  await walkAndSubmit(page);
  report.push({ test: 'snippet on third-party site', fields: before.fields.length, formWidth: `${before.formWidth}/${before.viewport}`, submitted: captured.length, pageErrors: errors });
  await ctx.close();
}

// C. Preview link never submits.
{
  const { ctx, page, captured } = await newPage(1280, { intercept: false });
  let posted = 0;
  page.on('request', (r) => { if (r.method() === 'POST' && r.url().endsWith('/submit')) posted++; });
  await page.goto(`${BASE}/quote/spit-braai-delivery/detailed-multi-step-qbvs?preview=1`);
  await waitForm(page);
  await walkAndSubmit(page);
  const after = await info(page);
  report.push({ test: 'preview link', submitPosts: posted + captured.length, result: (after.success || '').slice(0, 60) });
  await ctx.close();
}

// D. REAL submission on the test company.
{
  const { ctx, page, errors } = await newPage(1280, { intercept: false });
  let response = null;
  page.on('response', async (r) => { if (r.url().endsWith('/submit')) { try { response = await r.json(); } catch { response = { status: r.status() }; } } });
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
  await page.goto(`${BASE}/quote/raj267748-payfast-test/event-quote`);
  await waitForm(page);
  const picks = {};
  await walkAndSubmit(page, async (p) => {
    if (!picks.venue) { const r = await typeAndPick(p, 'input[name="venue"]', 'Long Street Cape Town'); if (!r.skipped) picks.venue = r; }
    if (!picks.menu) { const r = await typeAndPick(p, '[data-fid="menu_item_ids"] input[type=search]', 'lamb'); if (!r.skipped) picks.menu = r; }
    if (!picks.eq) { const r = await typeAndPick(p, '[data-fid="equipment_item_ids"] input[type=search]', 'chafing'); if (!r.skipped) picks.eq = r; }
  });
  const after = await info(page);
  await page.screenshot({ path: `${OUT}/real-submit-result.png` });
  report.push({ test: 'REAL submission (test company)', picks, response, result: after.success || after.alert || after.errors, pageErrors: errors });
  await ctx.close();
}

await browser.close();
console.log(JSON.stringify(report, null, 1));
