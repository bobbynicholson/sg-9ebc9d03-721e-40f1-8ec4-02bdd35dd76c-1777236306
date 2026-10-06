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

// Read-only: never presses Import.
await open();
await upload('broken.csv', [
  'Name,Email,Phone',
  'Anna Smit,,082 111 2222',
  ',bad-row@example.co.za,083 222 3333',
  'Cara Ndlovu,cara@example,084 333 4444',
  'Ben Moyo,ben@example.co.za,085 444 5555',
]);
const dialog = page.getByRole('dialog');
results.problemsAtStart = await page.locator('ul li button').count();
await page.getByRole('button', { name: /^Resolve \d+ rows?/ }).click();
await page.waitForTimeout(500);
results.dialog1 = {
  title: (await dialog.getByRole('heading').first().textContent())?.trim(),
  issues: (await dialog.locator('ul li').allTextContents()).map((t) => t.trim()),
  focused: await page.evaluate(() => document.activeElement?.getAttribute("aria-invalid") ?? null),
};
await page.keyboard.type('anna@example.co.za');
results.dialog1ReadyNote = (await dialog.locator('p:has-text("ready")').count()) > 0;
await page.screenshot({ path: `${dir}/resolve-dialog.png` });
await dialog.getByRole('button', { name: /Save/ }).click();
await page.waitForTimeout(500);
results.dialog2 = (await dialog.getByRole('heading').first().textContent())?.trim();
await dialog.getByRole('button', { name: 'Remove row' }).click();
await page.waitForTimeout(500);
results.dialog3 = (await dialog.getByRole('heading').first().textContent())?.trim();
await dialog.locator('input').nth(2).fill('cara@example.co.za');
await dialog.getByRole('button', { name: /^Save/ }).click();
await page.waitForTimeout(700);
results.dialogOpenAfterLast = await dialog.count();
results.problemsAtEnd = await page.locator('ul li button').count();
results.importButton = (await page.getByRole('button', { name: /^Import \d+ client/ }).textContent())?.trim();
results.toastText = (await page.locator('ol li').allTextContents()).join(' | ').slice(0, 160);
console.log(JSON.stringify({ ...results, errors }, null, 1));
await browser.close();

