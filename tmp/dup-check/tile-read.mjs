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


// Read-only: wait for the quote list to load, then print the four KPI tiles.
const [email, path] = process.argv.slice(2);
const browser = await chromium.launch({ headless: true });
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await ctx.addCookies(await sessionCookies(email));
  await ctx.route('**/*', (r) => (['GET', 'HEAD', 'OPTIONS'].includes(r.request().method()) || r.request().url().includes('/auth/v1/') ? r.continue() : r.abort()));
  const page = await ctx.newPage();
  await page.goto(BASE + path, { waitUntil: 'domcontentloaded', timeout: 120000 });
  let tiles = '';
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(3000);
    tiles = await page.evaluate(() => { const h = [...document.querySelectorAll('*')].find((e) => e.textContent?.trim() === 'Total quotes'); let box = h; for (let j = 0; j < 6 && box; j++) box = box.parentElement; return box?.innerText || ''; });
    if (/Total quotes\s*\n\s*[1-9]/.test(tiles)) break;
  }
  console.log(tiles.replace(/\n+/g, ' | '));
  await page.screenshot({ path: process.argv[4], clip: { x: 340, y: 190, width: 1080, height: 220 } });
} finally { await browser.close(); }
