// Open every role's portal in its OWN visible browser window on localhost,
// each already logged in as that user (real minted session).
//   node scripts/open-all-users-local.mjs [--base http://localhost:3001] [--check]
// --check captures page/permission checks and screenshots in tmp/local-role-check.
import { readFileSync, mkdirSync, existsSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const args = process.argv.slice(2);
const baseIdx = args.indexOf("--base");
const BASE = baseIdx >= 0 ? args[baseIdx + 1] : "http://localhost:3001";
const CHECK = args.includes("--check");
const SLUG = "spit-braai-delivery";
const host = new URL(BASE).hostname;

function parseEnv() {
  const p = path.join(repoRoot, ".env.local");
  const env = { ...process.env };
  if (!existsSync(p)) return env;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const i = t.indexOf("=");
    env[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
  return env;
}
const env = parseEnv();
const url = env.NEXT_PUBLIC_SUPABASE_URL, anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY, svc = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anon) { console.error("Missing Supabase URL or anon key in .env.local"); process.exit(1); }
const admin = svc
  ? createClient(url, svc, { auth: { persistSession: false, autoRefreshToken: false } })
  : null;
const devPassword = env.NEXT_PUBLIC_DEV_USER_PASSWORD || "CateringMS123!";
const storageKey = `sb-${new URL(url).hostname.split(".")[0]}-auth-token`;

// role -> { email, landing }  (landing is the first page to open, includes prefix)
const USERS = [
  { role: "company_admin",    email: "hello@spitbraaidelivery.co.za",                  landing: `/${SLUG}/admin/dashboard` },
  { role: "admin",            email: "admin@spitbraaidelivery.co.za",                 landing: `/${SLUG}/admin/dashboard` },
  { role: "kitchen_staff",    email: "kitchen@spitbraaidelivery.co.za",               landing: `/${SLUG}/team-portal/kitchen/dashboard` },
  { role: "kitchen_manager",  email: "kitchen.manager.demo@spitbraaidelivery.co.za",  landing: `/${SLUG}/team-portal/kitchen/management` },
  { role: "waiter",           email: "waiter.demo@spitbraaidelivery.co.za",             landing: `/${SLUG}/team-portal/waiter/dashboard` },
  { role: "driver",           email: "driver@spitbraaidelivery.co.za",                landing: `/${SLUG}/team-portal/driver/dashboard` },
  { role: "shopping_staff",   email: "shopping@spitbraaidelivery.co.za",              landing: `/${SLUG}/team-portal/shopping/dashboard` },
  { role: "cleaning_staff",   email: "cleaning@spitbraaidelivery.co.za",              landing: `/${SLUG}/team-portal/cleaning/dashboard` },
  { role: "cleaning_manager", email: "cleaning.manager.demo@spitbraaidelivery.co.za", landing: `/${SLUG}/team-portal/cleaning/management` },
  { role: "client",           email: "universalsportmags23@gmail.com",                landing: `/${SLUG}/client-portal/dashboard` },
  { role: "super_admin",      email: "bobby@skylight-digital.co.za",                  landing: `/admin/platform/dashboard` },
];

const b64url = v => Buffer.from(v, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
async function mint(email) {
  const anonC = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  if (!admin) {
    const { data, error } = await anonC.auth.signInWithPassword({
      email,
      password: devPassword,
    });
    if (error || !data?.session) throw new Error(error?.message || "no session");
    return data.session;
  }
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email, options: { redirectTo: "https://cateringms.com/auth/callback" } });
  if (error || !data?.properties?.action_link) throw new Error(error?.message || "no link");
  const r = await fetch(data.properties.action_link, { redirect: "manual" });
  const p = new URLSearchParams(new URL(r.headers.get("location") || "").hash.replace(/^#/, ""));
  const { data: s, error: se } = await anonC.auth.setSession({ access_token: p.get("access_token"), refresh_token: p.get("refresh_token") });
  if (se || !s?.session) throw new Error(se?.message || "no session");
  return s.session;
}
function cookieChunks(session) {
  const enc = `base64-${b64url(JSON.stringify(session))}`, size = 3180, out = [];
  if (enc.length <= size) return [{ name: storageKey, value: enc }];
  for (let i = 0; i < enc.length; i += size) out.push({ name: `${storageKey}.${out.length}`, value: enc.slice(i, i + size) });
  return out;
}

const contexts = [];
const checkDir = path.join(repoRoot, "tmp", "local-role-check");
const checks = [];
if (CHECK) mkdirSync(checkDir, { recursive: true });
const saveChecks = () => CHECK && writeFileSync(path.join(checkDir, "report.json"), JSON.stringify(checks, null, 2));
async function inspectPage(page, route, role) {
  const errors = [], failedRequests = [];
  const onError = e => errors.push(String(e.message).slice(0, 500));
  const onResponse = r => {
    const parsed = new URL(r.url());
    if (r.status() >= 400 && parsed.origin === new URL(BASE).origin)
      failedRequests.push({ path: parsed.pathname, status: r.status() });
  };
  page.on("pageerror", onError); page.on("response", onResponse);
  try {
    const response = await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForTimeout(4500);
    const body = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    const finalPath = new URL(page.url()).pathname;
    const runtimeError = /Application error|Internal Server Error|Unhandled Runtime Error|This page could not be found/.test(body);
    const login = /(^|\/)(login|auth\/login|client\/login)(\/|$)/.test(finalPath);
    const headings = await page.locator("h1,h2").allTextContents();
    const screenshot = `${role}-${route.split("/").filter(Boolean).slice(-2).join("-")}.png`;
    await page.screenshot({ path: path.join(checkDir, screenshot), fullPage: false });
    return { route, finalPath, status: response?.status() || 0,
      loaded: Boolean(response?.ok() && !login && !runtimeError && body.length > 80),
      headings, pageErrors: errors, failedRequests, screenshot };
  } catch (e) { return { route, loaded: false, error: String(e.message).slice(0,500), pageErrors: errors, failedRequests }; }
  finally { page.off("pageerror", onError); page.off("response", onResponse); }
}
async function checkUser(ctx, page, u, session) {
  const profile = admin ? (await admin.from("profiles").select("role,company_id").eq("id",session.user.id).maybeSingle()).data : null;
  const record = { role: u.role, actualRole: profile?.role || null, pages: [], permissions: [] };
  checks.push(record); saveChecks();
  record.pages.push(await inspectPage(page,u.landing,u.role)); saveChecks();
  // Metadata-only endpoint. Do not invoke financial recovery or submit claims.
  const query = profile?.role === "super_admin" && profile?.company_id ? `?company_id=${profile.company_id}` : "";
  const gateway = await ctx.request.get(`${BASE}/api/payment-gateways${query}`, { timeout: 60000 });
  const allowed = ["owner","company_admin","admin","super_admin"].includes(profile?.role);
  record.permissions.push({ endpoint: "/api/payment-gateways", status: gateway.status(),
    expected: allowed ? (profile?.role === "super_admin" && !profile?.company_id ? 400 : 200) : 403 });
  if (["company_admin","admin"].includes(u.role)) {
    for (const route of [`/${SLUG}/admin/payment-gateways`, `/${SLUG}/admin/company-profile`, `/${SLUG}/admin/invoices`]) {
      record.pages.push(await inspectPage(page,route,u.role)); saveChecks();
    }
    await page.goto(`${BASE}${u.landing}`, { waitUntil: "domcontentloaded", timeout:90000 });
  }
  record.ok = record.pages.every(p => p.loaded && !p.pageErrors?.length) && record.permissions.every(p => p.status === p.expected);
  saveChecks(); console.log(`CHECK ${record.ok ? "PASS" : "REVIEW"} [${u.role}] pages=${record.pages.length} gateway=${gateway.status()}`);
  return record;
}
const statusPath = path.join(repoRoot, ".browser-profiles-local", "launch-status.json");
// Never reuse a persistent profile between role launches. Supabase/browser
// auth state can outlive the cookies we seed below, which lets a previous
// role (for example kitchen) replace the intended user after hydration.
// A fresh profile set makes each run deterministic and prevents false
// "authenticated" checks that actually landed on another role's portal.
const runProfileRoot = path.join(
  repoRoot,
  ".browser-profiles-local",
  `run-${Date.now()}`,
);
mkdirSync(path.dirname(statusPath), { recursive: true });
const launchStatus = [];
const saveLaunchStatus = () => writeFileSync(statusPath, JSON.stringify(launchStatus, null, 2));
saveLaunchStatus();
for (const u of USERS) {
  try {
    const session = await mint(u.email);
    const profileDir = path.join(runProfileRoot, u.role);
    mkdirSync(profileDir, { recursive: true });
    const ctx = await chromium.launchPersistentContext(profileDir, {
      headless: false, viewport: null,
      args: ["--new-window", "--disk-cache-size=1", "--media-cache-size=1", "--aggressive-cache-discard"],
    });
    await ctx.addCookies(cookieChunks(session).map(c => ({
      name: c.name, value: c.value, domain: host, path: "/",
      secure: false, httpOnly: false, sameSite: "Lax",
      expires: Math.floor(Date.now() / 1000) + 86400,
    })));
    const page = ctx.pages()[0] || await ctx.newPage();
    // The app uses @supabase/ssr cookies in the browser. Seed those cookies
    // before navigation and do not route through /auth/callback here: that
    // page performs a browser-side Supabase network request, which is not
    // needed for a pre-seeded local test session and can fail independently
    // of the valid session.
    const response = await page.goto(`${BASE}${u.landing}`, { waitUntil: "domcontentloaded", timeout:90000 }).catch(() => null);
    await page.waitForTimeout(800);
    contexts.push(ctx);
    // /api/chat is not an authentication health endpoint: it can return 500
    // when chat persistence/provider configuration is unavailable even
    // though the browser session is valid. The middleware's login redirect
    // and the landing response are the correct local-session check.
    const finalPath = new URL(page.url()).pathname;
    const bouncedToLogin = /(^|\/)(login|auth\/login|client\/login)(\/|$)/.test(finalPath);
    const expectedPath = new URL(`${BASE}${u.landing}`).pathname.replace(/\/$/, "");
    const landedOnExpectedPortal = finalPath.replace(/\/$/, "") === expectedPath;
    const pageStatus = response?.status?.() || 0;
    const authenticated = !bouncedToLogin && landedOnExpectedPortal && pageStatus >= 200 && pageStatus < 400;
    launchStatus.push({ role: u.role, email: u.email, landing: u.landing, authenticated, status: pageStatus, finalUrl: page.url(), checkedAt: new Date().toISOString() });
    saveLaunchStatus();
    console.log(`${authenticated ? "AUTHENTICATED" : "FAILED PORTAL CHECK"} [${u.role}] ${u.email} -> ${page.url()}`);
    if (CHECK) {
      const checked = await checkUser(ctx,page,u,session);
      const landing = checked.pages[0];
      Object.assign(launchStatus[launchStatus.length-1], {
        authenticated: Boolean(landing.loaded && landing.finalPath === expectedPath),
        status: landing.status || 0, checkedAt: new Date().toISOString(),
      });
      saveLaunchStatus();
    }
  } catch (e) {
    launchStatus.push({ role: u.role, email: u.email, landing: u.landing, authenticated: false, status: 0, error: e.message, checkedAt: new Date().toISOString() });
    saveLaunchStatus();
    console.log(`SKIP   [${u.role}] ${u.email}: ${e.message}`);
  }
}
console.log(`\n${contexts.length}/${USERS.length} windows open. Leave this process running; Ctrl+C to close all.`);
await new Promise(() => {});
