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



// Portal time zone check: viewer browsers in other zones must see company (Johannesburg) times.
const { data: ord } = await admin.from('orders').select('id, order_number, event_date, event_time, pickup_time, company_id')
  .eq('order_number', 'ORD-918898').maybeSingle();
const { data: co } = await admin.from('companies').select('timezone').eq('id', ord.company_id).maybeSingle();
console.log('order', ord.order_number, ord.event_date, ord.event_time, 'pickup', ord.pickup_time, 'company tz', co.timezone);
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Users/raj/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe' });
const cookies = await sessionCookies('hello@spitbraaidelivery.co.za');
for (const tz of ['Asia/Kolkata', 'America/New_York', 'Africa/Johannesburg']) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: tz });
  await ctx.addCookies(cookies);
  await ctx.route('**/*', (r) => (['GET', 'HEAD', 'OPTIONS'].includes(r.request().method()) || r.request().url().includes('/auth/v1/') ? r.continue() : r.abort()));
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message.slice(0, 160)));
  await page.goto(`${BASE}/${SLUG}/admin/orders/${ord.id}/ticket`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForTimeout(9000);
  const r = await page.evaluate(() => ({
    sample: new Date('2026-10-08T08:00:00Z').toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' }),
    sampleDate: new Date(2026, 9, 10).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' }),
    text: document.body.innerText,
  }));
  const times = [...new Set((r.text.match(/\b\d{1,2}:\d{2}\b/g) || []))].slice(0, 12);
  console.log(tz.padEnd(20), '08:00Z ->', r.sample, '| 10 Oct local ->', r.sampleDate, '| times on ticket:', times.join(' '), errs.length ? 'ERR ' + errs.join(' | ') : '');
  if (tz === 'Asia/Kolkata') await page.screenshot({ path: 'tmp/embedchk/tz-ticket-kolkata.png' });
  await ctx.close();
}
await browser.close();
