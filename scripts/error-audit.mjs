// Error auditor for admin pages. Loads each page as the right role and
// records: uncaught JS exceptions (pageerror), console.error output, and
// failed network requests (4xx/5xx to rest/api/rpc). Complements the
// responsive-audit (which only checks layout overflow).
//
//   node scripts/error-audit.mjs platform
//   node scripts/error-audit.mjs company
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const env = Object.fromEntries(readFileSync(path.join(repoRoot, ".env.local"), "utf8").split(/\r?\n/)
  .filter(l => l && !l.startsWith("#") && l.includes("="))
  .map(l => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const url = env.NEXT_PUBLIC_SUPABASE_URL, anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY, svc = env.SUPABASE_SERVICE_ROLE_KEY;
const admin = createClient(url, svc, { auth: { persistSession: false } });
const storageKey = `sb-${new URL(url).hostname.split(".")[0]}-auth-token`;
const BASE = "http://localhost:3001";
const SLUG = "spit-braai-delivery";
const GROUP = process.argv[2] || "company";

const PLATFORM_PAGES = ["/admin/platform/dashboard","/admin/platform/company-database","/admin/platform/user-management","/admin/platform/subscription-management","/admin/platform/pricing-management","/admin/platform/trial-management","/admin/platform/currency-monitoring","/admin/platform/financial-dashboard","/admin/platform/tenant-health","/admin/platform/tech-costs","/admin/platform/messaging-templates","/admin/platform/cms-blog","/admin/platform/cms-pages","/admin/platform/tax-rules","/admin/platform/audit-logs","/admin/platform/settings","/admin/platform/running-todo"];
const COMPANY_PAGES = ["/admin/dashboard","/admin/dispatch","/admin/live-operations","/admin/calendar","/admin/contacts","/admin/leads","/admin/quotes","/admin/orders","/admin/invoices","/admin/reviews","/admin/route-planning","/admin/vehicles","/admin/regions","/admin/tracking","/admin/order-assignments","/admin/dispatch-queue","/admin/financial-dashboard","/admin/recurring-invoices","/admin/cashflow-dashboard","/admin/outstanding-balances","/admin/payables","/admin/fixed-costs","/admin/refunds","/admin/tax-purchases","/admin/money-health","/admin/offering","/admin/menu","/admin/stock","/admin/inventory","/admin/equipment","/admin/suppliers","/admin/outsource-providers","/admin/shopping","/admin/packages","/admin/teams","/admin/users","/admin/teams/kitchen","/admin/teams/drivers","/admin/teams/cleaning","/admin/teams/shopping","/admin/driver-schedule","/admin/hr-solutions","/admin/public-holidays","/admin/onboarding","/admin/wages","/admin/staff","/admin/staff-hours","/admin/driver-settlement","/admin/kitchen-settlement","/admin/kitchen-schedule","/admin/cleaning-schedule","/admin/kitchen-duty-tracking","/admin/company-profile","/admin/white-label","/admin/kitchen-settings","/admin/email-settings","/admin/integrations","/admin/integrations/embed","/admin/email-templates","/admin/notification-settings","/admin/audit-logs","/admin/subscription","/admin/settings","/admin/payment-gateways","/admin/notifications"];

const cfg = GROUP === "platform"
  ? { email: "bobby@skylight-digital.co.za", prefix: "", pages: PLATFORM_PAGES }
  : { email: "hello@spitbraaidelivery.co.za", prefix: `/${SLUG}`, pages: COMPANY_PAGES };

// noise filter: dev-only / benign console messages that are not real errors
const IGNORE = /favicon|Download the React DevTools|Each child in a list|hydration|forwardRef|Warning: |autocomplete|preload|Manifest|net::ERR_ABORTED.*_next\/static|Slow network|source map|\[Fast Refresh\]/i;

async function mint(email) {
  const c = createClient(url, anon, { auth: { persistSession: false } });
  const { data } = await admin.auth.admin.generateLink({ type: "magiclink", email, options: { redirectTo: "https://cateringms.com/auth/callback" } });
  const r = await fetch(data.properties.action_link, { redirect: "manual" });
  const p = new URLSearchParams(new URL(r.headers.get("location") || "").hash.replace(/^#/, ""));
  const { data: s } = await c.auth.setSession({ access_token: p.get("access_token"), refresh_token: p.get("refresh_token") });
  return s.session;
}
const b64url = v => Buffer.from(v, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
function cookieChunks(session) {
  const enc = `base64-${b64url(JSON.stringify(session))}`, size = 3180, out = [];
  if (enc.length <= size) return [{ name: storageKey, value: enc }];
  for (let i = 0; i < enc.length; i += size) out.push({ name: `${storageKey}.${out.length}`, value: enc.slice(i, i + size) });
  return out;
}

(async () => {
  const session = await mint(cfg.email);
  const browser = await chromium.launch({ headless: true, args: ["--disk-cache-size=1"] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addCookies(cookieChunks(session).map(c => ({ name: c.name, value: c.value, domain: "localhost", path: "/", secure: false, httpOnly: false, sameSite: "Lax", expires: Math.floor(Date.now() / 1000) + 86400 })));
  const report = [];
  let dirty = 0;
  for (const rel of cfg.pages) {
    const page = await ctx.newPage();
    const rec = { page: rel, pageErrors: [], consoleErrors: [], netFail: [] };
    page.on("pageerror", e => rec.pageErrors.push(String(e.message).slice(0, 160)));
    page.on("console", m => { if (m.type() === "error") { const t = m.text(); if (!IGNORE.test(t)) rec.consoleErrors.push(t.slice(0, 160)); } });
    page.on("response", r => { const s = r.status(), u = r.url(); if (s >= 400 && (u.includes("/rest/v1/") || u.includes("/api/") || u.includes("/rpc/")) && !IGNORE.test(u)) rec.netFail.push(`${s} ${u.replace(/^https?:\/\/[^/]+/, "").slice(0, 80)}`); });
    await page.goto(`${BASE}${cfg.prefix}${rel}`, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(3000);
    await page.close();
    const bad = rec.pageErrors.length + rec.consoleErrors.length + rec.netFail.length;
    if (bad > 0) {
      dirty++;
      console.log(`!! ${rel}`);
      rec.pageErrors.slice(0, 3).forEach(x => console.log(`     JS   ${x}`));
      rec.consoleErrors.slice(0, 3).forEach(x => console.log(`     CON  ${x}`));
      rec.netFail.slice(0, 4).forEach(x => console.log(`     NET  ${x}`));
    } else {
      console.log(`ok ${rel}`);
    }
    report.push(rec);
  }
  await browser.close();
  writeFileSync(path.join(repoRoot, `error-report.${GROUP}.json`), JSON.stringify(report, null, 2));
  console.log(`\n== ${GROUP}: ${report.length} pages, ${dirty} with issues ==`);
})();
