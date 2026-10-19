// Usage: node tmp/email-e2e/status.mjs <round> <status-label-regex>
// Real UI: open order, Edit, pick Status, Save (writes; test company only).
import { chromium } from "@playwright/test";
import fs from "fs";
const [label, want] = process.argv.slice(2);
const cookies = JSON.parse(fs.readFileSync("tmp/email-e2e/.cookies.json", "utf8"));
const st = JSON.parse(fs.readFileSync(`tmp/email-e2e/${label}.json`, "utf8"));
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await ctx.addCookies(cookies);
const page = await ctx.newPage();
const errs = []; page.on("pageerror", (e) => errs.push(e.message.slice(0, 150)));
await page.goto(`http://localhost:3001/raj267748-payfast-test/admin/orders?orderId=${st.order_id}`, { waitUntil: "domcontentloaded", timeout: 180000 });
await page.waitForTimeout(25000);
const dlg = page.getByRole("dialog");
for (let i = 0; i < 8; i++) { try { await dlg.getByRole("button", { name: "Edit", exact: true }).click({ timeout: 4000, force: true }); break; } catch { await page.waitForTimeout(2000); } }
await page.waitForTimeout(2500);
const statusLabel = dlg.getByText("Status", { exact: true }).first();
const trigger = statusLabel.locator("xpath=following::*[self::button or @role='combobox'][1]");
await trigger.click({ force: true });
await page.waitForTimeout(1200);
const options = await page.locator("[role=option]").allTextContents();
console.log("options:", JSON.stringify(options));
const opt = page.locator("[role=option]").filter({ hasText: new RegExp(want, "i") }).first();
await opt.click({ force: true });
await page.waitForTimeout(800);
await dlg.getByRole("button", { name: "Save", exact: true }).click({ force: true });
await page.waitForTimeout(15000);
const toasts = await page.locator("[role=status], li[role=status], [data-sonner-toast]").allTextContents().catch(() => []);
console.log("toasts:", JSON.stringify(toasts.map(t => t.trim()).filter(Boolean).slice(0, 4)), "errors:", errs.length, errs.join(" | "));
await browser.close();
