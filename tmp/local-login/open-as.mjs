// Local testing helper: opens a real, signed-in browser window for each
// Spit Braai test account against the local dev server, so every portal
// can be clicked through as that user.
//
//   node tmp/local-login/open-as.mjs            -> every account below
//   node tmp/local-login/open-as.mjs driver kitchen   -> just those labels
//   node tmp/local-login/open-as.mjs --list     -> show the labels
//
// Needs the dev server on http://localhost:3001 (npm run dev -- -p 3001).
// The dev server uses the LIVE database: anything you save, send or
// accept in these windows is real (emails to clients included).
//
// Sessions are minted with the service-role key (magic link verified
// server-side, nothing emailed) and handed to the browser as the same
// Supabase auth cookies the app sets on sign-in. Only the accounts listed
// here can be opened.
import { readFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const BASE = 'http://localhost:3001';
const SLUG = 'spit-braai-delivery';

const ACCOUNTS = [
  { label: 'owner', email: 'hello@spitbraaidelivery.co.za', path: '/auth/select-role' },
  { label: 'kitchen', email: 'kitchen@spitbraaidelivery.co.za', path: `/${SLUG}/team-portal/kitchen/dashboard` },
  { label: 'kitchen-manager', email: 'kitchen.manager.demo@spitbraaidelivery.co.za', path: `/${SLUG}/team-portal/kitchen/management` },
  { label: 'driver', email: 'driver@spitbraaidelivery.co.za', path: `/${SLUG}/team-portal/driver/dashboard` },
  { label: 'waiter', email: 'waiter.demo@spitbraaidelivery.co.za', path: `/${SLUG}/team-portal/waiter/dashboard` },
  { label: 'shopping', email: 'shopping@spitbraaidelivery.co.za', path: `/${SLUG}/team-portal/shopping/dashboard` },
  { label: 'cleaning', email: 'cleaning@spitbraaidelivery.co.za', path: `/${SLUG}/team-portal/cleaning/dashboard` },
  { label: 'cleaning-manager', email: 'cleaning.manager.demo@spitbraaidelivery.co.za', path: '/auth/select-role' },
];

const args = process.argv.slice(2);
if (args.includes('--list')) {
  for (const a of ACCOUNTS) console.log(`${a.label.padEnd(18)} ${a.email}`);
  process.exit(0);
}
const unknown = args.filter((a) => !ACCOUNTS.some((x) => x.label === a));
if (unknown.length) {
  console.error(`Unknown label(s): ${unknown.join(', ')}. Run with --list.`);
  process.exit(1);
}
const chosen = args.length ? ACCOUNTS.filter((a) => args.includes(a.label)) : ACCOUNTS;

const env = {};
for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  if (line.trim().startsWith('#')) continue;
  const i = line.indexOf('=');
  if (i > 0) env[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
}
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const admin = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const anon = createClient(url, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const storageKey = `sb-${new URL(url).hostname.split('.')[0]}-auth-token`;

async function sessionCookies(email) {
  const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (error) throw new Error(`${email}: ${error.message}`);
  const { data: verified, error: verifyError } = await anon.auth.verifyOtp({
    token_hash: data.properties.hashed_token,
    type: 'magiclink',
  });
  if (verifyError || !verified.session) throw new Error(`${email}: session verify failed`);
  const encoded = `base64-${Buffer.from(JSON.stringify(verified.session)).toString('base64url')}`;
  const cookies = [];
  for (let i = 0; i < encoded.length; i += 3180) {
    cookies.push({
      name: encoded.length <= 3180 ? storageKey : `${storageKey}.${cookies.length}`,
      value: encoded.slice(i, i + 3180),
      domain: 'localhost',
      path: '/',
      sameSite: 'Lax',
    });
  }
  return cookies;
}

try {
  const res = await fetch(`${BASE}/auth/login`, { signal: AbortSignal.timeout(90000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
} catch (e) {
  console.error(`Dev server not reachable on ${BASE} (${e.message}). Start it with: npm run dev -- -p 3001`);
  process.exit(1);
}

const browser = await chromium.launch({ headless: false, args: ['--start-maximized'] });
const pages = [];
for (const a of chosen) {
  try {
    // Separate context per account = separate cookie jar, so the
    // windows never share a session.
    const ctx = await browser.newContext({ viewport: null });
    await ctx.addCookies(await sessionCookies(a.email));
    const page = await ctx.newPage();
    pages.push(page);
    page.goto(BASE + a.path, { timeout: 120000 }).catch(() => {});
    console.log(`opened  ${a.label.padEnd(18)} ${a.email}`);
  } catch (e) {
    console.error(`FAILED  ${a.label.padEnd(18)} ${e.message}`);
  }
}
console.log('\nLIVE database: saves, sends and accepts in these windows are real.');
console.log('Close every window (or Ctrl+C here) to finish.');
await Promise.all(pages.map((p) => new Promise((r) => p.on('close', r))));
await browser.close();
