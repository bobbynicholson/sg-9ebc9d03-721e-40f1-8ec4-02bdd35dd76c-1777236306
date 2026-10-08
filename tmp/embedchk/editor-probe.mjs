// Read-only probe of the lead-form editor + list (all non-GET aborted).
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
const cache = JSON.parse(readFileSync('tmp/ui-normalization/.session-cache.json', 'utf8'));
const browser = await chromium.launch({ executablePath: 'C:/Users/raj/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe' });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await ctx.addCookies(cache['hello@spitbraaidelivery.co.za'].cookies);
let blocked = 0;
await ctx.route('**/*', (r) => {
  const m = r.request().method();
  if (['GET', 'HEAD', 'OPTIONS'].includes(m) || r.request().url().includes('/auth/v1/')) return r.continue();
  blocked++;
  return r.abort();
});
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR', e.message.slice(0, 300)));
const base = 'http://localhost:3001/spit-braai-delivery/admin/integrations/embed';
await page.goto(`${base}/cb5dda49-6ce3-4579-aebf-baa4c509b643`, { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForSelector('text=Set up your questions', { timeout: 90000 });
await page.waitForTimeout(8000);
await page.screenshot({ path: 'tmp/embedchk/shots/editor.png' });

// Live draft: change the first question's label and confirm the preview iframe re-renders it.
const firstLabel = page.locator('#section-fields input[placeholder="Field label"]').first();
await firstLabel.fill('Your full name (draft)');
await page.waitForTimeout(1500);
const frame = page.frameLocator('#section-preview iframe');
const draftShown = await frame.locator('[data-embed-form]').evaluate((h) => h.shadowRoot.textContent.includes('Your full name (draft)')).catch((e) => 'ERR ' + e.message);
console.log('DRAFT_IN_PREVIEW', draftShown);
await page.screenshot({ path: 'tmp/embedchk/shots/editor-draft.png' });

// Options editor: type two lines into the event type options box.
const evtLabel = page.locator('#section-fields input[value="Event type"]');
const card = evtLabel.locator('xpath=ancestor::div[contains(@class,"rounded-lg")][1]');
const opts = card.locator('textarea');
await opts.click();
await opts.press('End');
await page.keyboard.press('Control+End');
await page.keyboard.type('\nGraduation party');
const typed = await opts.inputValue();
console.log('OPTIONS_TEXT_LAST_LINES', JSON.stringify(typed.split('\n').slice(-2)));
const overlay = await page.evaluate(() => document.querySelector('nextjs-portal')?.shadowRoot?.textContent?.slice(0, 600) || '');
console.log('NEXT_OVERLAY', JSON.stringify(overlay));
await opts.evaluate((el) => el.blur());
await page.waitForTimeout(1200);
const optInPreview = await frame.locator('[data-embed-form]').evaluate((h) => [...h.shadowRoot.querySelectorAll('select option')].map((o) => o.textContent)).catch((e) => 'ERR ' + e.message);
console.log('PREVIEW_SELECT_OPTIONS', JSON.stringify(optInPreview));

console.log('BLOCKED_WRITES', blocked);
// List page.
await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForSelector('text=Lead capture forms', { timeout: 90000 });
await page.waitForTimeout(12000);
await page.screenshot({ path: 'tmp/embedchk/shots/list.png' });
await page.evaluate(() => document.querySelectorAll('nextjs-portal').forEach((n) => n.remove()));
await page.locator('button:has-text("Snippet")').first().click();
await page.waitForTimeout(1500);
await page.screenshot({ path: 'tmp/embedchk/shots/snippet.png' });
console.log('SHARE_LINK', await page.locator('input[aria-label="Shareable form link"]').inputValue());
await browser.close();
