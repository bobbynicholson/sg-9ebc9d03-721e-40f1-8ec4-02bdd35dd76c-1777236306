// Load one page with a cached session and print page errors (read-only).
//   node tmp/ui-normalization/probe-page.mjs <email> <path> [width]
import { readFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
const [email, path, width = '1440'] = process.argv.slice(2);
const cache = JSON.parse(readFileSync('tmp/ui-normalization/.session-cache.json', 'utf8'));
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: Number(width), height: 900 } });
if (cache[email]) await ctx.addCookies(cache[email].cookies);
await ctx.route('**/*', (r) => (['GET', 'HEAD', 'OPTIONS'].includes(r.request().method()) || r.request().url().includes('/auth/v1/') ? r.continue() : r.abort()));
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR', e.message.slice(0, 600)));
page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE', m.text().slice(0, 400)); });
await page.goto('http://localhost:3001' + path, { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForTimeout(15000);
console.log('SCROLLY', await page.evaluate(() => window.scrollY));
console.log('FINAL', new URL(page.url()).pathname, 'H1', JSON.stringify(await page.locator('h1').allTextContents()));
await page.screenshot({ path: process.env.PROBE_OUT || 'tmp/ui-normalization/probe.png', fullPage: !!process.env.PROBE_FULL });
await browser.close();
