import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
const env = Object.fromEntries(readFileSync('.env.local','utf8').split(/\r?\n/).filter(l=>l.includes('=')&&!l.startsWith('#')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^"|"$/g,'')]}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const cache = JSON.parse(readFileSync('tmp/ui-normalization/.session-cache.json', 'utf8'));
const browser = await chromium.launch({ executablePath: 'C:/Users/raj/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe' });
const OUT = 'tmp/embedchk/shots3';
async function ctxFor(email) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  if (email) await ctx.addCookies(cache[email].cookies);
  await ctx.route('**/*', (r) => (['GET', 'HEAD', 'OPTIONS'].includes(r.request().method()) || r.request().url().includes('/auth/v1/')) ? r.continue() : r.abort());
  return ctx;
}
// 1. Form event step with the children box.
{
  const ctx = await ctxFor(null); const page = await ctx.newPage();
  await page.goto('http://localhost:3002/quote/spit-braai-delivery/orders?preview=1');
  await page.waitForFunction(() => document.querySelector('[data-embed-form]')?.shadowRoot?.querySelector('form'));
  await page.evaluate(() => { const r = document.querySelector('[data-embed-form]').shadowRoot; for (const [n, v] of [['name', 'A'], ['email', 'a@b.co'], ['phone', '+27 82 123 4567']]) { const i = r.querySelector(`[name="${n}"]`); if (i) { i.value = v; i.dispatchEvent(new Event('input', { bubbles: true })); } } });
  await page.locator('[data-embed-form] button:has-text("Next")').click(); await page.waitForTimeout(400);
  console.log('EVENT STEP FIELDS:', JSON.stringify(await page.evaluate(() => [...document.querySelector('[data-embed-form]').shadowRoot.querySelectorAll('.cms-step.is-active .cms-field')].map((f) => f.querySelector('.cms-label')?.textContent))));
  await page.screenshot({ path: `${OUT}/form-event-step.png` });
  await ctx.close();
}
// 2. Quote builder cards (test company QUO-000005).
if (false) {
  const { data: q } = await sb.from('quotes').select('id').eq('quote_number', 'QUO-000005').eq('company_id', '1417901f-2a08-4fd0-a264-29f47ce371cb').single();
  const ctx = await ctxFor('raj267748@gmail.com'); const page = await ctx.newPage();
  await page.goto(`http://localhost:3002/raj267748-payfast-test/admin/quotes/new?fromQuoteId=${q.id}`, { timeout: 120000 });
  await page.waitForSelector('#quote-menu-items h4', { timeout: 120000 }); await page.waitForTimeout(4000);
  await page.locator('#quote-menu-items').screenshot({ path: `${OUT}/quote-cards.png` });
  console.log('QUOTE COURSES:', JSON.stringify(await page.locator('#quote-menu-items h4').allTextContents()));
  await ctx.close();
}
// 3. Order popup on a real Spit Braai order with items (view only).
{
  const { data: ords } = await sb.from('orders').select('id').eq('company_id', '0e139a19-6526-4e1f-9bf7-87d6adbee5f8').is('deleted_at', null).order('created_at', { ascending: false }).limit(60);
  const { data: items } = await sb.from('order_items').select('order_id').in('order_id', (ords || []).map((x) => x.id));
  const counts = {}; for (const i of items || []) counts[i.order_id] = (counts[i.order_id] || 0) + 1;
  const { data: bk } = await sb.from('equipment_bookings').select('order_id').in('order_id', (ords || []).map((x) => x.id));
  const withEq = new Set((bk || []).map((x) => x.order_id));
  const orderId = Object.entries(counts).filter(([id]) => withEq.has(id)).sort((a, b) => b[1] - a[1])[0]?.[0]
    || Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
  const { data: o } = await sb.from('orders').select('order_number').eq('id', orderId).single();
  console.log('ORDER', o?.order_number, 'items', counts[orderId], 'has equipment', withEq.has(orderId));
  const ctx = await ctxFor('hello@spitbraaidelivery.co.za'); const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message.slice(0, 200)));
  await page.goto(`http://localhost:3002/spit-braai-delivery/admin/orders?orderId=${orderId}`, { timeout: 120000 });
  await page.waitForTimeout(12000);
  let opened = await page.locator('[role="dialog"]').count();
  if (!opened) { await page.locator(`text=${o.order_number}`).first().click().catch(() => {}); await page.waitForTimeout(4000); opened = await page.locator('[role="dialog"]').count(); }
  console.log('MODAL OPEN', opened);
  for (const tab of ['Menu', 'Equipment']) {
    const t = page.locator('[role="dialog"] [role="tab"]', { hasText: new RegExp(`^${tab}`) }).first();
    if (await t.count()) { await t.click(); await page.waitForTimeout(2500); await page.locator('[role="dialog"]').screenshot({ path: `${OUT}/order-${tab.toLowerCase()}.png` }); }
  }
  await ctx.close();
}
await browser.close();
