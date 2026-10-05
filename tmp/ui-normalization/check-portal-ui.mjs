// Read-only UI check for the waiter, shopping and cleaning portals.
// Logs in as each portal's own demo user, opens every page at desktop,
// tablet and phone widths, and records page errors, failed requests,
// console errors and horizontal overflow. Never clicks anything that saves.
//   node tmp/ui-normalization/check-portal-ui.mjs [--only shopping] [--tag before]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const args = process.argv.slice(2);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1].split(',') : null;
const tag = args.includes('--tag') ? args[args.indexOf('--tag') + 1] : 'now';
const BASE = 'http://localhost:3001';
const SLUG = 'spit-braai-delivery';
const OUT = `tmp/ui-normalization/portals-${tag}`;
mkdirSync(OUT, { recursive: true });

const env = {};
for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  if (line.trim().startsWith('#')) continue;
  const i = line.indexOf('=');
  if (i > 0) env[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
}
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const admin = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const storageKey = `sb-${new URL(url).hostname.split('.')[0]}-auth-token`;

const PORTALS = [
  { portal: 'kitchen', email: 'kitchen@spitbraaidelivery.co.za', routes: ['dashboard', 'today', 'duty', 'prep-list', 'production', 'stock', 'menu', 'calendar', 'notifications', 'settings', 'handovers'] },
  { portal: 'kitchen', label: 'kitchen-manager', email: 'kitchen.manager.demo@spitbraaidelivery.co.za', routes: ['management'] },
  { portal: 'driver', email: 'driver@spitbraaidelivery.co.za', routes: ['dashboard', 'routes', 'deliveries', 'calendar', 'earnings', 'notifications', 'schedule', 'tracking'] },
  { portal: 'waiter', email: 'waiter.demo@spitbraaidelivery.co.za', routes: ['dashboard', 'notifications'] },
  { portal: 'shopping', email: 'shopping@spitbraaidelivery.co.za', routes: ['dashboard', 'buy-list', 'orders', 'kitchen-demand', 'restock', 'inventory', 'suppliers', 'invoices', 'receipts', 'notifications', 'settings', 'alerts'] },
  { portal: 'cleaning', email: 'cleaning@spitbraaidelivery.co.za', routes: ['dashboard', 'tasks', 'schedules', 'supplies', 'equipment', 'damage', 'workflows', 'notifications', 'settings'] },
  { portal: 'cleaning', email: 'cleaning.manager.demo@spitbraaidelivery.co.za', routes: ['management'], label: 'cleaning-manager' },
  { portal: 'general', email: 'kitchen@spitbraaidelivery.co.za', routes: ['job-progress'] },
  { portal: 'client', email: 'universalsportmags23@gmail.com', base: `/${SLUG}/client-portal`, routes: ['dashboard', 'my-orders', 'quotes', 'billing', 'tracking', 'notifications', 'feedback', 'profile'] },
  { portal: 'platform', email: 'bobby@skylight-digital.co.za', base: '/admin/platform', routes: ['dashboard', 'company-database', 'user-management', 'subscription-management', 'pricing-management', 'trial-management', 'currency-monitoring', 'cms-blog', 'cms-pages', 'tax-rules', 'audit-logs', 'financial-dashboard', 'messaging-templates', 'payment-issues', 'running-todo', 'settings', 'tech-costs', 'tenant-health'] },
];
const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 1000 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'mobile', width: 390, height: 844 },
];

// One session per user per run, cached for 40 minutes: minting a magic
// link for every portal hit Supabase auth limits and stalled the run.
const SESSION_CACHE = 'tmp/ui-normalization/.session-cache.json';
function readCache() { try { return JSON.parse(readFileSync(SESSION_CACHE, 'utf8')); } catch { return {}; } }
async function sessionCookies(email) {
  const cache = readCache();
  if (cache[email] && cache[email].at > Date.now() - 40 * 60000) return cache[email].cookies;
  const cookies = await mintSessionCookies(email);
  cache[email] = { at: Date.now(), cookies };
  writeFileSync(SESSION_CACHE, JSON.stringify(cache));
  return cookies;
}
async function mintSessionCookies(email) {
  let data, error;
  for (let attempt = 0; attempt < 4; attempt++) {
    ({ data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email }));
    if (!error) break;
    await new Promise((r) => setTimeout(r, 4000 * (attempt + 1)));
  }
  if (error) throw new Error(`No session for ${email}: ${error.message}`);
  const anon = createClient(url, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: verified, error: verifyError } = await anon.auth.verifyOtp({ token_hash: data.properties.hashed_token, type: 'magiclink' });
  if (verifyError || !verified.session) throw new Error(`Session verify failed for ${email}`);
  const encoded = `base64-${Buffer.from(JSON.stringify(verified.session)).toString('base64url')}`;
  const cookies = [];
  for (let i = 0; i < encoded.length; i += 3180) {
    cookies.push({ name: encoded.length <= 3180 ? storageKey : `${storageKey}.${cookies.length}`, value: encoded.slice(i, i + 3180), domain: 'localhost', path: '/', sameSite: 'Lax' });
  }
  return cookies;
}

const browser = await chromium.launch({ headless: true });
const reports = [];
try {
  for (const p of PORTALS.filter((x) => !only || only.includes(x.portal) || only.includes(x.label))) {
    const ctx = await browser.newContext({ viewport: VIEWPORTS[0] });
    await ctx.addCookies(await sessionCookies(p.email));
    for (const route of p.routes) {
      const path = `${p.base || `/${SLUG}/team-portal/${p.portal}`}/${route}`;
      const report = { portal: p.label || p.portal, route, path, viewports: {} };
      for (const vp of VIEWPORTS) {
        const page = await ctx.newPage();
        await page.setViewportSize({ width: vp.width, height: vp.height });
        const pageErrors = [], failedRequests = [], consoleErrors = [];
        page.on('pageerror', (e) => pageErrors.push(e.message.slice(0, 300)));
        page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 300)); });
        page.on('response', (r) => { if (r.status() >= 400 && !r.url().includes('/_next/')) failedRequests.push({ url: r.url().slice(0, 160), status: r.status() }); });
        const res = await page.goto(BASE + path, { waitUntil: 'domcontentloaded', timeout: 120000 }).catch((e) => ({ error: e.message }));
        await page.waitForTimeout(6000);
        const body = await page.locator('body').innerText().catch(() => '');
        const result = {
          status: res?.status?.() ?? res?.error,
          finalPath: new URL(page.url()).pathname,
          loaded: !/Application error|Internal Server Error|This page could not be found|Unhandled Runtime Error/.test(body),
          denied: /Access Denied|You do not have permission|don't have permission/i.test(body),
          h1: (await page.locator('h1').allTextContents()).map((t) => t.trim()).slice(0, 3),
          overflow: await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
          height: await page.evaluate(() => document.documentElement.scrollHeight),
          pageErrors, failedRequests, consoleErrors: consoleErrors.slice(0, 8),
        };
        // Widest offending elements when the page scrolls sideways.
        if (result.overflow > 1) {
          result.offenders = await page.evaluate(() => {
            const out = [];
            for (const el of document.querySelectorAll('body *')) {
              const r = el.getBoundingClientRect();
              if (r.right > window.innerWidth + 1 && r.width > 0 && getComputedStyle(el).position !== 'fixed') {
                out.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 80)} right=${Math.round(r.right)}`);
              }
              if (out.length >= 6) break;
            }
            return out;
          });
        }
        await page.screenshot({ path: `${OUT}/${report.portal}-${route}-${vp.name}.png`, fullPage: true });
        report.viewports[vp.name] = result;
        await page.close();
      }
      reports.push(report);
      const d = report.viewports.desktop, m = report.viewports.mobile;
      console.log(`${report.portal}/${route}: ${d.status} loaded=${d.loaded} denied=${d.denied} errors=${d.pageErrors.length + m.pageErrors.length} failed=${d.failedRequests.length} overflow(d/t/m)=${d.overflow}/${report.viewports.tablet.overflow}/${m.overflow} h=${d.height}/${m.height}`);
    }
    await ctx.close();
  }
} finally {
  writeFileSync(`${OUT}/report.json`, JSON.stringify(reports, null, 2));
  await browser.close();
}
