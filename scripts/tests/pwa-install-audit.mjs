// Website/gesture regression check. WebKit emulation does not automate iOS's
// native Share menu or prove that an icon was added on a physical iPhone.
import { chromium, webkit, devices, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const base = process.env.PWA_TEST_URL || 'http://127.0.0.1:3105';
const output = 'tmp/pwa-install-audit';
await mkdir(output, { recursive: true });
const results = [];
for (const profile of [
  { name: 'webkit-iphone', engine: webkit, device: devices['iPhone 13'] },
  { name: 'chromium-android', engine: chromium, device: devices['Pixel 7'] },
  { name: 'chromium-desktop', engine: chromium, device: { viewport: { width: 1440, height: 900 } } },
]) {
  const browser = await profile.engine.launch({ headless: true });
  try {
    const context = await browser.newContext(profile.device);
    await context.addInitScript(() => {
      window.__pwaShareCalls = 0;
      Object.defineProperty(navigator, 'share', { configurable: true, value: () => { window.__pwaShareCalls++; return Promise.resolve(); } });
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.reject(new Error('test: clipboard denied')) } });
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${base}/auth/install?company=spit-braai-delivery`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await expect(page.getByRole('heading', { name: 'Install Spit Braai Delivery' })).toBeVisible();
    await expect(page.locator('link[rel="manifest"]')).toHaveCount(1);
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);
    expect(await page.locator('link[rel="manifest"]').getAttribute('href')).toContain('slug=spit-braai-delivery');
    await page.locator('main img').evaluate(image => image.decode());
    if (profile.name.includes('iphone')) {
      await page.getByRole('button', { name: 'Show Safari toolbar example' }).click();
      await expect(page.getByRole('img', { name: /Safari toolbar example/ })).toBeVisible();
      await page.getByRole('button', { name: 'Copy installation link for Safari' }).click();
      await expect(page.getByRole('textbox', { name: 'Copy this link manually' })).toHaveValue(`${base}/auth/install?company=spit-braai-delivery`);
      expect(await page.evaluate(() => window.__pwaShareCalls)).toBe(0);
    } else {
      await page.screenshot({ path: `${output}/${profile.name}.png`, fullPage: true });
      await page.evaluate(() => {
        window.__pwaPrompts = 0;
        const event = new Event('beforeinstallprompt', { cancelable: true });
        event.prompt = () => { window.__pwaPrompts++; return Promise.resolve(); };
        event.userChoice = Promise.resolve({ outcome: 'accepted' });
        window.dispatchEvent(event);
      });
      const control = page.getByRole('button', { name: /Install Spit Braai Delivery; slide right or tap/ });
      await expect(control).toBeVisible();
      // A cancelled drag cannot install. A following mouse/touch click must work.
      await control.dispatchEvent('pointerdown', { pointerId: 1, clientX: 20, button: 0, isPrimary: true });
      await control.dispatchEvent('pointermove', { pointerId: 1, clientX: 320, isPrimary: true });
      await control.dispatchEvent('pointercancel', { pointerId: 1, isPrimary: true });
      expect(await page.evaluate(() => window.__pwaPrompts)).toBe(0);
      await control.click();
      await expect.poll(() => page.evaluate(() => window.__pwaPrompts)).toBe(1);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    if (profile.name.includes('iphone')) await page.screenshot({ path: `${output}/${profile.name}.png`, fullPage: true });
    expect(errors).toEqual([]);
    results.push({ profile: profile.name, result: 'passed', nativeIosInstall: 'not exercised' });
  } finally { await browser.close(); }
}
console.log(JSON.stringify(results, null, 2));
