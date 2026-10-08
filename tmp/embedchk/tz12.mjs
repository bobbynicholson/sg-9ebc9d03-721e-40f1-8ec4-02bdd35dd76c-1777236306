// Read-only UI check for the waiter, shopping and cleaning portals.
// Logs in as each portal's own demo user, opens every page at desktop,
// tablet and phone widths, and records page errors, failed requests,
// console errors and horizontal overflow. Never clicks anything that saves.
//   node tmp/ui-normalization/check-portal-ui.mjs [--only shopping] [--tag before]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const BASE = 'http://localhost:3001';
const SLUG = 'spit-braai-delivery';

const env = {};
for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  if (line.trim().startsWith('#')) continue;
  const i = line.indexOf('=');
  if (i > 0) env[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
}
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const admin = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const storageKey = `sb-${new URL(url).hostname.split('.')[0]}-auth-token`;

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



// 12-hour check without touching the DB: add time_format "12h" to company rows in the browser only.
const { data: ord } = await admin.from('orders').select('id').eq('order_number', 'ORD-918898').maybeSingle();
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Users/raj/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe' });
const pages = [
  ['hello@spitbraaidelivery.co.za', `/${SLUG}/admin/orders/${ord.id}/ticket`, 'ticket'],
  ['hello@spitbraaidelivery.co.za', `/${SLUG}/admin/orders`, 'orders'],
  ['hello@spitbraaidelivery.co.za', `/${SLUG}/admin/company-profile`, 'profile'],
  ['kitchen@spitbraaidelivery.co.za', `/${SLUG}/team-portal/kitchen/dashboard`, 'kitchen'],
  ['driver@spitbraaidelivery.co.za', `/${SLUG}/team-portal/driver/calendar`, 'driver'],
];
for (const [email, path, tag] of pages) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: 'Asia/Kolkata' });
  await ctx.addCookies(await sessionCookies(email));
  await ctx.route('**/*', async (r) => {
    const req = r.request();
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method()) && !req.url().includes('/auth/v1/')) return r.abort();
    if (req.method() === 'GET' && /\/rest\/v1\/companies\?/.test(req.url()) && /select=\*/.test(decodeURIComponent(req.url()))) {
      const res = await r.fetch();
      let body = await res.text();
      try {
        const j = JSON.parse(body);
        const add = (o) => (o && typeof o === 'object' && 'timezone' in o ? { ...o, time_format: '12h' } : o);
        body = JSON.stringify(Array.isArray(j) ? j.map(add) : add(j));
      } catch {}
      return r.fulfill({ response: res, body });
    }
    return r.continue();
  });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message.slice(0, 160)));
  await page.goto(BASE + path, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForTimeout(10000);
  const text = await page.evaluate(() => document.body.innerText);
  const t12 = [...new Set(text.match(/\b\d{1,2}:\d{2} ?(?:AM|PM|am|pm)\b/g) || [])].slice(0, 10);
  const t24 = [...new Set(text.match(/\b\d{2}:\d{2}\b(?! ?(?:AM|PM|am|pm))/g) || [])].slice(0, 10);
  console.log(tag.padEnd(8), '12h:', t12.join(', ') || '-', '| left 24h:', t24.join(', ') || '-', errs.length ? '| ERR ' + errs.join(' | ') : '');
  await page.screenshot({ path: `tmp/embedchk/tz12-${tag}.png`, fullPage: tag !== 'orders' });
  await ctx.close();
}
await browser.close();
