// Pop-up per form style: render each template, press submit with nothing filled, shoot form + pop-up.
import { readFileSync, readdirSync } from 'node:fs';
import { chromium } from 'playwright';
const dir = 'public/embed';
const tpls = readdirSync(dir + '/templates').filter(f => f.endsWith('.js'));
const src = [readFileSync(dir + '/helpers.js', 'utf8'), ...tpls.map(f => readFileSync(dir + '/templates/' + f, 'utf8'))].join('\n;\n');
const browser = await chromium.launch({ executablePath: 'C:/Users/raj/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe' });
const fields = [
  { id: 'name', type: 'text', label: 'Name', required: true, visible: true, order: 1 },
  { id: 'email', type: 'email', label: 'Email', required: true, visible: true, order: 2 },
];
for (const f of tpls) {
  const t = f.replace('.js', '');
  const page = await browser.newPage({ viewport: { width: 900, height: 900 } });
  page.on('pageerror', (e) => console.log(t, 'PAGE ERROR', e.message));
  await page.setContent('<body style="margin:0;background:#c7d2fe;font-family:Georgia,serif"><div id=h></div></body>');
  await page.addScriptTag({ content: src });
  const out = await page.evaluate(async ({ t, fields }) => {
    const h = document.getElementById('h');
    const shadow = h.attachShadow({ mode: 'open' });
    const H = window.__cmsEmbedHelpers;
    const cfg = { fields, brand: { companyName: 'Spit Braai', primaryColor: '#329d0b' }, theme: { primary_color: '#7c3aed', button_radius: 'full', font_family: 'Georgia, serif' }, currency: 'ZAR', tiers: [] };
    H.applyTheme(shadow, cfg.brand, cfg.theme);
    window.__cmsTemplates[t].render(shadow, cfg, cfg.brand, { ...H, submit() { return Promise.resolve({ ok: true }); }, estimate: () => Promise.resolve({ ok: true }) });
    const fab = shadow.querySelector('.cms-fab'); if (fab) fab.click();
    const form = shadow.querySelector('form');
    form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    await new Promise(r => setTimeout(r, 400));
    const card = document.querySelector('[data-cms-toast]')?.shadowRoot?.querySelector('.t');
    if (!card) return { none: true };
    const cs = getComputedStyle(card), bs = getComputedStyle(card.querySelector('.a'));
    return { shown: card.classList.contains('show'), text: card.querySelector('.m').textContent, font: cs.fontFamily.slice(0, 30), bg: cs.backgroundColor, radius: cs.borderTopLeftRadius, btn: bs.backgroundColor + (bs.backgroundImage !== 'none' ? ' +gradient' : ''), btnText: bs.color, btnRadius: bs.borderTopLeftRadius };
  }, { t, fields });
  console.log(t.padEnd(21), JSON.stringify(out));
  await page.screenshot({ path: `tmp/embedchk/toast-style2-${t}.png`, clip: { x: 200, y: 720, width: 500, height: 180 } });
  await page.close();
}
await browser.close();
