// Responsive audit for the STAFF + CLIENT portals. Per group, logs in as the
// right role, measures horizontal overflow at mobile/tablet/desktop, and saves
// a full-page mobile screenshot to E:/rshots/<group>.
//
//   node scripts/portal-audit.mjs kitchen | cleaning | driver | waiter | shopping | client
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
const GROUP = process.argv[2] || "kitchen";
const SHOT_DIR = "E:/rshots";

const P = (base, subs) => [`/team-portal/${base}`, ...subs.map(s => `/team-portal/${base}/${s}`)];
const GROUPS = {
  kitchen:  { email: "kitchen.manager.demo@spitbraaidelivery.co.za", pages: P("kitchen", ["dashboard","today","duty","handovers","menu","notifications","prep-list","production","settings","stock"]) },
  cleaning: { email: "cleaning.manager.demo@spitbraaidelivery.co.za", pages: P("cleaning", ["dashboard","damage","equipment","notifications","schedules","settings","supplies","tasks","workflows"]) },
  driver:   { email: "driver@spitbraaidelivery.co.za", pages: P("driver", ["dashboard","calendar","deliveries","earnings","notifications","routes","schedule","tracking"]) },
  waiter:   { email: "waiter.demo@spitbraaidelivery.co.za", pages: P("waiter", ["dashboard","notifications"]) },
  shopping: { email: "shopping@spitbraaidelivery.co.za", pages: P("shopping", ["dashboard","alerts","buy-list","inventory","invoices","kitchen-demand","notifications","orders","receipts","settings","suppliers"]) },
  client:   { email: "universalsportmags23@gmail.com", pages: ["/client-portal","/client-portal/dashboard","/client-portal/billing","/client-portal/feedback","/client-portal/my-orders","/client-portal/notifications","/client-portal/profile","/client-portal/quotes","/client-portal/tracking"] },
};
const cfg = GROUPS[GROUP];
if (!cfg) { console.log("unknown group", GROUP); process.exit(1); }

const VIEWPORTS = [{ name: "mobile", w: 390, h: 844 }, { name: "tablet", w: 768, h: 1024 }, { name: "desktop", w: 1440, h: 900 }];

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
  const offenders = [];
  for (const el of document.querySelectorAll("body *")) {
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) continue;
    if (r.right <= vw + 2 && r.width <= vw + 1) continue;
    const st = getComputedStyle(el);
    if (st.visibility === "hidden" || st.display === "none" || st.position === "fixed") continue;
    if (["auto", "scroll"].includes(st.overflowX)) continue;
    offenders.push({ tag: el.tagName.toLowerCase(), cls: String(el.className || "").slice(0, 80), w: Math.round(r.width), right: Math.round(r.right) });
  }
  offenders.sort((a, b) => b.right - a.right);
  return { vw, scrollW, overflow: scrollW - vw, offenders: offenders.slice(0, 5), textLen: (document.body.innerText || "").length };
};

(async () => {
  const dir = path.join(SHOT_DIR, GROUP); mkdirSync(dir, { recursive: true });
  const session = await mint(cfg.email);
  const browser = await chromium.launch({ headless: true, args: ["--disk-cache-size=1"] });
  const ctx = await browser.newContext();
  await ctx.addCookies(cookieChunks(session).map(c => ({ name: c.name, value: c.value, domain: "localhost", path: "/", secure: false, httpOnly: false, sameSite: "Lax", expires: Math.floor(Date.now() / 1000) + 86400 })));
  const page = await ctx.newPage();
  const report = [];
  for (const rel of cfg.pages) {
    const slug = rel.replace(/^\//, "").replace(/\//g, "__");
    const rec = { page: rel, results: {}, status: "pass" };
    try {
      await page.setViewportSize({ width: 1440, height: 900 });
      const resp = await page.goto(`${BASE}/${SLUG}${rel}`, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => null);
      rec.http = resp ? resp.status() : "no-resp";
      await page.waitForTimeout(2500);
      const finalUrl = page.url();
      rec.redirected = !finalUrl.includes(rel.split("/").slice(0, 3).join("/")) ? finalUrl.replace(BASE, "") : null;
      for (const vp of VIEWPORTS) {
        await page.setViewportSize({ width: vp.w, height: vp.h });
        await page.waitForTimeout(400);
        const m = await page.evaluate(MEASURE).catch(e => ({ error: String(e).slice(0, 60) }));
        rec.results[vp.name] = m;
        if (m.overflow > 4) { rec.status = "FAIL"; }
        if (vp.name === "mobile") rec.textLen = m.textLen;
      }
      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(dir, `${slug}.png`), fullPage: true }).catch(() => {});
    } catch (e) { rec.status = "ERROR"; rec.error = String(e).slice(0, 100); }
    const flags = [];
    if (rec.status === "FAIL") flags.push(Object.entries(rec.results).filter(([, v]) => v.overflow > 4).map(([k, v]) => `${k}+${v.overflow}`).join(" "));
    if (rec.redirected) flags.push(`->${rec.redirected}`);
    if ((rec.textLen || 0) < 200) flags.push(`thin(${rec.textLen})`);
    console.log(`${rec.status === "pass" ? "ok" : rec.status.padEnd(5)} ${rel.padEnd(38)} http=${rec.http} ${flags.join(" ")}`);
    report.push(rec);
  }
  await browser.close();
  writeFileSync(path.join(repoRoot, `portal-report.${GROUP}.json`), JSON.stringify(report, null, 2));
  const fails = report.filter(r => r.status === "FAIL").length, errs = report.filter(r => r.status === "ERROR").length;
  console.log(`\n== ${GROUP}: ${report.length} pages, ${fails} overflow-FAIL, ${errs} ERROR. Shots: ${dir} ==`);
})();
