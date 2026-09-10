// E2E verification of the client magic-link tenant flow against local dev
// (localhost:3001, which talks to the prod DB and runs the FIXED middleware).
//
// Scenarios:
//  A. baseline: client with profile.company_id = tenant -> portal loads
//  B. profile.company_id = NULL (the "client not having a company" case)
//     -> middleware must ALLOW via clients-table membership (was: deny no_company)
//  C. provision endpoint self-heals company_id back onto the profile
//  D. clients row wrongly linked to another user -> provision RECLAIMS it
// Restores all mutated state at the end.
import { readFileSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const repoRoot = "E:/Catering/sg-9ebc9d03-721e-40f1-8ec4-02bdd35dd76c-1777236306";
const BASE = "http://localhost:3001";
const EMAIL = "rajm267744@gmail.com";
const SLUG = "spit-braai-delivery";

const env = {};
for (const line of readFileSync(path.join(repoRoot, ".env.local"), "utf8").split(/\r?\n/)) {
  const t = line.trim();
  if (!t || t.startsWith("#") || !t.includes("=")) continue;
  const i = t.indexOf("=");
  env[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}
const url = env.NEXT_PUBLIC_SUPABASE_URL, anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY, svc = env.SUPABASE_SERVICE_ROLE_KEY;
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
function cookieHeader(session) {
  const enc = `base64-${b64url(JSON.stringify(session))}`, size = 3180;
  if (enc.length <= size) return `${storageKey}=${enc}`;
  const parts = [];
  for (let i = 0, n = 0; i < enc.length; i += size, n++) parts.push(`${storageKey}.${n}=${enc.slice(i, i + size)}`);
  return parts.join("; ");
}
async function get(pathname, cookie) {
  const r = await fetch(`${BASE}${pathname}`, { redirect: "manual", headers: { cookie } });
  const loc = r.headers.get("location") || "";
  return { status: r.status, location: loc };
}

// ── setup: capture current state ──────────────────────────────────────
const { data: prof } = await admin.from("profiles").select("id, company_id, role").eq("email", EMAIL).maybeSingle();
if (!prof) { console.error("test client profile missing"); process.exit(1); }
const { data: clientRow } = await admin.from("clients").select("id, user_id, company_id, email").eq("email", EMAIL).maybeSingle();
if (!clientRow) { console.error("test clients row missing"); process.exit(1); }
const { data: ownerProf } = await admin.from("profiles").select("id").eq("email", "hello@spitbraaidelivery.co.za").maybeSingle();
const originalProfileCompany = prof.company_id;
const originalClientUserId = clientRow.user_id;
console.log("initial:", { profileCompany: prof.company_id, clientUserId: clientRow.user_id });

const session = await mint(EMAIL);
const cookie = cookieHeader(session);
let pass = 0, fail = 0;
const check = (name, ok, detail) => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  (" + detail + ")" : ""}`); };

try {
  // A. baseline
  let r = await get(`/${SLUG}/client-portal/dashboard`, cookie);
  check("A baseline portal loads", r.status === 200, `status=${r.status} loc=${r.location}`);

  // B. null profile.company_id -> membership fallback must allow
  await admin.from("profiles").update({ company_id: null }).eq("id", prof.id);
  r = await get(`/${SLUG}/client-portal/dashboard`, cookie);
  const deniedNoCompany = r.location.includes("error=no_company");
  check("B null-company client allowed via membership", r.status === 200 && !deniedNoCompany, `status=${r.status} loc=${r.location}`);

  // C. provision self-heals company_id
  const provRes = await fetch(`${BASE}/api/auth/client-provision-profile`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ company_slug: SLUG }),
  });
  const provJson = await provRes.json().catch(() => ({}));
  const { data: healed } = await admin.from("profiles").select("company_id").eq("id", prof.id).maybeSingle();
  check("C provision heals profile.company_id", provRes.status === 200 && healed?.company_id === originalProfileCompany, `status=${provRes.status} company=${healed?.company_id} resp=${JSON.stringify(provJson).slice(0, 120)}`);

  // D. wrongly-linked clients row gets reclaimed
  if (ownerProf?.id) {
    await admin.from("clients").update({ user_id: ownerProf.id }).eq("id", clientRow.id);
    const prov2 = await fetch(`${BASE}/api/auth/client-provision-profile`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ company_slug: SLUG }),
    });
    const { data: reclaimed } = await admin.from("clients").select("user_id").eq("id", clientRow.id).maybeSingle();
    check("D provision reclaims wrongly-linked clients row", prov2.status === 200 && reclaimed?.user_id === prof.id, `status=${prov2.status} user_id=${reclaimed?.user_id} expected=${prof.id}`);
  } else {
    console.log("SKIP D - owner profile not found");
  }

  // E. a bogus slug still denies (client must NOT get into arbitrary tenants)
  r = await get(`/some-other-company/client-portal/dashboard`, cookie);
  const allowedWrongly = r.status === 200;
  check("E unknown slug still denied", !allowedWrongly, `status=${r.status} loc=${r.location}`);
} finally {
  // restore
  await admin.from("profiles").update({ company_id: originalProfileCompany }).eq("id", prof.id);
  await admin.from("clients").update({ user_id: prof.id }).eq("id", clientRow.id);
  const { data: finalProf } = await admin.from("profiles").select("company_id").eq("id", prof.id).maybeSingle();
  const { data: finalClient } = await admin.from("clients").select("user_id").eq("id", clientRow.id).maybeSingle();
  console.log("restored:", { profileCompany: finalProf?.company_id, clientUserId: finalClient?.user_id });
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
