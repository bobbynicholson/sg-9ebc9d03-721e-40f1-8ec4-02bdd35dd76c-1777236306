// Read-only: opens admin routes as the company admin and saves full-page screenshots
// plus a section summary. Run from repo root: node <this> /admin/a /admin/b ...
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(process.cwd() + '/package.json');
const { chromium } = require('@playwright/test');
const { createClient } = require('@supabase/supabase-js');
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
const width = Number(process.env.W || 1440);
const ctx = await browser.newContext({ viewport: { width, height: 900 } });
const key = `sb-${new URL(url).hostname.split('.')[0]}-auth-token`;
const enc = `base64-${Buffer.from(JSON.stringify(v.session)).toString('base64url')}`;
const cookies = [];
for (let i = 0; i < enc.length; i += 3180) cookies.push({ name: enc.length <= 3180 ? key : `${key}.${cookies.length}`, value: enc.slice(i, i + 3180), domain: 'localhost', path: '/' });
await ctx.addCookies(cookies);
const out = process.env.OUT || 'tmp/ui-normalization/full';
mkdirSync(out, { recursive: true });
// Read-only walkthrough of the client importer. Never presses Import.
const page = await ctx.newPage();
const errors = [];
const posted = [];
page.on("pageerror", (e) => errors.push(e.message.slice(0, 200)));
page.on("request", (r) => { if (r.method() === "POST" && r.url().includes("/api/")) posted.push(new URL(r.url()).pathname); });
await page.goto("http://localhost:3001/spit-braai-delivery/admin/onboarding/clients", { waitUntil: "domcontentloaded", timeout: 90000 });
await page.waitForTimeout(9000);
const TAB = String.fromCharCode(9);
const NL = String.fromCharCode(10);
const tsv = [
  ["Full Name", "E-mail Address", "Cell", "Town", "Remarks"],
  ["Thandi Mokoena", "thandi@example.co.za", "082 555 1234", "Cape Town", "VIP"],
  ["Pieter Botha", "", "083 111 2222", "Pretoria", ""],
  ["Lerato Dlamini", "lerato@example", "12", "Durban", "Corporate"],
  ["Sam Naidoo", "sam@example.co.za", "084 999 0000", "Johannesburg", ""],
].map((r) => r.join(TAB)).join(NL);
await page.locator("textarea").first().fill(tsv);
await page.getByRole("button", { name: "Continue with pasted rows" }).click();
await page.waitForTimeout(800);
const selectsByName = await page.locator("select[aria-label^='Import column']").evaluateAll((els) => els.map((e) => e.value));
await page.getByRole("button", { name: "Match with AI" }).click();
await page.waitForTimeout(4000);
const aiNote = await page.locator("p:has(svg.lucide-sparkles)").first().textContent().catch(() => null);
await page.screenshot({ path: `${out}/import-step2.png`, fullPage: true });
const pick = (i, v) => page.locator(`select[aria-label='Import column ${i + 1} as']`).selectOption(v);
await pick(0, "name"); await pick(1, "email"); await pick(2, "mobile_number"); await pick(3, "billing_city"); await pick(4, "notes");
await page.getByRole("button", { name: /^Continue with \d+ rows?/ }).click();
await page.waitForTimeout(800);
const fixList = await page.locator("ul li button").allTextContents();
await page.locator("ul li button").nth(1).click();
await page.waitForTimeout(900);
const focused = await page.evaluate(() => document.activeElement?.id || "");
await page.screenshot({ path: `${out}/import-step3.png`, fullPage: true });
await page.locator("input[aria-label='Row 2 Email']").fill("pieter@example.co.za");
await page.waitForTimeout(300);
const fixAfter = await page.locator("ul li button").count();
const importLabel = await page.getByRole("button", { name: /^Import \d+ client/ }).textContent();
console.log(JSON.stringify({ selectsByName, aiNote, fixList, focused, fixAfter, importLabel, posted, errors }, null, 1));
await browser.close();
