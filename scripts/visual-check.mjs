// Visual check helper — drive a real browser against a URL (live or local),
// optionally log in and open the Cmd/Ctrl+K command palette, then save a
// screenshot under screenshots/ for inspection.
//
// Usage:
//   node scripts/visual-check.mjs <url> [--palette] [--name foo]
//
// Login (optional) is supplied via env so creds never land in the repo:
//   E2E_EMAIL=... E2E_PASSWORD=... node scripts/visual-check.mjs <url> --palette
//
// Examples:
//   node scripts/visual-check.mjs https://cateringms.com/spit-braai-delivery/login
//   E2E_EMAIL=a@b.com E2E_PASSWORD=secret \
//     node scripts/visual-check.mjs \
//     https://cateringms.com/spit-braai-delivery/admin/dashboard --palette
import { chromium } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";

const args = process.argv.slice(2);
const url = args.find((a) => !a.startsWith("--"));
const wantPalette = args.includes("--palette");
const nameIdx = args.indexOf("--name");
const name = nameIdx >= 0 ? args[nameIdx + 1] : "shot";

if (!url) {
  console.error("Usage: node scripts/visual-check.mjs <url> [--palette] [--name foo]");
  process.exit(1);
}

const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;
const outDir = path.resolve("screenshots");
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
});
const page = await context.newPage();

console.log("→ goto", url);
await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });

if (email && password) {
  console.log("→ logging in as", email);
  // Be tolerant of selector variations across the login form.
  const emailField = page.locator(
    'input[type="email"], input[name="email"], input[autocomplete="email"]',
  ).first();
  const passField = page.locator('input[type="password"]').first();
  await emailField.fill(email);
  await passField.fill(password);
  await Promise.all([
    page.waitForLoadState("networkidle", { timeout: 60000 }).catch(() => {}),
    page.locator('button[type="submit"], button:has-text("Sign in"), button:has-text("Log in")').first().click(),
  ]);
  await page.waitForTimeout(2500);
  console.log("→ after login, url is", page.url());
}

if (wantPalette) {
  console.log("→ opening command palette (Ctrl+K)");
  await page.keyboard.press("Control+K");
  await page.waitForTimeout(800);
}

const file = path.join(outDir, `${name}.png`);
await page.screenshot({ path: file, fullPage: !wantPalette });
console.log("✓ saved", file);

await browser.close();
