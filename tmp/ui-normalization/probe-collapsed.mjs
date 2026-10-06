// Collapsed rail + a page inside a folded section. Read-only.
import { readFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
const cache = JSON.parse(readFileSync('tmp/ui-normalization/.session-cache.json', 'utf8'));
const browser = await chromium.launch({ headless: true });
for (const [tag, collapsed] of [['platform-taxrules', false], ['platform-collapsed', true]]) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addCookies(cache['bobby@skylight-digital.co.za'].cookies);
  await ctx.route('**/*', (r) => (['GET', 'HEAD', 'OPTIONS'].includes(r.request().method()) || r.request().url().includes('/auth/v1/') ? r.continue() : r.abort()));
  if (collapsed) await ctx.addInitScript(() => { try { localStorage.setItem('platformNav-collapsed', 'true'); localStorage.setItem('cms:cmdk-hint-seen', '1'); } catch {} });
  else await ctx.addInitScript(() => { try { localStorage.setItem('cms:cmdk-hint-seen', '1'); } catch {} });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message.slice(0, 300)));
  await page.goto('http://localhost:3001/admin/platform/tax-rules', { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForTimeout(12000);
  await page.screenshot({ path: `tmp/ui-normalization/sidebar/${tag}.png` });
  await ctx.close();
}
await browser.close();
