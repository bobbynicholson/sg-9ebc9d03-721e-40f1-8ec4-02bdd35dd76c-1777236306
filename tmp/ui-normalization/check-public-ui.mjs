// Read-only UI check for customer-facing link pages (R6) and the staff
// order document (R3). These pages write on load via POST (quote
// viewed_at stamp, client-token RPCs), so EVERY non-GET request from the
// browser is aborted and listed in the report. Tokens are only read from
// the database with SELECTs, never created.
//   node tmp/ui-normalization/check-public-ui.mjs [--tag before]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const args = process.argv.slice(2);
const tag = args.includes('--tag') ? args[args.indexOf('--tag') + 1] : 'now';
const BASE = 'http://localhost:3001';
const SLUG = 'spit-braai-delivery';
const OUT = `tmp/ui-normalization/public-${tag}`;
mkdirSync(OUT, { recursive: true });

const env = {};
for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  if (line.trim().startsWith('#')) continue;
  const i = line.indexOf('=');
  if (i > 0) env[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
}
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const db = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

// Reuse the portal check's cached sessions (same cookie format).
let sessionCache = {};
try { sessionCache = JSON.parse(readFileSync('tmp/ui-normalization/.session-cache.json', 'utf8')); } catch { /* none */ }

const first = async (q) => {
  const { data, error } = await q.limit(1);
  if (error) { console.log(`token lookup skipped: ${error.message}`); return null; }
  return data?.[0] ?? null;
};
const quote = await first(db.from('quotes').select('public_token, status').not('public_token', 'is', null).eq('status', 'sent').order('created_at', { ascending: false }));
const invoice = await first(db.from('invoices').select('id, public_token, status').not('public_token', 'is', null).order('created_at', { ascending: false }));
const accept = await first(db.from('outsource_assignments').select('accept_token').not('accept_token', 'is', null).order('created_at', { ascending: false }));
const order = await first(db.from('orders').select('id').order('created_at', { ascending: false }));

const PAGES = [
  quote && { name: 'quote', path: `/q/${quote.public_token}` },
  accept && { name: 'proposal-accept', path: `/p/accept/${accept.accept_token}` },
  invoice && { name: 'pay-invoice', path: `/pay/i/${invoice.public_token}` },
  invoice && { name: 'pay-invoice-legacy', path: `/pay/invoice/${invoice.id}` },
  { name: 'unsubscribe', path: '/u/check-not-a-real-token' },
  { name: 'customer-account', path: '/c/account' },
  order && { name: 'customer-order', path: `/c/order/${order.id}` },
  { name: 'client-login-short', path: `/p/${SLUG}` },
  { name: 'client-login', path: `/${SLUG}/client/login` },
  { name: 'select-role', path: '/auth/select-role', as: 'waiter.demo@spitbraaidelivery.co.za' },
  order && { name: 'order-doc-admin', path: `/${SLUG}/order/${order.id}`, as: 'hello@spitbraaidelivery.co.za' },
  order && { name: 'order-doc-kitchen', path: `/${SLUG}/order/${order.id}`, as: 'kitchen@spitbraaidelivery.co.za' },
].filter(Boolean);
const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 1000 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'mobile', width: 390, height: 844 },
];
const LOADING = /Verifying your credentials|^\s*Loading\.\.\.\s*$|Loading [a-z ]+\.\.\./im;

const browser = await chromium.launch({ headless: true });
const reports = [];
try {
  for (const p of PAGES) {
    const ctx = await browser.newContext({ viewport: VIEWPORTS[0] });
    if (p.as) {
      const cached = sessionCache[p.as];
      if (!cached) { console.log(`${p.name}: SKIPPED (no cached session for ${p.as}; run the portal check first)`); await ctx.close(); continue; }
      await ctx.addCookies(cached.cookies);
    }
    const blocked = [];
    await ctx.route('**/*', (route) => {
      const m = route.request().method();
      if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS') return route.continue();
      blocked.push(`${m} ${route.request().url().slice(0, 140)}`);
      return route.abort();
    });
    const report = { name: p.name, path: p.path.replace(/[A-Za-z0-9_-]{20,}/g, '<token>'), viewports: {}, blocked };
    for (const vp of VIEWPORTS) {
      const page = await ctx.newPage();
      await page.setViewportSize({ width: vp.width, height: vp.height });
      const pageErrors = [], failedRequests = [];
      page.on('pageerror', (e) => pageErrors.push(e.message.slice(0, 300)));
      page.on('response', (r) => { if (r.status() >= 400 && !r.url().includes('/_next/')) failedRequests.push({ url: r.url().slice(0, 160).replace(/[A-Za-z0-9_-]{20,}/g, '<token>'), status: r.status() }); });
      const res = await page.goto(BASE + p.path, { waitUntil: 'domcontentloaded', timeout: 120000 }).catch((e) => ({ error: e.message }));
      await page.waitForTimeout(6000);
      for (let i = 0; i < 15 && LOADING.test(await page.locator('body').innerText().catch(() => '')); i++) await page.waitForTimeout(3000);
      const body = await page.locator('body').innerText().catch(() => '');
      report.viewports[vp.name] = {
        status: res?.status?.() ?? res?.error,
        finalPath: new URL(page.url()).pathname.replace(/[A-Za-z0-9_-]{20,}/g, '<token>'),
        loaded: !/Application error|Internal Server Error|This page could not be found|Unhandled Runtime Error/.test(body),
        stillLoading: LOADING.test(body),
        h1: (await page.locator('h1').allTextContents()).map((t) => t.trim()).slice(0, 3),
        overflow: await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
        height: await page.evaluate(() => document.documentElement.scrollHeight),
        pageErrors, failedRequests,
      };
      await page.screenshot({ path: `${OUT}/${p.name}-${vp.name}.png`, fullPage: true });
      await page.close();
    }
    reports.push(report);
    const d = report.viewports.desktop, t = report.viewports.tablet, m = report.viewports.mobile;
    console.log(`${p.name}: ${d.status} -> ${d.finalPath} loaded=${d.loaded}${d.stillLoading ? ' STILL-LOADING' : ''} h1=${JSON.stringify(d.h1)} errors=${d.pageErrors.length + m.pageErrors.length} failed=${d.failedRequests.length} overflow(d/t/m)=${d.overflow}/${t.overflow}/${m.overflow} blockedWrites=${blocked.length}`);
    await ctx.close();
  }
} finally {
  writeFileSync(`${OUT}/report.json`, JSON.stringify(reports, null, 2));
  await browser.close();
}
