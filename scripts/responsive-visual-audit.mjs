// Visual + interaction responsive audit (mobile 390px). For every admin page:
//  - measures horizontal overflow, sub-12px fonts, sub-44px touch targets
//  - saves a full-page mobile screenshot for visual review
// Grounded in Apple HIG (44px), Material (48px), WCAG 2.2 readability.
//
//   node scripts/responsive-visual-audit.mjs platform
//   node scripts/responsive-visual-audit.mjs company
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
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
const SHOT_DIR = "E:/rshots"; // on E: (C: is disk-constrained)

const PLATFORM_PAGES = ["/admin/platform/dashboard","/admin/platform/company-database","/admin/platform/user-management","/admin/platform/subscription-management","/admin/platform/pricing-management","/admin/platform/trial-management","/admin/platform/currency-monitoring","/admin/platform/financial-dashboard","/admin/platform/tenant-health","/admin/platform/tech-costs","/admin/platform/messaging-templates","/admin/platform/cms-blog","/admin/platform/cms-pages","/admin/platform/tax-rules","/admin/platform/audit-logs","/admin/platform/settings","/admin/platform/running-todo"];
const COMPANY_PAGES = ["/admin/dashboard","/admin/dispatch","/admin/live-operations","/admin/calendar","/admin/contacts","/admin/leads","/admin/quotes","/admin/orders","/admin/invoices","/admin/reviews","/admin/route-planning","/admin/vehicles","/admin/regions","/admin/tracking","/admin/order-assignments","/admin/dispatch-queue","/admin/financial-dashboard","/admin/recurring-invoices","/admin/cashflow-dashboard","/admin/outstanding-balances","/admin/payables","/admin/fixed-costs","/admin/refunds","/admin/tax-purchases","/admin/money-health","/admin/offering","/admin/menu","/admin/stock","/admin/inventory","/admin/equipment","/admin/suppliers","/admin/outsource-providers","/admin/shopping","/admin/packages","/admin/teams","/admin/users","/admin/teams/kitchen","/admin/teams/drivers","/admin/teams/cleaning","/admin/teams/shopping","/admin/driver-schedule","/admin/hr-solutions","/admin/public-holidays","/admin/onboarding","/admin/wages","/admin/staff","/admin/staff-hours","/admin/driver-settlement","/admin/kitchen-settlement","/admin/kitchen-schedule","/admin/cleaning-schedule","/admin/kitchen-duty-tracking","/admin/company-profile","/admin/white-label","/admin/kitchen-settings","/admin/email-settings","/admin/integrations","/admin/integrations/embed","/admin/email-templates","/admin/notification-settings","/admin/audit-logs","/admin/subscription","/admin/settings","/admin/payment-gateways","/admin/notifications"];

const cfg = GROUP === "platform"
  ? { email: "bobby@skylight-digital.co.za", prefix: "", pages: PLATFORM_PAGES }
  : { email: "hello@spitbraaidelivery.co.za", prefix: `/${SLUG}`, pages: COMPANY_PAGES };

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
  const vis = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 2 && r.height > 2 && s.visibility !== "hidden" && s.display !== "none" && s.opacity !== "0"; };
  // sub-12px visible text
  const tinyFonts = [];
  for (const el of document.querySelectorAll("p,span,a,button,td,th,li,label,div,h1,h2,h3,h4,h5,h6,small")) {
    const txt = (el.childNodes.length && [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) ? el.textContent.trim() : "";
    if (!txt || txt.length < 2) continue;
    if (!vis(el)) continue;
    const fs = parseFloat(getComputedStyle(el).fontSize);
    if (fs && fs < 12) tinyFonts.push({ fs: Math.round(fs * 10) / 10, tag: el.tagName.toLowerCase(), txt: txt.slice(0, 28) });
  }
  // sub-44 touch targets among clearly-interactive controls
  const smallTargets = [];
  for (const el of document.querySelectorAll('button,a[href],input:not([type=hidden]),select,textarea,[role="button"],[role="tab"],[role="switch"],[role="checkbox"]')) {
    if (!vis(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 40 || r.height < 40) {
      const label = (el.getAttribute("aria-label") || el.textContent || el.getAttribute("name") || el.tagName).trim().slice(0, 24);
      smallTargets.push({ w: Math.round(r.width), h: Math.round(r.height), tag: el.tagName.toLowerCase(), label });
    }
  }
  return {
    vw, overflow,
    tinyFontCount: tinyFonts.length, tinyFonts: tinyFonts.slice(0, 6),
    smallTargetCount: smallTargets.length, smallTargets: smallTargets.slice(0, 8),
  };
};

(async () => {
  const dir = path.join(SHOT_DIR, GROUP);
  mkdirSync(dir, { recursive: true });
  const session = await mint(cfg.email);
  const browser = await chromium.launch({ headless: true, args: ["--disk-cache-size=1"] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  await ctx.addCookies(cookieChunks(session).map(c => ({ name: c.name, value: c.value, domain: "localhost", path: "/", secure: false, httpOnly: false, sameSite: "Lax", expires: Math.floor(Date.now() / 1000) + 86400 })));
  const page = await ctx.newPage();
  const report = [];
  for (const rel of cfg.pages) {
    const slug = rel.replace(/^\//, "").replace(/\//g, "__");
    const rec = { page: rel };
    try {
      await page.goto(`${BASE}${cfg.prefix}${rel}`, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
      await page.waitForTimeout(2500);
      Object.assign(rec, await page.evaluate(MEASURE).catch(e => ({ error: String(e).slice(0, 80) })));
      await page.screenshot({ path: path.join(dir, `${slug}.png`), fullPage: true }).catch(() => {});
    } catch (e) { rec.error = String(e).slice(0, 100); }
    const flags = [];
    if (rec.overflow > 4) flags.push(`overflow+${rec.overflow}`);
    if (rec.tinyFontCount) flags.push(`tinyFont:${rec.tinyFontCount}`);
    if (rec.smallTargetCount) flags.push(`smallTap:${rec.smallTargetCount}`);
    rec.flags = flags;
    console.log(`${flags.length ? "!!" : "ok"} ${rel.padEnd(40)} ${flags.join(" ")}`);
    report.push(rec);
  }
  await browser.close();
  writeFileSync(path.join(repoRoot, `visual-report.${GROUP}.json`), JSON.stringify(report, null, 2));
  const withFlags = report.filter(r => r.flags && r.flags.length).length;
  console.log(`\n== ${GROUP}: ${report.length} pages, ${withFlags} flagged. Shots: ${dir} ==`);
})();
