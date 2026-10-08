import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: 'C:/Users/raj/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe' });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
await ctx.route('**/*', (r) => ['GET', 'HEAD', 'OPTIONS'].includes(r.request().method()) ? r.continue() : r.abort());
const page = await ctx.newPage();
await page.goto('http://localhost:3001/quote/spit-braai-delivery/orders?preview=1', { timeout: 120000 });
await page.waitForFunction(() => document.querySelector('[data-embed-form]')?.shadowRoot?.querySelector('form'), null, { timeout: 120000 });
await page.waitForTimeout(800);
console.log(JSON.stringify(await page.evaluate(() => {
  const f = document.querySelector('[data-embed-form]').shadowRoot.querySelector('.cms-field');
  const fb = f.getBoundingClientRect();
  return { field: [Math.round(fb.top), Math.round(fb.height), getComputedStyle(f).gap, getComputedStyle(f).padding], kids: [...f.children].map(c => { const b = c.getBoundingClientRect(); const cs = getComputedStyle(c); return { tag: c.tagName, cls: c.className, text: (c.textContent||'').slice(0,30), top: Math.round(b.top - fb.top), h: Math.round(b.height), minH: cs.minHeight, display: cs.display, margin: cs.margin, vis: cs.visibility }; }) };
}), null, 1));
await browser.close();
