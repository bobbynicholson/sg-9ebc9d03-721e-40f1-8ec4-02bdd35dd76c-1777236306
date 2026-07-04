// Opens all 10 role logins as SEPARATE headed browser windows on localhost, so
// Raj can manually test each portal side by side. Each window is minted with a
// real Supabase session for that role and tagged with a floating role badge.
//
//   node scripts/open-all-roles.mjs
//
// Leave it running; close the browser windows (or Ctrl+C) when done.
import { readFileSync } from "node:fs";
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(readFileSync(".env.local", "utf8").split(/\r?\n/)
  .filter(l => l && !l.startsWith("#") && l.includes("="))
  .map(l => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const url = env.NEXT_PUBLIC_SUPABASE_URL, anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY, svc = env.SUPABASE_SERVICE_ROLE_KEY;
const admin = createClient(url, svc, { auth: { persistSession: false } });
const storageKey = `sb-${new URL(url).hostname.split(".")[0]}-auth-token`;
const BASE = "http://localhost:3001";
const SLUG = "spit-braai-delivery";
const S = `/${SLUG}`;

// The 10 distinct role logins and where each one lands.
const ROLES = [
  { label: "1 PLATFORM super-admin", email: "bobby@skylight-digital.co.za",              land: "/admin/platform/dashboard",       color: "#7c3aed" },
  { label: "2 COMPANY admin",        email: "hello@spitbraaidelivery.co.za",             land: `${S}/admin/dashboard`,            color: "#d97706" },
  { label: "3 KITCHEN manager",      email: "kitchen.manager.demo@spitbraaidelivery.co.za", land: `${S}/team-portal/kitchen/dashboard`,  color: "#dc2626" },
  { label: "4 KITCHEN staff",        email: "kitchen@spitbraaidelivery.co.za",           land: `${S}/team-portal/kitchen/dashboard`,  color: "#ea580c" },
  { label: "5 CLEANING manager",     email: "cleaning.manager.demo@spitbraaidelivery.co.za", land: `${S}/team-portal/cleaning/dashboard`, color: "#0891b2" },
  { label: "6 CLEANING staff",       email: "cleaning@spitbraaidelivery.co.za",          land: `${S}/team-portal/cleaning/dashboard`, color: "#0e7490" },
  { label: "7 DRIVER",               email: "driver@spitbraaidelivery.co.za",            land: `${S}/team-portal/driver/dashboard`,   color: "#2563eb" },
  { label: "8 WAITER",               email: "waiter.demo@spitbraaidelivery.co.za",       land: `${S}/team-portal/waiter/dashboard`,   color: "#16a34a" },
  { label: "9 SHOPPING",             email: "shopping@spitbraaidelivery.co.za",          land: `${S}/team-portal/shopping/dashboard`, color: "#9333ea" },
  { label: "10 CLIENT",              email: "universalsportmags23@gmail.com",            land: `${S}/client-portal/dashboard`,        color: "#0d9488" },
];

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

// Floating badge so each window is instantly identifiable while testing.
const BADGE = (label, color) => `
(() => {
  const add = () => {
    if (!document.body || document.getElementById('__role_badge')) return;
    const d = document.createElement('div');
    d.id = '__role_badge';
    d.textContent = ${JSON.stringify(label)};
    d.style.cssText = 'position:fixed;top:0;left:0;z-index:2147483647;background:${color};color:#fff;font:700 12px system-ui,sans-serif;padding:4px 10px;border-bottom-right-radius:8px;box-shadow:0 2px 6px rgba(0,0,0,.3);pointer-events:none;letter-spacing:.3px';
    document.body.appendChild(d);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', add); else add();
  setInterval(add, 1500); // survive client-side route changes
})();`;

(async () => {
  const W = 1200, H = 820, browsers = [];
  for (let i = 0; i < ROLES.length; i++) {
    const role = ROLES[i];
    const x = 40 + (i % 5) * 70, y = 40 + Math.floor(i / 5) * 90; // cascade so each is grabbable
    try {
      const session = await mint(role.email);
      const browser = await chromium.launch({
        headless: false,
        args: [`--window-size=${W},${H}`, `--window-position=${x},${y}`, "--disk-cache-size=1"],
      });
      const ctx = await browser.newContext({ viewport: null });
      await ctx.addCookies(cookieChunks(session).map(c => ({ name: c.name, value: c.value, domain: "localhost", path: "/", secure: false, httpOnly: false, sameSite: "Lax", expires: Math.floor(Date.now() / 1000) + 86400 })));
      await ctx.addInitScript(BADGE(role.label, role.color));
      const page = await ctx.newPage();
      await page.goto(`${BASE}${role.land}`, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
      browsers.push(browser);
      console.log(`opened  ${role.label.padEnd(24)} ${role.email.padEnd(48)} -> ${role.land}`);
    } catch (e) {
      console.log(`FAILED  ${role.label.padEnd(24)} ${role.email}  ${String(e).slice(0, 100)}`);
    }
  }
  console.log(`\n== ${browsers.length}/${ROLES.length} windows open. Test away. Close the windows or Ctrl+C to stop. ==`);
  await new Promise(() => {}); // keep process (and windows) alive
})();
