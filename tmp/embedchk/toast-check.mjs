import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: 'C:/Users/raj/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe' });
for (const [w, h] of [[1440, 900], [390, 844]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  await ctx.route('**/*', (r) => ['GET', 'HEAD', 'OPTIONS'].includes(r.request().method()) ? r.continue() : r.abort());
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('PAGE ERROR', e.message));
  await page.goto('http://localhost:3001/quote/spit-braai-delivery/orders?preview=1', { timeout: 120000 });
  await page.waitForFunction(() => document.querySelector('[data-embed-form]')?.shadowRoot?.querySelector('form'), null, { timeout: 120000 });
  // Same trap as a website column: transform + overflow hidden around the form.
  await page.evaluate(() => { const p = document.querySelector('[data-embed-form]').parentElement; p.style.transform = 'translateZ(0)'; p.style.overflow = 'hidden'; });
  const fill = () => page.evaluate(() => {
    const r = document.querySelector('[data-embed-form]').shadowRoot;
    const set = (i, v) => { i.value = v; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); };
    r.querySelectorAll('.cms-step.is-active .cms-field input, .cms-step.is-active .cms-field select, .cms-step.is-active .cms-field textarea').forEach((i) => {
      if (i.closest('.cms-course-picker') || i.type === 'hidden' || i.type === 'checkbox' || i.type === 'radio' || i.value) return;
      const n = i.name || i.id;
      if (i.tagName === 'SELECT') { const o = [...i.options].find((o) => o.value); if (o) set(i, o.value); return; }
      if (i.type === 'email') return set(i, 'a@b.co');
      if (i.type === 'tel' || /phone/.test(n)) return set(i, '+27 82 123 4567');
      if (i.type === 'date') return set(i, '2027-03-20');
      if (i.type === 'time') return set(i, '13:00');
      if (i.type === 'number') return set(i, '50');
      set(i, 'Test');
    });
    r.querySelectorAll('.cms-step.is-active .cms-radio-group').forEach((g) => { const x = g.querySelector('input[type=radio]'); if (x && !g.querySelector('input:checked')) x.click(); });
  });
  for (let i = 0; i < 4; i++) {
    await fill();
    const next = page.locator('[data-embed-form] .cms-step-nav button:has-text("Next"), [data-embed-form] button:has-text("Next")').first();
    if (await next.isVisible().catch(() => false)) { await next.click(); await page.waitForTimeout(500); } else break;
  }
  const submit = page.locator('[data-embed-form] button[type=submit]').last();
  await submit.scrollIntoViewIfNeeded();
  await submit.click();
  await page.waitForTimeout(700);
  const info = await page.evaluate(() => {
    const t = document.querySelector('[data-cms-toast]')?.shadowRoot?.querySelector('.t');
    const b = t?.getBoundingClientRect();
    const r = document.querySelector('[data-embed-form]').shadowRoot;
    return { toast: t?.textContent, shown: t?.classList.contains('show'), box: b && [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)], font: t && getComputedStyle(t).fontFamily.slice(0, 40), btn: t && getComputedStyle(t.querySelector('.a')).backgroundColor, menuNote: r.querySelector('.cms-course-alert-text')?.textContent, invalid: r.querySelector('.cms-course-picker')?.getAttribute('aria-invalid') };
  });
  console.log(w, JSON.stringify(info));
  await page.screenshot({ path: `tmp/embedchk/toast-${w}.png` });
  // Show me -> menu in view; then pick a dish -> note + pop-up go away.
  await page.evaluate(() => document.querySelector('[data-cms-toast]').shadowRoot.querySelector('.a').click());
  await page.waitForTimeout(900);
  await page.screenshot({ path: `tmp/embedchk/toast-${w}-showme.png` });
  await page.evaluate(() => { const s = document.querySelector('[data-embed-form]').shadowRoot.querySelector('.cms-course-select'); const o = [...s.options].find((o) => o.value); s.value = o.value; s.dispatchEvent(new Event('change', { bubbles: true })); });
  await page.waitForTimeout(500);
  console.log(w, 'after pick', JSON.stringify(await page.evaluate(() => ({ shown: document.querySelector('[data-cms-toast]').shadowRoot.querySelector('.t').classList.contains('show'), invalid: document.querySelector('[data-embed-form]').shadowRoot.querySelector('.cms-course-picker').getAttribute('aria-invalid') }))));
  await ctx.close();
}
await browser.close();
