// Responsive-design auditor for admin pages. Loads each page once as the
// right role, resizes through mobile/tablet/desktop, and records horizontal
// overflow (the dominant responsive bug) + the worst offending elements.
//
//   node scripts/responsive-audit.mjs platform     # /admin/platform/* as super_admin
//   node scripts/responsive-audit.mjs company       # /{slug}/admin/* as company_admin
//   node scripts/responsive-audit.mjs company /admin/orders,/admin/menu   # subset
//
// Writes responsive-report.<group>.json and prints a FAIL/PASS summary.
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
const SUBSET = process.argv[3] ? process.argv[3].split(",").map(s => s.trim()) : null;

const PLATFORM_PAGES = [
  "/admin/platform/dashboard","/admin/platform/company-database","/admin/platform/user-management",
  "/admin/platform/subscription-management","/admin/platform/pricing-management","/admin/platform/trial-management",
  "/admin/platform/currency-monitoring","/admin/platform/financial-dashboard","/admin/platform/tenant-health",
  "/admin/platform/tech-costs","/admin/platform/messaging-templates","/admin/platform/cms-blog",
  "/admin/platform/cms-pages","/admin/platform/tax-rules","/admin/platform/audit-logs",
  "/admin/platform/settings","/admin/platform/running-todo",
];
const COMPANY_PAGES = [
  "/admin/dashboard","/admin/dispatch","/admin/live-operations","/admin/calendar","/admin/contacts",
  "/admin/leads","/admin/quotes","/admin/orders","/admin/invoices","/admin/reviews","/admin/route-planning",
  "/admin/vehicles","/admin/regions","/admin/tracking","/admin/order-assignments","/admin/dispatch-queue",
  "/admin/financial-dashboard","/admin/recurring-invoices","/admin/cashflow-dashboard","/admin/outstanding-balances",
  "/admin/payables","/admin/fixed-costs","/admin/refunds","/admin/tax-purchases","/admin/money-health",
  "/admin/offering","/admin/menu","/admin/stock","/admin/inventory","/admin/equipment","/admin/suppliers",
  "/admin/outsource-providers","/admin/shopping","/admin/packages",
  "/admin/teams","/admin/users","/admin/teams/kitchen","/admin/teams/drivers","/admin/teams/cleaning",
  "/admin/teams/shopping","/admin/driver-schedule","/admin/hr-solutions","/admin/public-holidays","/admin/onboarding",
  "/admin/wages","/admin/staff","/admin/staff-hours","/admin/driver-settlement","/admin/kitchen-settlement",
  "/admin/kitchen-schedule","/admin/cleaning-schedule","/admin/kitchen-duty-tracking",
  "/admin/company-profile","/admin/white-label","/admin/kitchen-settings","/admin/email-settings",
  "/admin/integrations","/admin/integrations/embed","/admin/email-templates","/admin/notification-settings",
  "/admin/audit-logs","/admin/subscription","/admin/settings","/admin/payment-gateways","/admin/notifications",
];

const VIEWPORTS = [
  { name: "mobile",  w: 390,  h: 844 },
  { name: "tablet",  w: 768,  h: 1024 },
  { name: "desktop", w: 1440, h: 900 },
];

const cfg = GROUP === "platform"
  ? { email: "bobby@skylight-digital.co.za", prefix: "", pages: PLATFORM_PAGES }
  : { email: "hello@spitbraaidelivery.co.za", prefix: `/${SLUG}`, pages: COMPANY_PAGES };
const pages = SUBSET || cfg.pages;

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

const MEASURE = () => {
  const vw = window.innerWidth;
  const de = document.documentElement;
  const scrollW = Math.max(de.scrollWidth, document.body ? document.body.scrollWidth : 0);
  const overflow = scrollW - vw;
  const offenders = [];
  for (const el of document.querySelectorAll("body *")) {
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) continue;
    if (r.right <= vw + 2 && r.width <= vw + 1) continue;
    const st = getComputedStyle(el);
    if (st.visibility === "hidden" || st.display === "none" || st.position === "fixed") continue;
    if (["auto", "scroll"].includes(st.overflowX)) continue; // intentional scroll container - not a page-break
    offenders.push({ tag: el.tagName.toLowerCase(), cls: String(el.className || "").slice(0, 90), w: Math.round(r.width), right: Math.round(r.right), ox: st.overflowX });
  }
  offenders.sort((a, b) => b.right - a.right);
  return { vw, scrollW, overflow, offenders: offenders.slice(0, 6) };
};

(async () => {
  const session = await mint(cfg.email);
  const browser = await chromium.launch({ headless: true, args: ["--disk-cache-size=1"] });
  const ctx = await browser.newContext();
  await ctx.addCookies(cookieChunks(session).map(c => ({ name: c.name, value: c.value, domain: "localhost", path: "/", secure: false, httpOnly: false, sameSite: "Lax", expires: Math.floor(Date.now() / 1000) + 86400 })));
  const page = await ctx.newPage();
  const report = [];
  for (const rel of pages) {
    const full = `${BASE}${cfg.prefix}${rel}`;
    const rec = { page: rel, results: {}, worst: 0, status: "pass" };
    try {
      await page.setViewportSize({ width: 1440, height: 900 });
      const resp = await page.goto(full, { waitUntil: "networkidle", timeout: 30000 }).catch(() => null);
      rec.http = resp ? resp.status() : "no-response";
      await page.waitForTimeout(1200);
      for (const vp of VIEWPORTS) {
        await page.setViewportSize({ width: vp.w, height: vp.h });
        await page.waitForTimeout(500);
        const m = await page.evaluate(MEASURE).catch(e => ({ error: String(e).slice(0, 80) }));
        rec.results[vp.name] = m;
        if (m.overflow > 4) { rec.status = "FAIL"; rec.worst = Math.max(rec.worst, m.overflow); }
      }
    } catch (e) {
      rec.status = "ERROR"; rec.error = String(e).slice(0, 120);
    }
    report.push(rec);
    const flag = rec.status === "pass" ? "  ok" : ` ${rec.status}`;
    const detail = rec.status === "FAIL"
      ? Object.entries(rec.results).filter(([, v]) => v.overflow > 4).map(([k, v]) => `${k}+${v.overflow}px`).join(" ")
      : (rec.error || "");
    console.log(`${flag.padEnd(7)} ${rel.padEnd(40)} http=${rec.http} ${detail}`);
  }
  await browser.close();
  const out = path.join(repoRoot, `responsive-report.${GROUP}.json`);
  writeFileSync(out, JSON.stringify(report, null, 2));
  const fails = report.filter(r => r.status === "FAIL");
  const errs = report.filter(r => r.status === "ERROR");
  console.log(`\n== ${GROUP}: ${report.length} pages, ${fails.length} FAIL, ${errs.length} ERROR ==`);
  console.log(`report: ${out}`);
})();
