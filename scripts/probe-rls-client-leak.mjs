// CRITICAL security probe: does a logged-in CLIENT see only their own
// orders/clients/invoices, or the whole tenant's? Mints a real client
// JWT and queries via PostgREST with anon key (RLS enforced).
//   node scripts/probe-rls-client-leak.mjs
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split(/\r?\n/).filter(l=>l&&!l.startsWith("#")&&l.includes("=")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,"")];}));
const url = env.NEXT_PUBLIC_SUPABASE_URL, anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY, svc = env.SUPABASE_SERVICE_ROLE_KEY;
const admin = createClient(url, svc, { auth:{persistSession:false} });
const CLIENT_EMAIL = process.argv[2] || "universalsportmags23@gmail.com";

async function mint(email) {
  const anonC = createClient(url, anon, { auth:{persistSession:false} });
  const { data, error } = await admin.auth.admin.generateLink({ type:"magiclink", email, options:{ redirectTo:"https://cateringms.com/auth/callback" } });
  if (error || !data?.properties?.action_link) throw new Error(error?.message||"no link");
  const resp = await fetch(data.properties.action_link, { redirect:"manual" });
  const loc = resp.headers.get("location")||"";
  const p = new URLSearchParams(new URL(loc).hash.replace(/^#/,""));
  const at=p.get("access_token"), rt=p.get("refresh_token");
  if(!at||!rt) throw new Error("no tokens: "+loc.slice(0,120));
  const { data:s } = await anonC.auth.setSession({ access_token:at, refresh_token:rt });
  return { client: anonC, session: s.session, uid: s.session.user.id };
}

const { client, uid } = await mint(CLIENT_EMAIL);
console.log("client uid:", uid);
// What company + client_id is this user actually tied to?
const { data: prof } = await admin.from("profiles").select("company_id, role").eq("id", uid).maybeSingle();
console.log("profile:", prof);
const { data: myClientRows } = await admin.from("clients").select("id").eq("user_id", uid);
const myClientIds = (myClientRows||[]).map(r=>r.id);
console.log("this user's own client_id rows:", myClientIds.length);

async function probe(table) {
  const { data, error, count } = await client.from(table).select("id, company_id", { count:"exact" }).limit(1000);
  if (error) { console.log(`  ${table}: BLOCKED (${error.message})`); return; }
  const n = data?.length||0;
  console.log(`  ${table}: client can read ${count ?? n} rows`);
}
console.log("\n=== rows visible to this CLIENT via RLS ===");
await probe("orders");
await probe("clients");
await probe("invoices");

// Compare to total tenant rows (service role) so we know if it's "all"
if (prof?.company_id) {
  for (const t of ["orders","clients","invoices"]) {
    const { count } = await admin.from(t).select("id",{count:"exact",head:true}).eq("company_id", prof.company_id);
    console.log(`  [tenant total] ${t}: ${count}`);
  }
}
console.log("\nVERDICT: if client-visible ~= tenant total (and > this user's own), the legacy permissive policy is LIVE -> LEAK.");
