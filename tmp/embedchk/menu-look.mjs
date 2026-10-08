import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: 'C:/Users/raj/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe' });
for (const width of [1440, 390]) {
  const ctx = await browser.newContext({ viewport: { width, height: 1000 } });
  await ctx.route('**/*', (r) => ['GET', 'HEAD', 'OPTIONS'].includes(r.request().method()) ? r.continue() : r.abort());
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('PAGEERROR', String(e).slice(0, 200)));
  await page.goto('http://localhost:3002/quote/spit-braai-delivery/orders?preview=1');
  await page.waitForFunction(() => document.querySelector('[data-embed-form]')?.shadowRoot?.querySelector('form'));
  // Jump straight to the Preferences step by filling required fields.
  await page.evaluate(() => {
    const r = document.querySelector('[data-embed-form]').shadowRoot;
    const set = (n, v) => { const i = r.querySelector(`[name="${n}"]`); if (i) { i.value = v; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); } };
    set('name', 'A'); set('email', 'a@b.co'); set('phone', '+27 82 123 4567');
  });
  await page.locator('[data-embed-form] button:has-text("Next")').click(); await page.waitForTimeout(300);
  await page.evaluate(() => {
    const r = document.querySelector('[data-embed-form]').shadowRoot;
    const s = r.querySelector('select[name="event_type"]'); s.value = s.options[1].value; s.dispatchEvent(new Event('change', { bubbles: true }));
    const d = r.querySelector('[name="event_date"]'); d.value = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10); d.dispatchEvent(new Event('input', { bubbles: true }));
    const g = r.querySelector('[name="guest_count"]'); g.value = '50'; g.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.locator('[data-embed-form] button:has-text("Next")').click(); await page.waitForTimeout(300);
  // Pick two starters and a main.
  const sel = page.locator('[data-embed-form] .cms-course-select');
  await sel.nth(0).selectOption({ index: 1 }); await sel.nth(0).selectOption({ index: 2 }); await sel.nth(1).selectOption({ index: 3 });
  await page.waitForTimeout(300);
  const menu = page.locator('[data-embed-form] [data-fid="menu_item_ids"]');
  await menu.scrollIntoViewIfNeeded();
  await menu.screenshot({ path: `tmp/embedchk/shots3/menu-new-${width}.png` });
  console.log(width, await page.locator('[data-embed-form] .cms-course-summary').textContent());
  await ctx.close();
}
await browser.close();
