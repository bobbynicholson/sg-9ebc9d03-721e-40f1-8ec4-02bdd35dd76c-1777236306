// CPU profile of /admin/contacts load + one search (read-only).
import { readFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const env = {};
for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  if (line.trim().startsWith('#')) continue;
  const i = line.indexOf('=');
  if (i > 0) env[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
}
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const admin = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data } = await admin.auth.admin.generateLink({ type: 'magiclink', email: 'hello@spitbraaidelivery.co.za' });
const anon = createClient(url, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const { data: v } = await anon.auth.verifyOtp({ token_hash: data.properties.hashed_token, type: 'magiclink' });
const key = `sb-${new URL(url).hostname.split('.')[0]}-auth-token`;
const encoded = `base64-${Buffer.from(JSON.stringify(v.session)).toString('base64url')}`;
const cookies = [];
for (let i = 0; i < encoded.length; i += 3180) cookies.push({ name: encoded.length <= 3180 ? key : `${key}.${cookies.length}`, value: encoded.slice(i, i + 3180), domain: 'localhost', path: '/', sameSite: 'Lax' });

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await ctx.addCookies(cookies);
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
await cdp.send('Profiler.enable');
await cdp.send('Profiler.setSamplingInterval', { interval: 500 });

async function profile(label, action) {
  await cdp.send('Profiler.start');
  const t = Date.now();
  await action();
  const ms = Date.now() - t;
  const { profile: p } = await cdp.send('Profiler.stop');
  const byId = new Map(p.nodes.map((n) => [n.id, n]));
  const self = new Map();
  const dt = p.timeDeltas;
  p.samples.forEach((id, i) => {
    const n = byId.get(id);
    const name = `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.split('/').pop()}:${n.callFrame.lineNumber + 1}`;
    self.set(name, (self.get(name) || 0) + (dt[i] || 0) / 1000);
  });
  const top = [...self.entries()].filter(([k]) => !/^\(idle\)|^\(program\)|^\(garbage/.test(k)).sort((a, b) => b[1] - a[1]).slice(0, 18);
  console.log(`\n== ${label}: ${ms}ms wall`);
  for (const [k, ms2] of top) console.log(`${ms2.toFixed(0).padStart(6)}ms  ${k}`);
}

await profile('load', async () => {
  await page.goto('http://localhost:3001/spit-braai-delivery/admin/contacts', { waitUntil: 'domcontentloaded', timeout: 180000 });
  await page.getByText(/Showing \d+-\d+ of/).first().waitFor({ timeout: 180000 });
  await page.waitForTimeout(1500);
});
await profile('search', async () => {
  await page.getByPlaceholder(/search/i).first().fill('smith');
  await page.waitForTimeout(2500);
});
await browser.close();
