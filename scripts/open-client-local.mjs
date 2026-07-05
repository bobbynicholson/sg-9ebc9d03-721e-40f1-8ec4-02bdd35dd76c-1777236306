// Open ONE client's portal in a visible browser window on localhost,
// already logged in as that client (real minted session).
//   node scripts/open-client-local.mjs [email] [--base http://localhost:3001] [--land /path]
import { readFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const args = process.argv.slice(2);
const EMAIL = (args[0] && !args[0].startsWith("--")) ? args[0] : "rajm267744@gmail.com";
const baseIdx = args.indexOf("--base");
const BASE = baseIdx >= 0 ? args[baseIdx + 1] : "http://localhost:3001";
const landIdx = args.indexOf("--land");
const SLUG = "spit-braai-delivery";
const LAND = landIdx >= 0 ? args[landIdx + 1] : `/${SLUG}/client-portal/my-orders`;
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
if (!url || !anon || !svc) { console.error("Missing Supabase env in .env.local"); process.exit(1); }
const admin = createClient(url, svc, { auth: { persistSession: false, autoRefreshToken: false } });
const storageKey = `sb-${new URL(url).hostname.split(".")[0]}-auth-token`;

const b64url = v => Buffer.from(v, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
async function mint(email) {
  const anonC = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
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

const session = await mint(EMAIL);
const profileDir = path.join(repoRoot, ".browser-profiles-local", `client-${EMAIL.replace(/[^a-z0-9]+/gi, "_")}`);
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
await page.goto(`${BASE}${LAND}`, { waitUntil: "domcontentloaded" }).catch(() => {});
console.log(`OPENED client ${EMAIL} -> ${LAND}`);
console.log("Leave this process running; Ctrl+C to close the window.");
await new Promise(() => {});
