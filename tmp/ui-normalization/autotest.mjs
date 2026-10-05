// Read-only edge-case walkthrough of /admin/onboarding/clients. Never presses Import.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(process.cwd() + '/package.json');
const { chromium } = require('@playwright/test');
const { createClient } = require('@supabase/supabase-js');
const XLSX = require('xlsx');

const env = {};
for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  if (line.trim().startsWith('#')) continue;
  const i = line.indexOf('=');
  if (i > 0) env[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
}
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const admin = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const { data } = await admin.auth.admin.generateLink({ type: 'magiclink', email: 'hello@spitbraaidelivery.co.za' });
const anon = createClient(url, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: v } = await anon.auth.verifyOtp({ token_hash: data.properties.hashed_token, type: 'magiclink' });
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const key = `sb-${new URL(url).hostname.split('.')[0]}-auth-token`;
const enc = `base64-${Buffer.from(JSON.stringify(v.session)).toString('base64url')}`;
const cookies = [];
for (let i = 0; i < enc.length; i += 3180) cookies.push({ name: enc.length <= 3180 ? key : `${key}.${cookies.length}`, value: enc.slice(i, i + 3180), domain: 'localhost', path: '/' });
await ctx.addCookies(cookies);

const dir = 'tmp/ui-normalization/edge';
mkdirSync(dir, { recursive: true });
const results = {};
const errors = [];
const posted = [];

const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(e.message.slice(0, 200)));
page.on('request', (r) => { if (r.method() === 'POST' && r.url().includes('/api/')) posted.push(new URL(r.url()).pathname); });
const open = async () => {
  await page.goto('http://localhost:3001/spit-braai-delivery/admin/onboarding/clients', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForTimeout(8000);
};
const NL = String.fromCharCode(10);
const state = async () => ({
  onMatchScreen: await page.locator('h2:has-text("Match columns")').count(),
  reviewRows: await page.locator('tbody tr[data-row-key]').count(),
  autoBanner: (await page.locator('div[role=status]:has-text("matched automatically")').allTextContents()).join(' ').trim().slice(0, 160),
  note: (await page.locator('p[role=status]').allTextContents()).join(' | ').trim().slice(0, 200),
});
const upload = async (name, lines) => {
  writeFileSync(`${dir}/${name}`, lines.join(NL) + NL);
  await page.locator('input[type=file]').setInputFiles(`${dir}/${name}`);
  await page.waitForTimeout(4000);
};

await open();
let before = posted.length;
await upload('known.csv', ['Name,Email,Phone', 'Anna Smit,anna@example.co.za,082 111 2222', 'Ben Moyo,ben@example.co.za,083 222 3333']);
results.allKnown = { ...(await state()), aiCalls: posted.length - before };
await page.screenshot({ path: `${dir}/auto-known.png`, fullPage: true });
await page.getByRole('button', { name: 'Change column matches' }).click();
await page.waitForTimeout(600);
results.afterChangeMatches = await state();

await open();
before = posted.length;
await upload('odd.csv', ['Klant,Contact via,Reach me on', 'Cara Ndlovu,cara@example.co.za,082 444 5555']);
results.unusualNoAi = { ...(await state()), aiCalls: posted.length - before };

await open();
before = posted.length;
await upload('mixed.csv', ['Name,Email,Favourite dish', 'Dev Pillay,dev@example.co.za,Braai']);
results.mixedFallback = { ...(await state()), aiCalls: posted.length - before };


console.log(JSON.stringify({ ...results, errors }, null, 1));
await browser.close();
