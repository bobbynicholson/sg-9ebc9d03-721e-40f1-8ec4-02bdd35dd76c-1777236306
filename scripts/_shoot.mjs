import { readFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { chromium } from "@playwright/test";
const env = Object.fromEntries(readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => l && !l.startsWith("#") && l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const SUP = env.NEXT_PUBLIC_SUPABASE_URL, ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY, SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
const admin = createClient(SUP, SERVICE, { auth: { persistSession: false } });
const anon = createClient(SUP, ANON, { auth: { persistSession: false } });
const { data: link } = await admin.auth.admin.generateLink({ type: "magiclink", email: "kitchen@spitbraaidelivery.co.za" });
const { data: verify } = await anon.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
const cap = [];
const srv = createServerClient(SUP, ANON, { cookies: { getAll: () => [], setAll: (cs) => cs.forEach((c) => cap.push(c)) } });
await srv.auth.setSession({ access_token: verify.session.access_token, refresh_token: verify.session.refresh_token });
mkdirSync(path.resolve("screenshots"), { recursive: true });
const browser = await chromium.launch();
for (const w of [1680, 1366, 1280, 1100]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 820 } });
  await ctx.addCookies(cap.map((c) => ({ name: c.name, value: c.value, domain: "cateringms.com", path: "/", secure: true, sameSite: "Lax" })));
  const page = await ctx.newPage();
  await page.goto("https://cateringms.com/spit-braai-delivery/team-portal/kitchen/notifications", { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(2200);
  const bells = page.locator('button[aria-label*="Notification"]');
  const n = await bells.count();
  for (let i = 0; i < n; i++) { const b = bells.nth(i); if (await b.isVisible()) { await b.click(); break; } }
  await page.waitForTimeout(1000);
  // measure the dropdown rect
  const rect = await page.evaluate(() => {
    const el = document.querySelector('[role="menu"], [data-radix-menu-content]');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom), vw: window.innerWidth, vh: window.innerHeight };
  });
  console.log(`w=${w}`, JSON.stringify(rect));
  await page.screenshot({ path: path.resolve("screenshots", `bell-${w}.png`) });
  await ctx.close();
}
await browser.close();
