import { chromium } from "@playwright/test";
import fs from "fs";
const cookies = JSON.parse(fs.readFileSync("tmp/email-e2e/.cookies.json", "utf8"));
const st = JSON.parse(fs.readFileSync("tmp/email-e2e/A.json", "utf8"));
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await ctx.addCookies(cookies);
await ctx.route("**/*", (r) => (["GET", "HEAD", "OPTIONS"].includes(r.request().method()) || r.request().url().includes("/auth/v1/") ? r.continue() : r.abort()));
const page = await ctx.newPage();
await page.goto(`http://localhost:3001/raj267748-payfast-test/admin/orders?orderId=${st.order_id}`, { waitUntil: "domcontentloaded", timeout: 180000 });
await page.waitForTimeout(25000);
for (let i = 0; i < 8; i++) {
  try { await page.getByRole("dialog").getByRole("button", { name: "Edit", exact: true }).click({ timeout: 4000, force: true }); break; }
  catch { await page.waitForTimeout(2000); }
}
await page.waitForTimeout(3000);
const ctl = await page.locator("[role=dialog] select, [role=dialog] [role=combobox], [role=dialog] label").evaluateAll(els => els.map(e => e.tagName + "|" + (e.id||"") + "|" + (e.getAttribute("aria-label")||"") + "|" + (e.textContent||"").trim().replace(/\s+/g," ").slice(0,50)));
console.log(JSON.stringify(ctl.slice(0, 60)));
const btns = await page.locator("[role=dialog] button").allTextContents();
console.log("buttons:", JSON.stringify([...new Set(btns.map(b => b.trim()).filter(Boolean))].slice(0, 40)));
await page.screenshot({ path: "tmp/email-e2e/order-edit.png" });
await browser.close();
