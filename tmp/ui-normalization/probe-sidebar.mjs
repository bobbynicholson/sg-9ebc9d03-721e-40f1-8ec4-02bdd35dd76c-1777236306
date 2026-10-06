// Screenshot a portal sidebar: desktop viewport (top + scrolled to the
// bottom of the rail), collapsed rail, and the phone drawer. Read-only:
// non-GET requests are aborted (auth refresh allowed).
//   node tmp/ui-normalization/probe-sidebar.mjs <email> <path> <tag>
import { readFileSync, mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';
const [email, path, tag = 'sidebar'] = process.argv.slice(2);
const OUT = 'tmp/ui-normalization/sidebar';
mkdirSync(OUT, { recursive: true });
const cache = JSON.parse(readFileSync('tmp/ui-normalization/.session-cache.json', 'utf8'));
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addCookies(cache[email].cookies);
await ctx.route('**/*', (r) => (['GET', 'HEAD', 'OPTIONS'].includes(r.request().method()) || r.request().url().includes('/auth/v1/') ? r.continue() : r.abort()));
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR', e.message.slice(0, 300)));
await page.goto('http://localhost:3001' + path, { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForTimeout(12000);
await page.screenshot({ path: `${OUT}/${tag}-desktop.png` });
// Rail contents as text, to see every section and item.
const railText = await page.evaluate(() => {
  const rail = [...document.querySelectorAll('div')].find((d) => getComputedStyle(d).position === 'fixed' && d.getBoundingClientRect().left === 0 && d.getBoundingClientRect().height > 600);
  return rail ? rail.innerText : 'NO RAIL';
});
console.log('RAIL:\n' + railText);
// Scroll the rail's scroll area to the bottom.
await page.evaluate(() => { document.querySelectorAll('[data-radix-scroll-area-viewport]').forEach((v) => { v.scrollTop = v.scrollHeight; }); });
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/${tag}-desktop-bottom.png` });
// Phone drawer.
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/${tag}-mobile-bar.png` });
const burger = page.locator('button[aria-label*="menu" i], button[aria-label*="navigation" i]').first();
if (await burger.count()) { await burger.click(); await page.waitForTimeout(1200); await page.screenshot({ path: `${OUT}/${tag}-mobile-drawer.png` }); } else console.log('NO BURGER');
await browser.close();
