import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: 'C:/Users/raj/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe' });
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1000 } });
// Read-only: abort every non-GET so nothing can be submitted.
await ctx.route('**/*', (r) => ['GET', 'HEAD', 'OPTIONS'].includes(r.request().method()) ? r.continue() : r.abort());
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
let googleCalls = 0, photonCalls = 0;
page.on('request', (r) => { if (r.url().includes('maps.googleapis.com')) googleCalls++; if (r.url().includes('address-suggest')) photonCalls++; });
await page.goto('https://cateringms.com/quote/spit-braai-delivery/orders');
await page.waitForFunction(() => document.querySelector('[data-embed-form]')?.shadowRoot?.querySelector('form'), null, { timeout: 45000 });
const width = await page.evaluate(() => Math.round(document.querySelector('[data-embed-form]').shadowRoot.querySelector('form').getBoundingClientRect().width));
await page.evaluate(() => {
  const r = document.querySelector('[data-embed-form]').shadowRoot;
  const set = (n, v) => { const i = r.querySelector(`[name="${n}"]`); if (i) { i.value = v; i.dispatchEvent(new Event('input', { bubbles: true })); } };
  set('name', 'Test'); set('email', 'test@example.com'); set('phone', '+27 82 123 4567');
});
const next = page.locator('[data-embed-form] button:has-text("Next")');
if (await next.isVisible()) { await next.click(); await page.waitForTimeout(400); }
const venue = page.locator('[data-embed-form] input[name="venue"]');
await venue.click();
await venue.pressSequentially('17 Denison Way Edgemead', { delay: 60 });
await page.locator('[data-embed-form] [data-fid="venue"] .cms-suggest-item').first().waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
const items = await page.evaluate(() => [...document.querySelector('[data-embed-form]').shadowRoot.querySelectorAll('[data-fid="venue"] .cms-suggest-item')].map((i) => i.innerText.replace(/\n/g, ' | ')));
const googleUsed = await page.evaluate(() => !!(window.google && window.google.maps && window.google.maps.places));
await page.screenshot({ path: 'tmp/embedchk/shots2/live-address.png' });
console.log(JSON.stringify({ formWidth: width, googleLoaded: googleUsed, googleRequests: googleCalls, osmRequests: photonCalls, suggestions: items.slice(0, 5), pageErrors: errors }, null, 1));
await browser.close();
