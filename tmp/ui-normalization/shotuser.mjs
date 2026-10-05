// Read-only: opens admin routes as the company admin and saves full-page screenshots
// plus a section summary. Run from repo root: node <this> /admin/a /admin/b ...
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(process.cwd() + '/package.json');
const { chromium } = require('@playwright/test');
const { createClient } = require('@supabase/supabase-js');
const env = {};
for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  if (line.trim().startsWith('#')) continue;
  const i = line.indexOf('=');
  if (i > 0) env[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
}
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const admin = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const { data } = await admin.auth.admin.generateLink({ type: 'magiclink', email: process.env.EMAIL || 'hello@spitbraaidelivery.co.za' });
const anon = createClient(url, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: v } = await anon.auth.verifyOtp({ token_hash: data.properties.hashed_token, type: 'magiclink' });
const browser = await chromium.launch({ headless: true });
const width = Number(process.env.W || 1440);
const ctx = await browser.newContext({ viewport: { width, height: 900 } });
const key = `sb-${new URL(url).hostname.split('.')[0]}-auth-token`;
const enc = `base64-${Buffer.from(JSON.stringify(v.session)).toString('base64url')}`;
const cookies = [];
for (let i = 0; i < enc.length; i += 3180) cookies.push({ name: enc.length <= 3180 ? key : `${key}.${cookies.length}`, value: enc.slice(i, i + 3180), domain: 'localhost', path: '/' });
await ctx.addCookies(cookies);
const out = process.env.OUT || 'tmp/ui-normalization/full';
mkdirSync(out, { recursive: true });
const summary = [];
for (const route of process.argv.slice(2)) {
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message.slice(0, 200)));
  await page.goto(`http://localhost:3001${route}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForTimeout(Number(process.env.WAIT || 5000));
  const info = await page.evaluate(() => ({
    height: document.documentElement.scrollHeight,
    overflow: document.documentElement.scrollWidth > innerWidth + 1,
    h1: document.querySelector('.admin-page-shell h1, main h1, h1')?.textContent?.trim(),
    sections: [...document.querySelectorAll('[data-collapsible]')].map(el => `${el.getAttribute('data-state')}:${(el.querySelector('[role="heading"],h2,h3')?.textContent || '').trim().slice(0, 40)}`),
    bigOpenCards: [...document.querySelectorAll('.admin-page-shell .rounded-xl.border:not([data-collapsible])')].filter(el => el.offsetHeight > 700 && !el.parentElement.closest('.rounded-xl.border')).map(el => `${el.offsetHeight}px:${(el.querySelector('[role="heading"],h2,h3')?.textContent || '').trim().slice(0, 40)}`),
  }));
  const file = `${out}/${route.replace(/[^a-z0-9]+/gi,'-').replace(/^-|-$/g,'')}-${process.env.TAG||'u'}-${width}.png`;
  await page.screenshot({ path: file, fullPage: true });
  summary.push({ route, errors, ...info });
  console.log(JSON.stringify({ route, errors: errors.length, ...info }));
  await page.close();
}
writeFileSync(`${out}/summary-${width}.json`, JSON.stringify(summary, null, 2));
await browser.close();
