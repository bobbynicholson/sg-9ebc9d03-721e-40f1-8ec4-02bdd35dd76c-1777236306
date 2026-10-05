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
const toast = async () => (await page.locator('[role="status"], li[role="status"], ol li').allTextContents()).join(' | ').slice(0, 300);

// 1. Semicolon CSV with BOM + duplicate emails
await open();
const csv = '﻿Name;Email;Phone\nAnna Smit;anna@example.co.za;082 111 2222\nBen Moyo;ben@example.co.za;083 222 3333\nAnna Again;ANNA@example.co.za;084 333 4444\n';
writeFileSync(`${dir}/semi.csv`, csv);
await page.locator('input[type=file]').setInputFiles(`${dir}/semi.csv`);
await page.waitForTimeout(800);
results.semicolonColumns = await page.locator("select[aria-label^='Import column']").evaluateAll((els) => els.map((e) => e.value));
results.firstHeaderCell = await page.locator('tbody tr td:first-child').first().textContent();
await page.getByRole('button', { name: /^Continue with \d+ rows?/ }).click();
await page.waitForTimeout(600);
results.duplicateFlag = await page.locator('ul li button').allTextContents();
// Fix the duplicate in place -> list clears
await page.locator("input[aria-label='Row 3 Email']").fill('anna2@example.co.za');
await page.waitForTimeout(300);
results.problemsAfterFix = await page.locator('ul li button').count();
results.importButton = await page.getByRole('button', { name: /^Import \d+ client/ }).textContent();

// 2. Two-sheet Excel: switch sheets
await open();
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Notes for staff'], ['ignore me']]), 'Readme');
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Client', 'E-mail', 'Cell'], ['Cara Ndlovu', 'cara@example.co.za', '082 444 5555'], ['Dev Pillay', 'dev@example.co.za', '083 555 6666']]), 'Clients');
XLSX.writeFile(wb, `${dir}/two-sheets.xlsx`);
await page.locator('input[type=file]').setInputFiles(`${dir}/two-sheets.xlsx`);
await page.waitForTimeout(800);
results.sheetOptions = await page.locator('select:not([aria-label])').first().locator('option').allTextContents();
await page.locator('select:not([aria-label])').first().selectOption('Clients');
await page.waitForTimeout(500);
results.afterSheetSwitch = await page.locator("select[aria-label^='Import column']").evaluateAll((els) => els.map((e) => e.value));
results.title = await page.locator('h2:has-text("Match columns")').textContent();

// 3. AI matching without a key on this machine
await page.getByRole('button', { name: 'Match with AI' }).click();
await page.waitForTimeout(3000);
results.aiMessage = await page.locator('p[role="status"]').first().textContent().catch(() => null);
await page.screenshot({ path: `${dir}/sheet-and-ai.png`, fullPage: true });

// 4. Oversized file (11 MB)
await page.getByRole('button', { name: 'Cancel' }).click();
await page.waitForTimeout(300);
writeFileSync(`${dir}/big.csv`, 'Name,Email\n' + 'x'.repeat(11 * 1024 * 1024));
await page.locator('input[type=file]').setInputFiles(`${dir}/big.csv`);
await page.waitForTimeout(1200);
results.bigFileToast = await toast();
results.stillOnUpload = await page.locator('text=Upload a file').count();

console.log(JSON.stringify({ ...results, posted, errors }, null, 1));
await browser.close();
