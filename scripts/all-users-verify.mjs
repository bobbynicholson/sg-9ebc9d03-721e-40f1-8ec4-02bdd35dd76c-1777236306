// Crawl every role's portal with a real logged-in session per user and
// record: final URL (login bounce?), HTTP status, console errors, page
// crashes, and failed same-origin API responses.
//   node scripts/all-users-verify.mjs [--base http://localhost:3001] [--shots] [--role kitchen_staff]
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const args = process.argv.slice(2);
const baseIdx = args.indexOf("--base");
const BASE_URL = baseIdx >= 0 ? args[baseIdx + 1] : "http://localhost:3001";
const roleIdx = args.indexOf("--role");
const ONLY_ROLE = roleIdx >= 0 ? args[roleIdx + 1] : null;
const WANT_SHOTS = args.includes("--shots");
const SLUG = "spit-braai-delivery";

const USERS = [
  {
    role: "admin",
    email: "admin@spitbraaidelivery.co.za",
    prefix: `/${SLUG}`,
    routes: [
      "/admin/dashboard", "/admin/orders", "/admin/quotes", "/admin/invoices",
      "/admin/calendar", "/admin/menu", "/admin/inventory", "/admin/equipment",
      "/admin/staff", "/admin/notifications", "/admin/settings",
    ],
  },
  {
    role: "kitchen_staff",
    email: "kitchen@spitbraaidelivery.co.za",
    prefix: `/${SLUG}`,
    routes: [
      "/team-portal/kitchen/dashboard", "/team-portal/kitchen/today", "/team-portal/kitchen/prep-list",
      "/team-portal/kitchen/production", "/team-portal/kitchen/menu", "/team-portal/kitchen/stock",
      "/team-portal/kitchen/duty", "/team-portal/kitchen/handovers", "/team-portal/kitchen/notifications",
      "/team-portal/kitchen/settings",
    ],
  },
  {
    role: "kitchen_manager",
    email: "kitchen.manager.demo@spitbraaidelivery.co.za",
    prefix: `/${SLUG}`,
    routes: [
      "/team-portal/kitchen/dashboard", "/team-portal/kitchen/today", "/team-portal/kitchen/production",
      "/team-portal/kitchen/handovers",
    ],
  },
  {
    role: "waiter",
    email: "waiter.demo@spitbraaidelivery.co.za",
    prefix: `/${SLUG}`,
    routes: [
      "/team-portal/waiter/dashboard", "/team-portal/waiter/notifications",
    ],
  },
  {
    role: "driver",
    email: "driver@spitbraaidelivery.co.za",
    prefix: `/${SLUG}`,
    routes: [
      "/team-portal/driver/dashboard", "/team-portal/driver/deliveries", "/team-portal/driver/routes",
      "/team-portal/driver/calendar",
      "/team-portal/driver/earnings", "/team-portal/driver/notifications",
    ],
  },
  {
    role: "shopping_staff",
    email: "shopping@spitbraaidelivery.co.za",
    prefix: `/${SLUG}`,
    routes: [
      "/team-portal/shopping/dashboard", "/team-portal/shopping/buy-list", "/team-portal/shopping/kitchen-demand",
      "/team-portal/shopping/inventory", "/team-portal/shopping/orders", "/team-portal/shopping/suppliers",
      "/team-portal/shopping/invoices", "/team-portal/shopping/receipts", "/team-portal/shopping/alerts",
      "/team-portal/shopping/notifications", "/team-portal/shopping/settings",
    ],
  },
  {
    role: "cleaning_staff",
    email: "cleaning@spitbraaidelivery.co.za",
    prefix: `/${SLUG}`,
    routes: [
      "/team-portal/cleaning/dashboard", "/team-portal/cleaning/tasks", "/team-portal/cleaning/schedules",
      "/team-portal/cleaning/equipment", "/team-portal/cleaning/supplies", "/team-portal/cleaning/damage",
      "/team-portal/cleaning/workflows", "/team-portal/cleaning/notifications", "/team-portal/cleaning/settings",
    ],
  },
  {
    role: "cleaning_manager",
    email: "cleaning.manager.demo@spitbraaidelivery.co.za",
    prefix: `/${SLUG}`,
    routes: ["/team-portal/cleaning/dashboard", "/team-portal/cleaning/tasks", "/team-portal/cleaning/workflows"],
  },
  {
    role: "client",
    email: "universalsportmags23@gmail.com",
    prefix: `/${SLUG}`,
    routes: [
      "/client-portal/dashboard", "/client-portal/quotes", "/client-portal/my-orders",
      "/client-portal/billing", "/client-portal/tracking", "/client-portal/feedback",
      "/client-portal/notifications", "/client-portal/profile",
    ],
  },
  {
    role: "super_admin",
    email: "bobby@skylight-digital.co.za",
    prefix: "",
    routes: [
      "/admin/platform/dashboard", "/admin/platform/company-database", "/admin/platform/user-management",
      "/admin/platform/financial-dashboard", "/admin/platform/subscription-management", "/admin/platform/trial-management",
      "/admin/platform/pricing-management", "/admin/platform/tenant-health", "/admin/platform/tax-rules",
      "/admin/platform/currency-monitoring", "/admin/platform/tech-costs", "/admin/platform/messaging-templates",
      "/admin/platform/cms-pages", "/admin/platform/cms-blog", "/admin/platform/audit-logs",
      "/admin/platform/settings",
    ],
  },
];

function parseEnvFile() {
  const envPath = path.join(repoRoot, ".env.local");
  const env = { ...process.env };
  if (!existsSync(envPath)) return env;
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const i = t.indexOf("=");
    env[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
  return env;
}

const env = parseEnvFile();
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !anonKey || !serviceKey) {
  console.error("Missing Supabase env in .env.local");
  process.exit(1);
}

const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

async function mintSession(email) {
  const anon = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo: "https://cateringms.com/auth/callback" },
  });
  if (error || !data?.properties?.action_link) throw new Error(error?.message || "no action link");
  const resp = await fetch(data.properties.action_link, { redirect: "manual" });
  const loc = resp.headers.get("location") || "";
  const params = new URLSearchParams(new URL(loc).hash.replace(/^#/, ""));
  const at = params.get("access_token");
  const rt = params.get("refresh_token");
  if (!at || !rt) throw new Error(`magic link returned no tokens (${loc.slice(0, 120)})`);
  const { data: s, error: se } = await anon.auth.setSession({ access_token: at, refresh_token: rt });
  if (se || !s?.session) throw new Error(se?.message || "no session");
  return s.session;
}

function b64url(v) {
  return Buffer.from(v, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function cookieChunks(storageKey, session) {
  const encoded = `base64-${b64url(JSON.stringify(session))}`;
  const size = 3180;
  if (encoded.length <= size) return [{ name: storageKey, value: encoded }];
  const out = [];
  for (let i = 0; i < encoded.length; i += size) {
    out.push({ name: `${storageKey}.${out.length}`, value: encoded.slice(i, i + size) });
  }
  return out;
}

async function crawlUser(browser, user, storageKey) {
  let session;
  try {
    session = await mintSession(user.email);
  } catch (e) {
    console.log(`SKIP ${user.role} (${user.email}): session mint failed: ${e.message}`);
    return [{ role: user.role, route: "(session)", ok: false, crashed: true, bodyProbe: `mint failed: ${e.message}`, pageErrors: [], failedApi: [], consoleErrors: [] }];
  }

  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const isLocal = BASE_URL.includes("localhost");
  const cookieDomain = isLocal ? "localhost" : "cateringms.com";
  await context.addCookies(cookieChunks(storageKey, session).map((c) => ({
    name: c.name, value: c.value, domain: cookieDomain, path: "/",
    secure: !isLocal, httpOnly: false, sameSite: "Lax",
    expires: Math.floor(Date.now() / 1000) + 86400,
  })));

  const page = await context.newPage();
  const results = [];
  const shotsDir = path.join(repoRoot, "screenshots", "all-users-verify", user.role);
  if (WANT_SHOTS) mkdirSync(shotsDir, { recursive: true });

  for (const route of user.routes) {
    const consoleErrors = [];
    const failedApi = [];
    const pageErrors = [];
    const onConsole = (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text().slice(0, 260));
    };
    const onResponse = (resp) => {
      try {
        const u = new URL(resp.url());
        const sameOrigin = resp.url().startsWith(BASE_URL) || u.hostname.includes("supabase");
        if (resp.status() >= 400 && sameOrigin && !u.pathname.endsWith(".ico") && !u.pathname.includes("_next/")) {
          failedApi.push(`${resp.status()} ${resp.request().method()} ${u.pathname}${u.search ? u.search.slice(0, 80) : ""}`);
        }
      } catch { /* ignore */ }
    };
    const onPageError = (err) => pageErrors.push(String(err?.message || err).slice(0, 260));
    page.on("console", onConsole);
    page.on("response", onResponse);
    page.on("pageerror", onPageError);

    const url = `${BASE_URL}${user.prefix}${route}`;
    let status = null, finalUrl = "", crashed = false, bodyProbe = "";
    try {
      const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
      status = resp ? resp.status() : null;
      await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
      await page.waitForTimeout(600);
      finalUrl = page.url();
      bodyProbe = await page.evaluate(() => {
        const t = document.body?.innerText || "";
        const bad = ["Application error", "Internal Server Error", "This page could not be found", "Something went wrong", "Unhandled Runtime Error"];
        return bad.find((b) => t.includes(b)) || "";
      }).catch(() => "eval-failed");
    } catch (e) {
      crashed = true;
      bodyProbe = String(e?.message || e).slice(0, 160);
    }

    page.off("console", onConsole);
    page.off("response", onResponse);
    page.off("pageerror", onPageError);

    const bouncedToLogin = /\/login/.test(finalUrl);
    const wrongPortal = finalUrl && !crashed ? !finalUrl.includes(route.split("/")[1]) : false;
    const ok = !crashed && status && status < 400 && !bouncedToLogin && !bodyProbe && pageErrors.length === 0 && failedApi.length === 0;
    results.push({ role: user.role, route, status, ok, bouncedToLogin, wrongPortal, finalUrl: finalUrl.replace(BASE_URL, ""), bodyProbe, crashed, pageErrors, failedApi, consoleErrors: consoleErrors.slice(0, 4) });
    console.log(`${ok ? "OK  " : "FAIL"} ${String(status).padEnd(4)} [${user.role}] ${route}${bouncedToLogin ? " -> LOGIN" : ""}${wrongPortal && !bouncedToLogin ? ` -> ${finalUrl.replace(BASE_URL, "").slice(0, 60)}` : ""}${bodyProbe ? ` [${bodyProbe}]` : ""}${failedApi.length ? ` api:[${failedApi.slice(0, 3).join(" | ")}]` : ""}${pageErrors.length ? ` err:[${pageErrors[0]}]` : ""}`);

    if (WANT_SHOTS && !crashed) {
      const name = route.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");
      await page.screenshot({ path: path.join(shotsDir, `${name}.png`), fullPage: false }).catch(() => {});
    }
  }

  await context.close();
  return results;
}

async function main() {
  const users = ONLY_ROLE ? USERS.filter((u) => u.role === ONLY_ROLE) : USERS;
  if (!users.length) {
    console.error(`No user config for role "${ONLY_ROLE}". Roles: ${USERS.map((u) => u.role).join(", ")}`);
    process.exit(1);
  }
  const storageKey = `sb-${new URL(supabaseUrl).hostname.split(".")[0]}-auth-token`;
  const browser = await chromium.launch();
  const all = [];
  for (const user of users) {
    console.log(`\n=== ${user.role} (${user.email}) — ${user.routes.length} routes ===`);
    all.push(...await crawlUser(browser, user, storageKey));
  }
  await browser.close();

  const out = path.join(repoRoot, "screenshots", "all-users-verify-results.json");
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(all, null, 2));
  const bad = all.filter((r) => !r.ok);
  console.log(`\n${all.length - bad.length}/${all.length} pages clean across ${users.length} users. Failures: ${bad.length}`);
  for (const b of bad) console.log(`  [${b.role}] ${b.route}: status=${b.status} login=${b.bouncedToLogin} probe=${b.bodyProbe} pageErr=${b.pageErrors?.[0] || ""} api=${b.failedApi?.[0] || ""}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
