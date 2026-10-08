// Wide-screen layout, address dropdown, and the quote-page distance fix.
// Production build on :3002, live DB, every non-GET aborted.
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
const BASE = 'http://localhost:3002';
const OUT = 'tmp/embedchk/shots2';
const browser = await chromium.launch({ executablePath: 'C:/Users/raj/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe' });

async function guarded(ctx) {
  await ctx.route('**/*', (r) => (['GET', 'HEAD', 'OPTIONS'].includes(r.request().method()) || r.request().url().includes('/auth/v1/')) ? r.continue() : r.abort());
}

// 1. Wide screen hosted page.
for (const width of [1920, 1440]) {
  const ctx = await browser.newContext({ viewport: { width, height: 1000 } });
  await guarded(ctx);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/quote/spit-braai-delivery/orders`);
  await page.waitForFunction(() => document.querySelector('[data-embed-form]')?.shadowRoot?.querySelector('form'));
  await page.waitForTimeout(800);
  const w = await page.evaluate(() => {
    const r = document.querySelector('[data-embed-form]').shadowRoot;
    const step = r.querySelector('.cms-step.is-active');
    return { form: Math.round(r.querySelector('form').getBoundingClientRect().width), cols: getComputedStyle(step).gridTemplateColumns.split(' ').length };
  });
  console.log(`WIDE ${width}:`, JSON.stringify(w));
  await page.screenshot({ path: `${OUT}/wide-${width}.png` });
  if (width === 1920) {
    // Go to the Event step and type an address.
    await page.evaluate(() => {
      const r = document.querySelector('[data-embed-form]').shadowRoot;
      const set = (n, v) => { const i = r.querySelector(`[name="${n}"]`); if (i) { i.value = v; i.dispatchEvent(new Event('input', { bubbles: true })); } };
      set('name', 'Test'); set('email', 'test@example.com'); set('phone', '+27 82 123 4567');
    });
    await page.locator('[data-embed-form] button:has-text("Next")').click();
    await page.waitForTimeout(400);
    const venue = page.locator('[data-embed-form] input[name="venue"]');
    await venue.click();
    await venue.pressSequentially('17 Denison Way Edgemead', { delay: 50 });
    const item = page.locator('[data-embed-form] [data-fid="venue"] .cms-suggest-item').first();
    await item.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
    const dd = await page.evaluate(() => {
      const r = document.querySelector('[data-embed-form]').shadowRoot;
      const f = r.querySelector('[data-fid="venue"]');
      const list = f.querySelector('.cms-suggest');
      const input = f.querySelector('input');
      const label = f.querySelector('.cms-label');
      if (!list || list.hidden) return 'no list';
      const lr = list.getBoundingClientRect(); const ir = input.getBoundingClientRect(); const la = label.getBoundingClientRect();
      return { belowInput: lr.top >= ir.bottom - 1, coversLabel: lr.top < la.bottom && lr.bottom > la.top, widthMatches: Math.abs(lr.width - ir.width) < 2,
        items: [...list.querySelectorAll('.cms-suggest-item')].map((i) => i.innerText.replace(/\n/g, ' | ')).slice(0, 4) };
    });
    console.log('ADDRESS DROPDOWN:', JSON.stringify(dd));
    await page.screenshot({ path: `${OUT}/address-dropdown.png` });
  }
  await ctx.close();
}

// 2. Quote page from a website lead: distance + fee should fill.
{
  const cache = JSON.parse(readFileSync('tmp/ui-normalization/.session-cache.json', 'utf8'));
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await ctx.addCookies(cache['hello@spitbraaidelivery.co.za'].cookies);
  await guarded(ctx);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message.slice(0, 200)));
  await page.goto(`${BASE}/spit-braai-delivery/admin/quotes/new?fromQuoteId=7be13180-d100-42c4-85b2-a1e2612a41aa`, { timeout: 120000 });
  await page.waitForSelector('text=Delivery distance', { timeout: 120000 });
  await page.waitForTimeout(9000);
  const vals = await page.evaluate(() => {
    const sec = [...document.querySelectorAll('div')].find((d) => d.textContent?.trim().startsWith('Delivery distance + fee') && d.querySelectorAll('input').length >= 3);
    const ins = sec ? [...sec.querySelectorAll('input')].map((i) => i.value) : [];
    return { distance: ins[0], perKm: ins[1], fee: ins[2] };
  });
  console.log('QUOTE DELIVERY:', JSON.stringify(vals));
  await page.locator('text=Delivery distance + fee').first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${OUT}/quote-delivery.png` });
  await ctx.close();
}
await browser.close();
