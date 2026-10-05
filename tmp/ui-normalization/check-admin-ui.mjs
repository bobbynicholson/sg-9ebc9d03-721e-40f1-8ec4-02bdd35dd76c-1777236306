import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

// Use the existing authorized local-login approach. Never submit business writes.
const env = {};
for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  if (line.trim().startsWith('#')) continue;
  const i = line.indexOf('=');
  if (i > 0) env[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
}
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const admin = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email: 'hello@spitbraaidelivery.co.za' });
if (error) throw new Error('Authorized session unavailable');
const anon = createClient(url, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: verified, error: verifyError } = await anon.auth.verifyOtp({ token_hash: data.properties.hashed_token, type: 'magiclink' });
if (verifyError || !verified.session) throw new Error('Authorized session verification failed');
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const key = `sb-${new URL(url).hostname.split('.')[0]}-auth-token`;
const encoded = `base64-${Buffer.from(JSON.stringify(verified.session)).toString('base64url')}`;
const cookies = [];
for (let i = 0; i < encoded.length; i += 3180) cookies.push({ name: encoded.length <= 3180 ? key : `${key}.${cookies.length}`, value: encoded.slice(i, i + 3180), domain: 'localhost', path: '/', httpOnly: false, secure: false, sameSite: 'Lax' });
await ctx.addCookies(cookies);
const reports = [];
const discovered = new Set();
function sources(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? sources(`${dir}/${e.name}`) : e.name.endsWith('.tsx') ? [`${dir}/${e.name}`] : []);
}
const inventory = sources('src/pages/admin').sort().map(file => {
  const source = readFileSync(file, 'utf8');
  const route = '/' + file.replace(/^src\/pages\//, '').replace(/\.tsx$/, '').replace(/\/index$/, '');
  return { file, route, kind: route.startsWith('/admin/platform') ? 'platform' : /export\s*\{\s*default\s*\}\s*from/.test(source) ? 'alias' : /router\.replace/.test(source) && source.length < 5000 ? 'redirect' : route.includes('[id]') ? 'dynamic' : 'page', header: source.includes('PortalHeader'), shell: source.includes('admin-page-shell'), collapsibleSections: [...source.matchAll(/collapseLabel="([^"]+)"/g)].map(m => m[1]) };
});
writeFileSync('tmp/ui-normalization/route-inventory.json', JSON.stringify(inventory, null, 2));
const requested = process.argv.slice(2);
const routes = requested.length ? requested : ['/admin/dashboard', ...inventory.filter(r => r.kind === 'page' && r.route !== '/admin/dashboard').map(r => r.route), ...inventory.filter(r => r.kind === 'alias' || r.kind === 'redirect').map(r => r.route)];
try {
  for (const route of routes) {
    const page = await ctx.newPage();
    const pageErrors = [], failedRequests = [];
    page.on('pageerror', e => pageErrors.push(e.message.slice(0, 500)));
    page.on('response', r => { if (r.url().startsWith('http://localhost:3001/') && r.status() >= 400) failedRequests.push({ path: new URL(r.url()).pathname, status: r.status() }); });
    const report = { route, pageErrors, failedRequests };
    try {
      const response = await page.goto(`http://localhost:3001/spit-braai-delivery${route}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
      await page.waitForTimeout(3500);
      await page.locator('.admin-page-shell h1').first().waitFor({ state: 'visible', timeout: 12000 }).catch(() => {});
      report.status = response?.status(); report.finalPath = new URL(page.url()).pathname;
      report.headings = await page.getByRole('heading').allTextContents();
      const body = await page.locator('body').innerText();
      report.loaded = response?.ok() && !/Application error|Internal Server Error|This page could not be found/.test(body);
      report.permissionDenied = /Access Denied|You do not have permission|You don't have permission|Only super admins/i.test(body);
      report.sections = await page.locator('[data-collapsible]').evaluateAll(els => els.map(el => ({ title: el.querySelector('[role="heading"],h2,h3')?.textContent, state: el.getAttribute('data-state') })));
      report.desktopOverflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
      for (const link of await page.locator('a[href]').evaluateAll(els => els.map(el => el.getAttribute('href')))) if (/\/admin\/(quotes|packages|suppliers|outsource-providers|integrations\/embed|orders)\/[^/?#]+/.test(link)) discovered.add(link);
      const fileBase = route.replaceAll('/', '-').slice(1);
      await page.screenshot({ path: `tmp/ui-normalization/${fileBase}-desktop.png` });
      if (route === '/admin/dashboard') {
        const target = page.getByRole('button', { name: 'Expand Recent activity and payments', exact: true });
        await target.click();
        report.expandWorks = await page.getByRole('button', { name: 'Collapse Recent activity and payments', exact: true }).getAttribute('aria-expanded') === 'true';
        await page.getByRole('button', { name: 'Collapse Recent activity and payments', exact: true }).click();
        report.collapseWorks = await target.getAttribute('aria-expanded') === 'false';
        const today = page.getByRole('button', { name: 'Today', exact: true }).filter({ visible: true });
        await today.click(); report.activeNavCanClose = await today.getAttribute('aria-expanded') === 'false';
        await today.click();
        await page.getByRole('button', { name: 'Collapse sidebar', exact: true }).click();
        report.collapsedGutter = await page.locator('.admin-page-shell').evaluate(el => getComputedStyle(el).paddingLeft);
        await page.screenshot({ path: 'tmp/ui-normalization/admin-dashboard-sidebar-collapsed.png' });
        await page.getByRole('button', { name: 'Expand sidebar', exact: true }).click();
        const setup = page.getByRole('button', { name: 'Open setup checklist', exact: true });
        report.setupInitiallyClosed = await setup.isVisible();
        if (report.setupInitiallyClosed) {
          await setup.click(); await page.keyboard.press('Escape');
          report.setupEscapeFocus = await setup.evaluate(el => el === document.activeElement);
        }
      }
      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForTimeout(300);
      report.mobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
      await page.screenshot({ path: `tmp/ui-normalization/${fileBase}-mobile.png` });
      if (route === '/admin/dashboard') {
        await page.getByRole('button', { name: 'Open navigation menu', exact: true }).click();
        await page.screenshot({ path: 'tmp/ui-normalization/admin-dashboard-mobile-nav.png' });
        await page.keyboard.press('Escape');
      }
    } catch (e) { report.checkError = e.message.slice(0, 800); }
    reports.push(report);
    writeFileSync('tmp/ui-normalization/admin-ui-report.json', JSON.stringify(reports, null, 2));
    writeFileSync('tmp/ui-normalization/discovered-detail-links.json', JSON.stringify([...discovered], null, 2));
    console.log(`${report.loaded && !pageErrors.length && !report.checkError ? 'PASS' : 'REVIEW'} ${route}${report.desktopOverflow || report.mobileOverflow ? ' overflow' : ''}${report.checkError ? ': ' + report.checkError : ''}`);
    await page.close();
  }
} finally { await ctx.close(); await browser.close(); }
