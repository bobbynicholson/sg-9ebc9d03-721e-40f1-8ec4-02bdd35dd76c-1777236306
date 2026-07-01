// Crawl every platform (super admin) page with a real super_admin
// session and record: final URL (login bounce?), HTTP status, console
// errors, page crashes, and failed same-origin API responses.
//   node scripts/platform-pages-verify.mjs [--base http://localhost:3001] [--shots]
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
const WANT_SHOTS = args.includes("--shots");
const ADMIN_EMAIL = "bobby@skylight-digital.co.za";

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
const anon = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });

async function mintSession() {
  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: ADMIN_EMAIL,
    options: { redirectTo: "https://cateringms.com/auth/callback" },
  });
  if (error || !data?.properties?.action_link) throw new Error(error?.message || "no action link");
  const resp = await fetch(data.properties.action_link, { redirect: "manual" });
  const loc = resp.headers.get("location") || "";
  const params = new URLSearchParams(new URL(loc).hash.replace(/^#/, ""));
  const at = params.get("access_token");
  const rt = params.get("refresh_token");
  if (!at || !rt) throw new Error("magic link returned no tokens");
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

async function main() {
  console.log("minting session for", ADMIN_EMAIL);
  const session = await mintSession();

  const routes = [
    "/admin/platform/dashboard", "/admin/platform/company-database", "/admin/platform/tenant-health",
    "/admin/platform/user-management", "/admin/platform/subscription-management", "/admin/platform/trial-management",
    "/admin/platform/pricing-management", "/admin/platform/financial-dashboard", "/admin/platform/currency-monitoring",
    "/admin/platform/tax-rules", "/admin/platform/tech-costs", "/admin/platform/messaging-templates",
    "/admin/platform/cms-blog", "/admin/platform/cms-pages", "/admin/platform/audit-logs",
    "/admin/platform/running-todo", "/admin/platform/settings", "/admin/platform",
  ];

  const storageKey = `sb-${new URL(supabaseUrl).hostname.split(".")[0]}-auth-token`;
  const browser = await chromium.launch();
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
  const shotsDir = path.join(repoRoot, "screenshots", "platform-verify");
  if (WANT_SHOTS) mkdirSync(shotsDir, { recursive: true });

  for (const route of routes) {
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

    const url = `${BASE_URL}${route}`;
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
    const ok = !crashed && status && status < 400 && !bouncedToLogin && !bodyProbe && pageErrors.length === 0 && failedApi.length === 0;
    results.push({ route, status, ok, bouncedToLogin, bodyProbe, crashed, pageErrors, failedApi, consoleErrors: consoleErrors.slice(0, 4) });
    console.log(`${ok ? "OK  " : "FAIL"} ${String(status).padEnd(4)} ${route}${bouncedToLogin ? " -> LOGIN" : ""}${bodyProbe ? ` [${bodyProbe}]` : ""}${failedApi.length ? ` api:[${failedApi.slice(0, 3).join(" | ")}]` : ""}${pageErrors.length ? ` err:[${pageErrors[0]}]` : ""}`);

    if (WANT_SHOTS && !crashed) {
      const name = route.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");
      await page.screenshot({ path: path.join(shotsDir, `${name}.png`), fullPage: false }).catch(() => {});
    }
  }

  const out = path.join(repoRoot, "screenshots", "platform-verify-results.json");
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(results, null, 2));
  const bad = results.filter((r) => !r.ok);
  console.log(`\n${results.length - bad.length}/${results.length} pages clean. Failures: ${bad.length}`);
  for (const b of bad) console.log(`  ${b.route}: status=${b.status} login=${b.bouncedToLogin} probe=${b.bodyProbe} pageErr=${b.pageErrors[0] || ""} api=${b.failedApi[0] || ""}`);
  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
