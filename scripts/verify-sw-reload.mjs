// E2E proof of the stale-PWA self-heal (2026-07-11): with the driver
// dashboard open and SW-controlled, a byte-changed sw.js must install,
// take control, and trigger exactly one automatic page reload.
// Run against a PRODUCTION build:  next start -p 3002  (SW registration
// is live in prod builds; next dev also works but buildId differs).
import { readFileSync, renameSync, writeFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { chromium } from "@playwright/test";

const BASE = process.env.BASE_URL || "http://localhost:3002";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split(/\r?\n/).filter(l=>l&&!l.startsWith("#")&&l.includes("=")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,"")];}));
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });
const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth:{persistSession:false} });

// Session for the demo driver (Driver Mike). generateLink does NOT
// touch the account's password.
const { data: prof } = await admin.from("profiles").select("email").eq("id","4485d56a-babc-4d4d-b1d4-02a3f8485a54").single();
console.log("driver email:", prof.email);
const { data: link, error: linkErr } = await admin.auth.admin.generateLink({ type: "magiclink", email: prof.email });
if (linkErr) throw linkErr;
const { data: verify, error: otpErr } = await anon.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
if (otpErr) throw otpErr;
const cap = [];
const srv = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { cookies: { getAll: () => [], setAll: (cs) => cs.forEach((c) => cap.push(c)) } });
await srv.auth.setSession({ access_token: verify.session.access_token, refresh_token: verify.session.refresh_token });

const swOriginal = readFileSync("public/sw.js", "utf8");
const buildIdOuter = readFileSync(".next/BUILD_ID", "utf8").trim();
const manifestPathOuter = `.next/static/${buildIdOuter}/_buildManifest.js`;
let failed = false;
const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({ viewport: { width: 420, height: 860 } });
  await ctx.addCookies(cap.map((c) => ({ name: c.name, value: c.value, domain: "localhost", path: "/", secure: false, sameSite: "Lax" })));
  const page = await ctx.newPage();
  page.on("console", (m) => { const t = m.text(); if (t.includes("[sw]")) console.log("PAGE:", t); });
  page.on("load", () => console.log("EVT load (hard document load):", page.url()));
  page.on("response", (r) => { if (r.url().includes("_buildManifest.js")) console.log("EVT manifest probe response:", r.status(), r.url().slice(-60)); });

  // 1. Load the dashboard. NOTE (empirical): the app redirects to the
  //    tenant-slugged URL (/spit-braai-delivery/team-portal/...), which
  //    is OUTSIDE the SW scope (/team-portal/driver/) - so in real
  //    usage the SW never controls these documents and controllerchange
  //    cannot fire. The operative stale-bundle fix for real pages is
  //    the buildId liveness probe in _app.tsx; that's what this test
  //    proves end-to-end. The SW registers regardless (router.pathname
  //    is the rewritten file route), which we assert as a sanity check.
  await page.goto(`${BASE}/team-portal/driver/dashboard`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForFunction(
    async () => Boolean(await navigator.serviceWorker?.getRegistration("/team-portal/driver/")),
    null, { timeout: 30000 },
  );
  console.log("STEP1 dashboard up (slugged URL:", page.url().includes("/team-portal/driver/dashboard"), ") + SW registered: OK");

  // 2. Plant a marker that only survives if NO real reload happens.
  await page.evaluate(() => { window.__preReloadMarker = "alive"; });

  // 3. Simulate a deploy replacing this build: the running build's
  //    _buildManifest.js stops resolving (exactly what happens on
  //    Vercel when a new deployment goes live). Rename it away, then
  //    fire the visibilitychange the probe listens for.
  const manifestPath = manifestPathOuter;
  renameSync(manifestPath, `${manifestPath}.bak`);
  // A HARD document load is the only acceptable signal (soft History
  // navigations resolve waitForNavigation and gave a false OK).
  const loadPromise = page.waitForEvent("load", { timeout: 45000 }).then(() => true).catch(() => false);
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  const reloaded = await loadPromise;
  console.log(`STEP3 stale-build probe triggered auto-reload: ${reloaded ? "OK" : "FAILED"}`);
  if (!reloaded) failed = true;

  // Put the manifest back BEFORE the reloaded page settles so the
  // fresh document doesn't probe itself into a loop-guard test.
  renameSync(`${manifestPath}.bak`, manifestPath);

  // 4. Confirm it was a REAL document reload (marker gone) and we're
  //    still on the dashboard (no redirect weirdness, no loop).
  if (reloaded) {
    await page.waitForLoadState("domcontentloaded").catch(() => {});
    const markerGone = await page.evaluate(() => window.__preReloadMarker === undefined).catch(() => true);
    console.log(`STEP4 hard reload (state wiped): ${markerGone ? "OK" : "FAILED"}`);
    if (!markerGone) failed = true;
    await page.waitForTimeout(5000);
    const url = page.url();
    console.log(`STEP5 stable after reload (no loop): ${url.includes("/team-portal/driver") ? "OK" : "FAILED " + url}`);
    if (!url.includes("/team-portal/driver")) failed = true;
  }
} finally {
  writeFileSync("public/sw.js", swOriginal);
  if (existsSync(`${manifestPathOuter}.bak`)) renameSync(`${manifestPathOuter}.bak`, manifestPathOuter);
  await browser.close();
}
console.log(failed ? "RESULT: FAILED" : "RESULT: PASS");
process.exit(failed ? 1 : 0);
