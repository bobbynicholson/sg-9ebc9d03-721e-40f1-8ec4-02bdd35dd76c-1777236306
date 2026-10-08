// Read-only check: does every page show times in the company's format?
// Signs in as each Spit Braai role (same sessions as open-as.mjs), opens
// its main pages, reads the visible text and reports raw stored times
// ("15:00:00"), 12-hour times on a 24h company's staff pages, and whether
// client-facing pages show both formats. Every non-GET request is blocked.
//   node tmp/local-login/check-times.mjs
import { readFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const BASE = 'http://localhost:3001';
const S = '/spit-braai-delivery';
const env = {};
for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const i = line.indexOf('=');
  if (i > 0 && !line.trim().startsWith('#')) env[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
}
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const admin = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const anon = createClient(url, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const storageKey = `sb-${new URL(url).hostname.split('.')[0]}-auth-token`;

async function cookiesFor(email) {
  const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (error) throw error;
  const { data: v } = await anon.auth.verifyOtp({ token_hash: data.properties.hashed_token, type: 'magiclink' });
  const enc = `base64-${Buffer.from(JSON.stringify(v.session)).toString('base64url')}`;
  const out = [];
  for (let i = 0; i < enc.length; i += 3180) out.push({ name: enc.length <= 3180 ? storageKey : `${storageKey}.${out.length}`, value: enc.slice(i, i + 3180), domain: 'localhost', path: '/', sameSite: 'Lax' });
  return out;
}

const { data: co } = await admin.from('companies').select('time_format').eq('id', '0e139a19-6526-4e1f-9bf7-87d6adbee5f8').single();
const FORMAT = co.time_format; // '24h' | '12h'
const tokens = {
  quote: (await admin.from('quotes').select('public_token').eq('quote_number', 'QUO-035927').single()).data.public_token,
  invoice: (await admin.from('invoices').select('public_token').eq('invoice_number', 'INV-005637').single()).data.public_token,
};

const ROLES = [
  { role: 'admin', email: 'hello@spitbraaidelivery.co.za', pages: ['/admin/dashboard', '/admin/calendar', '/admin/orders', '/admin/order-assignments', '/admin/route-planning', '/admin/tracking', '/admin/quotes', '/admin/invoices', '/admin/regions', '/admin/daily-operations'].map((p) => S + p) },
  { role: 'kitchen', email: 'kitchen@spitbraaidelivery.co.za', pages: ['dashboard', 'today', 'prep-list', 'calendar', 'duty', 'production'].map((p) => `${S}/team-portal/kitchen/${p}`) },
  { role: 'driver', email: 'driver@spitbraaidelivery.co.za', pages: ['dashboard', 'deliveries', 'routes', 'calendar', 'schedule'].map((p) => `${S}/team-portal/driver/${p}`) },
  { role: 'waiter', email: 'waiter.demo@spitbraaidelivery.co.za', pages: ['dashboard'].map((p) => `${S}/team-portal/waiter/${p}`) },
  { role: 'shopping', email: 'shopping@spitbraaidelivery.co.za', pages: ['dashboard', 'orders', 'buy-list', 'kitchen-demand'].map((p) => `${S}/team-portal/shopping/${p}`) },
  { role: 'cleaning', email: 'cleaning@spitbraaidelivery.co.za', pages: ['dashboard', 'tasks', 'schedules'].map((p) => `${S}/team-portal/cleaning/${p}`) },
  { role: 'client links', email: null, client: true, pages: [`/q/${tokens.quote}`, `/pay/i/${tokens.invoice}`] },
];

const RAW = /\b\d{2}:\d{2}:\d{2}\b/g;                 // stored value printed as-is
const H12 = /\b\d{1,2}:\d{2}\s?(?:AM|PM|am|pm)\b/g;      // 12-hour time
const BOTH = /\b\d{2}:\d{2}\s?\(\d{1,2}:\d{2}\s?(?:AM|PM|am|pm)\)|\b\d{1,2}:\d{2}\s?(?:AM|PM|am|pm)\s?\(\d{2}:\d{2}\)/;

const browser = await chromium.launch();
const rows = [];
for (const r of ROLES) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.route('**/*', (rt) => (['GET', 'HEAD', 'OPTIONS'].includes(rt.request().method()) || rt.request().url().includes('/auth/v1/') ? rt.continue() : rt.abort()));
  if (r.email) await ctx.addCookies(await cookiesFor(r.email));
  for (const path of r.pages) {
    const page = await ctx.newPage();
    let text = '', err = '';
    try {
      await page.goto(BASE + path, { waitUntil: 'domcontentloaded', timeout: 180000 });
      await page.waitForTimeout(9000);
      text = (await page.evaluate(() => document.body.innerText)).replace(/ /g, ' ');
      if (/Runtime Error|Unhandled Runtime|Application error/i.test(text)) err = 'PAGE ERROR';
    } catch (e) { err = 'LOAD FAILED ' + e.message.slice(0, 60); }
    const raw = [...new Set(text.match(RAW) || [])];
    const twelve = r.client ? [] : [...new Set((text.match(H12) || []))];
    const both = r.client ? BOTH.test(text) : null;
    const wrongFmt = FORMAT === '24h' ? twelve : [];
    rows.push({ role: r.role, path: path.replace(S, '').slice(0, 42), raw, wrongFmt, both, err });
    await page.close();
  }
  await ctx.close();
}
await browser.close();
console.log(`Company time format: ${FORMAT}`);
for (const x of rows) {
  const issues = [x.err, x.raw.length ? `RAW ${x.raw.slice(0, 4).join(' ')}` : '', x.wrongFmt.length ? `12h on 24h company: ${x.wrongFmt.slice(0, 4).join(' | ')}` : '', x.both === false ? 'client page without both formats' : ''].filter(Boolean);
  console.log(`${issues.length ? 'XX' : 'ok'}  ${x.role.padEnd(12)} ${x.path.padEnd(44)} ${issues.join(' ; ')}${x.both ? ' [both formats shown]' : ''}`);
}
