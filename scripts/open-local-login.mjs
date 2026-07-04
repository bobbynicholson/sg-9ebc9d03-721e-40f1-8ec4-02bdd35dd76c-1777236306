// Open a visible logged-in browser window per role, pointed at the LOCAL
// dev server (http://localhost:3001) so we can test code changes instantly
// without waiting for a Vercel deploy. Sessions are minted via the service
// role and injected as cookies (domain localhost), so no Supabase redirect
// allow-listing is needed.
//
//   node scripts/open-local-login.mjs            # all roles
//   node scripts/open-local-login.mjs admin driver
//   BASE=http://localhost:3001 node scripts/open-local-login.mjs
import { readFileSync, mkdirSync } from "node:fs";
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
const BASE = process.env.BASE || "http://localhost:3001";
const SLUG = "spit-braai-delivery";
const storageKey = `sb-${new URL(url).hostname.split(".")[0]}-auth-token`;

const USERS = [
  { key: "super-admin",      email: "bobby@skylight-digital.co.za",                    landing: `/admin/platform/dashboard` },
  { key: "company-admin",    email: "hello@spitbraaidelivery.co.za",                   landing: `/${SLUG}/admin/dashboard` },
  { key: "admin",            email: "admin@spitbraaidelivery.co.za",                   landing: `/${SLUG}/admin/dashboard` },
  { key: "kitchen-manager",  email: "kitchen.manager.demo@spitbraaidelivery.co.za",    landing: `/${SLUG}/team-portal/kitchen/today` },
  { key: "kitchen",          email: "kitchen@spitbraaidelivery.co.za",                 landing: `/${SLUG}/team-portal/kitchen/today` },
  { key: "driver",           email: "driver@spitbraaidelivery.co.za",                  landing: `/${SLUG}/team-portal/driver/dashboard` },
  { key: "shopping",         email: "shopping@spitbraaidelivery.co.za",                landing: `/${SLUG}/team-portal/shopping/dashboard` },
  { key: "cleaning-manager", email: "cleaning.manager.demo@spitbraaidelivery.co.za",   landing: `/${SLUG}/team-portal/cleaning/dashboard` },
  { key: "cleaning",         email: "cleaning@spitbraaidelivery.co.za",                landing: `/${SLUG}/team-portal/cleaning/dashboard` },
  { key: "client",           email: "universalsportmags23@gmail.com",                  landing: `/${SLUG}/client-portal/dashboard` },
];

const want = process.argv.slice(2);
const chosen = want.length ? USERS.filter(u => want.includes(u.key)) : USERS;

async function mint(email) {
  const anonC = createClient(url, anon, { auth: { persistSession: false } });
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email, options: { redirectTo: "https://cateringms.com/auth/callback" } });
  if (error || !data?.properties?.action_link) throw new Error(error?.message || "no link");
  const r = await fetch(data.properties.action_link, { redirect: "manual" });
  const p = new URLSearchParams(new URL(r.headers.get("location") || "").hash.replace(/^#/, ""));
  const { data: s } = await anonC.auth.setSession({ access_token: p.get("access_token"), refresh_token: p.get("refresh_token") });
  return s.session;
}
const b64url = v => Buffer.from(v, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
function cookieChunks(session) {
  const enc = `base64-${b64url(JSON.stringify(session))}`, size = 3180, out = [];
  if (enc.length <= size) return [{ name: storageKey, value: enc }];
  for (let i = 0; i < enc.length; i += size) out.push({ name: `${storageKey}.${out.length}`, value: enc.slice(i, i + size) });
  return out;
}

const host = new URL(BASE).hostname;
for (const u of chosen) {
  try {
    const session = await mint(u.email);
    const profileDir = path.join(repoRoot, ".browser-profiles-local", u.key);
    mkdirSync(profileDir, { recursive: true });
    const ctx = await chromium.launchPersistentContext(profileDir, {
      headless: false,
      viewport: null,
      // Disable the browser disk cache so the window always loads the
      // latest dev-server code. Next serves /_next/static with a long
      // immutable cache header, which made reopened windows keep showing
      // stale JS no matter how many times we hard-refreshed (2026-07-04).
      args: ["--new-window", "--disk-cache-size=1", "--media-cache-size=1", "--aggressive-cache-discard"],
    });
    await ctx.addCookies(cookieChunks(session).map(c => ({
      name: c.name, value: c.value, domain: host, path: "/",
      secure: false, httpOnly: false, sameSite: "Lax",
      expires: Math.floor(Date.now() / 1000) + 86400,
    })));
    const page = ctx.pages()[0] || await ctx.newPage();
    await page.goto(`${BASE}${u.landing}`, { waitUntil: "domcontentloaded" }).catch(() => {});
    console.log(`opened ${u.key.padEnd(16)} ${u.email} -> ${BASE}${u.landing}`);
  } catch (e) {
    console.log(`FAILED ${u.key}: ${e.message}`);
  }
}
console.log("\nLocal windows open. Edit code -> save -> the dev server hot-reloads. Ctrl+C here won't close the windows.");
// Keep the process alive so the persistent contexts stay open.
await new Promise(() => {});
