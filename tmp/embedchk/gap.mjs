// Visible space = next question's label top - this question's input/box bottom.
import { readFileSync, readdirSync } from 'node:fs';
import { chromium } from 'playwright';
const dir = 'public/embed';
const tpls = readdirSync(dir + '/templates').filter(f => f.endsWith('.js'));
const src = [readFileSync(dir + '/helpers.js', 'utf8'), ...tpls.map(f => readFileSync(dir + '/templates/' + f, 'utf8'))].join('\n;\n');
const browser = await chromium.launch({ executablePath: 'C:/Users/raj/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe' });
const fields = [
  { id: 'name', type: 'text', label: 'Name', required: true, visible: true, order: 1 },
  { id: 'email', type: 'email', label: 'Email', required: true, visible: true, order: 2 },
  { id: 'phone', type: 'phone', label: 'Phone', required: true, visible: true, order: 3 },
  { id: 'event_date', type: 'date', label: 'Date', required: true, visible: true, order: 4 },
  { id: 'guest_count', type: 'number', label: 'Guests', required: true, visible: true, order: 5 },
  { id: 'notes', type: 'textarea', label: 'Notes', required: false, visible: true, order: 7 },
];
for (const width of [700, 390]) {
  const page = await browser.newPage({ viewport: { width, height: 1000 } });
  await page.setContent('<div id=root></div>');
  await page.addScriptTag({ content: src });
  console.log('--- width', width);
  for (const f of tpls) {
    const t = f.replace('.js', '');
    const res = [];
    for (const gap of [undefined, 1, 36, 64]) {
      res.push(await page.evaluate(({ t, gap, fields }) => {
        const old = document.getElementById('h'); if (old) old.remove();
        const h = document.createElement('div'); h.id = 'h'; document.body.appendChild(h);
        const shadow = h.attachShadow({ mode: 'open' });
        const H = window.__cmsEmbedHelpers;
        const cfg = { fields, brand: { companyName: 'X' }, theme: gap === undefined ? {} : { field_spacing: gap }, currency: 'ZAR', tiers: [] };
        H.applyTheme(shadow, cfg.brand, cfg.theme);
        window.__cmsTemplates[t].render(shadow, cfg, cfg.brand, { ...H, submit() {}, estimate: () => Promise.resolve({ ok: true }) });
        const fs = [...shadow.querySelectorAll('.cms-field')].filter(e => e.offsetParent);
        const out = new Set();
        for (let i = 1; i < fs.length; i++) {
          const a = fs[i - 1], b = fs[i];
          const ab = a.getBoundingClientRect(), bb = b.getBoundingClientRect();
          if (bb.top < ab.bottom - 1 || Math.abs(bb.left - ab.left) > 2) continue; // same row / other column
          const box = (a.querySelector('input:not([type=hidden]),select,textarea') || a).getBoundingClientRect();
          out.add(Math.round(bb.top - box.bottom));
        }
        return [...out].join('/');
      }, { t, gap, fields }));
    }
    console.log(t.padEnd(22), 'unset', res[0].padEnd(8), '1px', res[1].padEnd(6), '36px', res[2].padEnd(6), '64px', res[3]);
  }
  await page.close();
}
await browser.close();
