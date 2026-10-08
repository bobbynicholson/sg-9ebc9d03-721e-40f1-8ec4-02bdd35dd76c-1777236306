import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: 'C:/Users/raj/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe' });
for (const w of [1440, 390]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 1100 } });
  await ctx.route('**/*', (r) => ['GET', 'HEAD', 'OPTIONS'].includes(r.request().method()) ? r.continue() : r.abort());
  const page = await ctx.newPage();
  await page.goto('http://localhost:3001/quote/spit-braai-delivery/orders?preview=1', { timeout: 120000 });
  await page.waitForFunction(() => document.querySelector('[data-embed-form]')?.shadowRoot?.querySelector('form'), null, { timeout: 120000 });
  await page.waitForTimeout(800);
  const r = await page.evaluate(() => {
    const root = document.querySelector('[data-embed-form]').shadowRoot;
    const fs = [...root.querySelectorAll('.cms-step.is-active .cms-field')].filter(e => e.offsetParent);
    const out = [];
    for (let i = 1; i < fs.length; i++) {
      const a = fs[i - 1], b = fs[i];
      const ab = a.getBoundingClientRect(), bb = b.getBoundingClientRect();
      if (bb.top < ab.bottom - 1) continue;
      const box = (a.querySelector('input:not([type=hidden]),select,textarea') || a).getBoundingClientRect();
      out.push(Math.round(bb.top - box.bottom));
    }
    return { v: getComputedStyle(root.host).getPropertyValue('--field-gap'), visible: out };
  });
  console.log(w, JSON.stringify(r));
  await page.screenshot({ path: `tmp/embedchk/gap-live-${w}.png` });
  // Errors still show and push the next question down (Next with empty fields).
  await page.locator('[data-embed-form] button:has-text("Next")').click().catch(() => {});
  await page.waitForTimeout(400);
  console.log(w, 'errors:', JSON.stringify(await page.evaluate(() => [...document.querySelector('[data-embed-form]').shadowRoot.querySelectorAll('.cms-error')].filter(e => e.textContent).map(e => { const b = e.getBoundingClientRect(); return [e.textContent.slice(0, 30), Math.round(b.height)]; }))));
  await page.screenshot({ path: `tmp/embedchk/gap-live-${w}-errors.png` });
  await ctx.close();
}
await browser.close();
