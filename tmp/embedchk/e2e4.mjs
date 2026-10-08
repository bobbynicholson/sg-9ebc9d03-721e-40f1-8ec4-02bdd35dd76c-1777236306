// Course picker + equipment package + waiter/chef boxes, end to end.
// Spit Braai: look + intercepted submit. Test company: ONE real submit.
import { chromium } from 'playwright';
import fs from 'fs';
const BASE = 'http://localhost:3002';
const OUT = 'tmp/embedchk/shots3';
fs.mkdirSync(OUT, { recursive: true });
const future = new Date(Date.now() + 40 * 864e5).toISOString().slice(0, 10);
const browser = await chromium.launch({ executablePath: 'C:/Users/raj/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe' });

async function run(url, { real, shot }) {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await ctx.newPage();
  const errors = [];
  let payload = null; let response = null;
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
  await page.route('**/*', async (route) => {
    const req = route.request();
    if (req.method() === 'POST' && req.url().endsWith('/submit')) {
      payload = JSON.parse(req.postData() || '{}').payload;
      if (!real) return route.fulfill({ status: 200, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ok: true, message: 'INTERCEPTED' }) });
      return route.continue();
    }
    if (req.url().includes('spitbraaidelivery.co.za/thank-you')) return route.fulfill({ status: 200, contentType: 'text/html', body: 'ok' });
    return route.continue();
  });
  page.on('response', async (r) => { if (r.url().endsWith('/submit') && real) { try { response = await r.json(); } catch { /* ignore */ } } });
  await page.goto(url);
  await page.waitForFunction(() => document.querySelector('[data-embed-form]')?.shadowRoot?.querySelector('form'), null, { timeout: 45000 });
  const R = () => page.locator('[data-embed-form]');

  // Fill plain fields + walk steps; on the step with the menu, use it.
  const used = {};
  for (let step = 0; step < 5; step++) {
    await page.evaluate((future) => {
      const r = document.querySelector('[data-embed-form]').shadowRoot;
      const shown = (el) => !!(el.offsetWidth || el.offsetHeight);
      r.querySelectorAll('.cms-field').forEach((w) => {
        if (!shown(w) || w.querySelector('.cms-course-picker, .cms-catalogue-picker')) return;
        if (['equipment_package', 'waiter_service', 'onsite_chef'].includes(w.dataset.fid)) return;
        const sel = w.querySelector('select');
        if (sel) { if (!sel.value && sel.options.length > 1) { sel.value = sel.options[1].value; sel.dispatchEvent(new Event('change', { bubbles: true })); } return; }
        const inp = w.querySelector('input.cms-input, textarea');
        if (!inp || inp.value) return;
        inp.value = w.dataset.fid === 'children_count' ? '4' : { email: 'raj267748+e2e@gmail.com', tel: '+27 82 555 0101', date: future, time: '18:30', number: '30' }[inp.type]
          || (inp.tagName === 'TEXTAREA' ? 'E2E test - please ignore' : 'E2E Visitor');
        inp.dispatchEvent(new Event('input', { bubbles: true }));
      });
    }, future);
    const courses = R().locator('.cms-course');
    if (!used.menu && await courses.count() && await courses.first().isVisible()) {
      used.courses = await R().locator('.cms-course-name').allTextContents();
      // Starter line 1, then Add line + a second starter (if any), and a main.
      const first = courses.nth(0).locator('select').first();
      const opts = await first.locator('option').allTextContents();
      await first.selectOption({ index: 1 });
      if (opts.length > 2) {
        await courses.nth(0).locator('.cms-course-add').click();
        await courses.nth(0).locator('select').nth(1).selectOption({ index: 2 });
      }
      if (await courses.count() > 1) await courses.nth(1).locator('select').first().selectOption({ index: 1 });
      used.menu = await R().locator('.cms-course-summary').textContent();
      used.firstCourseOptions = opts.slice(0, 4);
    }
    const pkg = R().locator('select[name="equipment_package"]');
    if (!used.pkg && await pkg.count() && await pkg.isVisible()) {
      used.pkgOptions = await pkg.locator('option').allTextContents();
      await pkg.selectOption({ index: used.pkgOptions.length - 1 });
      used.pkg = await pkg.inputValue();
    }
    for (const id of ['waiter_service', 'onsite_chef']) {
      const box = R().locator(`input[name="${id}"]`);
      if (!used[id] && await box.count() && await box.isVisible()) { await box.check(); used[id] = true; }
    }
    if (shot && step <= 2) await page.screenshot({ path: `${OUT}/${shot}-step${step}.png`, fullPage: true });
    const next = R().locator('button:has-text("Next")');
    if (await next.count() && await next.isVisible()) { await next.click(); await page.waitForTimeout(300); continue; }
    break;
  }
  const waitResp = page.waitForResponse((r) => r.url().endsWith('/submit'), { timeout: 40000 }).catch(() => null);
  await R().locator('button[type=submit]').click();
  await waitResp;
  await page.waitForTimeout(1500);
  if (shot) await page.screenshot({ path: `${OUT}/${shot}-done.png` });
  await ctx.close();
  return { used, payload, response, errors };
}

const spit = await run(`${BASE}/quote/spit-braai-delivery/orders`, { real: false, shot: 'spit' });
console.log('SPIT BRAAI (intercepted):', JSON.stringify({ ...spit.used, sentMenu: spit.payload?.menu_item_ids?.length, sentPkg: spit.payload?.equipment_package, waiter: spit.payload?.waiter_service, chef: spit.payload?.onsite_chef, errors: spit.errors }, null, 1));
const real = await run(`${BASE}/quote/raj267748-payfast-test/event-quote`, { real: true, shot: 'test' });
console.log('TEST COMPANY (real):', JSON.stringify({ ...real.used, response: real.response, errors: real.errors }, null, 1));
await browser.close();
