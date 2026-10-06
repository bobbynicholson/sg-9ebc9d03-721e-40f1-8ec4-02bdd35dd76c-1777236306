// Read-only timing profile of /admin/contacts for the Spit Braai admin.
import { readFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const env = {};
for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  if (line.trim().startsWith('#')) continue;
  const i = line.indexOf('=');
  if (i > 0) env[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
}
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const admin = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data } = await admin.auth.admin.generateLink({ type: 'magiclink', email: 'hello@spitbraaidelivery.co.za' });
const anon = createClient(url, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const { data: v } = await anon.auth.verifyOtp({ token_hash: data.properties.hashed_token, type: 'magiclink' });
const key = `sb-${new URL(url).hostname.split('.')[0]}-auth-token`;
const encoded = `base64-${Buffer.from(JSON.stringify(v.session)).toString('base64url')}`;
const cookies = [];
for (let i = 0; i < encoded.length; i += 3180) cookies.push({ name: encoded.length <= 3180 ? key : `${key}.${cookies.length}`, value: encoded.slice(i, i + 3180), domain: 'localhost', path: '/', sameSite: 'Lax' });

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await ctx.addCookies(cookies);
const page = await ctx.newPage();
const reqs = new Map();
const t0 = Date.now();
page.on('request', (r) => { if (r.url().includes('/rest/v1/') || r.url().includes('/realtime')) reqs.set(r, { url: r.url(), start: Date.now() - t0 }); });
page.on('requestfinished', async (r) => {
  const e = reqs.get(r); if (!e) return;
  e.end = Date.now() - t0; try { const resp = await r.response(); e.status = resp?.status(); if (e.status >= 400) e.body = (await resp.text()).slice(0, 200); } catch {}
  try { const s = await r.sizes(); e.kb = Math.round(s.responseBodySize / 1024); } catch {}
});
await page.goto('http://localhost:3001/spit-braai-delivery/admin/contacts', { waitUntil: 'domcontentloaded', timeout: 180000 });
const domAt = Date.now() - t0;
// Wait until the table shows the "Showing x-y of N" pager or 120s.
await page.getByText(/Showing \d+-\d+ of/).first().waitFor({ timeout: 180000 }).catch(() => {});
const readyAt = Date.now() - t0;
const longTasks = await page.evaluate(() => new Promise((res) => {
  const out = []; try { new PerformanceObserver((l) => l.getEntries().forEach((e) => out.push(Math.round(e.duration)))).observe({ type: 'longtask', buffered: true }); } catch {}
  setTimeout(() => res(out), 500);
}));
console.log(`DOM ready ${domAt}ms, contacts visible ${readyAt}ms`);
const rows = [...reqs.values()].filter((e) => e.end).sort((a, b) => a.start - b.start);
for (const e of rows) {
  const u = new URL(e.url);
  if (e.body) console.log("   ERR", e.body);
  console.log(`${String(e.start).padStart(6)} -> ${String(e.end).padStart(6)} (${String(e.end - e.start).padStart(5)}ms, ${e.kb ?? "?"}kB, ${e.status}) ${u.pathname.replace('/rest/v1/', '')}?${decodeURIComponent(u.search).slice(1, 110)}`);
}
console.log('long tasks (ms):', longTasks.sort((a, b) => b - a).slice(0, 10).join(', '), 'total', longTasks.reduce((a, b) => a + b, 0));
// Typing responsiveness: time from keystroke to filtered list.
const box = page.getByPlaceholder(/search/i).first();
const ts = Date.now();
await box.fill('smith');
await page.waitForTimeout(50);
await page.getByText(/Showing \d+-\d+ of/).first().waitFor();
console.log(`search "smith" settled ~${Date.now() - ts}ms`);
await browser.close();
