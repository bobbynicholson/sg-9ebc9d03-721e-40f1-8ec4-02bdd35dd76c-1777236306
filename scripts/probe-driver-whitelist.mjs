// Verifies migration 20260704090000 (driver event-day whitelist) is live.
// Creates a scratch order assigned to the driver, then AS THE DRIVER:
//   1. inserts an at_venue driver_confirmation (fires the SECURITY DEFINER
//      stamp trigger that was aborting POD capture pre-migration)
//   2. writes the POD columns + setup_started_at directly
//   3. negative control: writes a non-whitelisted column (must be DENIED)
// Cleans the scratch rows up afterwards. No real order is touched.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(readFileSync(".env.local", "utf8").split(/\r?\n/)
  .filter(l => l && !l.startsWith("#") && l.includes("="))
  .map(l => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const url = env.NEXT_PUBLIC_SUPABASE_URL, anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY, svc = env.SUPABASE_SERVICE_ROLE_KEY;
const admin = createClient(url, svc, { auth: { persistSession: false } });

const DRIVER_EMAIL = process.argv[2] || "driver@spitbraaidelivery.co.za";

async function mint(email) {
  const anonC = createClient(url, anon, { auth: { persistSession: false } });
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email, options: { redirectTo: "https://cateringms.com/auth/callback" } });
  if (error || !data?.properties?.action_link) throw new Error(error?.message || "no link");
  const resp = await fetch(data.properties.action_link, { redirect: "manual" });
  const loc = resp.headers.get("location") || "";
  const p = new URLSearchParams(new URL(loc).hash.replace(/^#/, ""));
  const at = p.get("access_token"), rt = p.get("refresh_token");
  if (!at || !rt) throw new Error("no tokens: " + loc.slice(0, 120));
  const { data: s } = await anonC.auth.setSession({ access_token: at, refresh_token: rt });
  return { client: anonC, uid: s.session.user.id };
}

const { data: prof } = await admin.from("profiles").select("id, company_id, role").eq("email", DRIVER_EMAIL).maybeSingle();
if (!prof) throw new Error("driver profile not found for " + DRIVER_EMAIL);
console.log("driver:", prof.id, "role:", prof.role, "company:", prof.company_id);

const { data: region } = await admin.from("regions").select("id").eq("company_id", prof.company_id).limit(1).maybeSingle();
const { data: adminProf } = await admin.from("profiles").select("id").eq("company_id", prof.company_id).eq("role", "company_admin").limit(1).maybeSingle();
const { data: anyClient } = await admin.from("clients").select("id").eq("company_id", prof.company_id).limit(1).maybeSingle();

const ins = {
  company_id: prof.company_id,
  user_id: adminProf?.id,
  order_number: "PROBE-" + Math.floor(Math.random() * 1e6),
  event_name: "WHITELIST PROBE - IGNORE",
  client_name: "Probe",
  event_date: "2026-01-01",
  event_time: "12:00",
  venue_address: "1 Probe Street, Cape Town",
  subtotal: 0,
  tax_amount: 0,
  total_amount: 0,
  status: "in_transit",
  assigned_driver_id: prof.id,
  guest_count: 1,
};
if (region?.id) ins.region_id = region.id;
if (anyClient?.id) ins.client_id = anyClient.id;
const { data: scratch, error: insErr } = await admin.from("orders").insert(ins).select("id, order_number").single();
if (insErr) throw insErr;
console.log("scratch order:", scratch.id, scratch.order_number);

let pass = 0, fail = 0;
try {
  const { client: drv } = await mint(DRIVER_EMAIL);

  // 1. The exact path that broke: at_venue confirmation insert.
  const { error: confErr } = await drv.from("driver_confirmations").insert({
    order_id: scratch.id, driver_id: prof.id,
    confirmation_type: "at_venue", confirmed_at: new Date().toISOString(),
  });
  console.log(confErr ? "FAIL at_venue confirmation insert: " + confErr.message
    : "PASS at_venue confirmation insert (trigger stamped arrived_at_venue_at)");
  confErr ? fail++ : pass++;

  // 2. POD columns + setup stamp, as the client code writes them.
  const { error: podErr } = await drv.from("orders").update({
    pod_photo_url: "https://example.com/probe.jpg",
    pod_recipient_name: "Probe",
    pod_captured_at: new Date().toISOString(),
    setup_started_at: new Date().toISOString(),
  }).eq("id", scratch.id);
  console.log(podErr ? "FAIL POD + setup_started_at write: " + podErr.message
    : "PASS POD + setup_started_at write");
  podErr ? fail++ : pass++;

  // 3. Negative control - internal_notes is NOT whitelisted, must deny.
  const { error: denyErr } = await drv.from("orders").update({ internal_notes: "should be denied" }).eq("id", scratch.id);
  console.log(denyErr ? "PASS negative control (internal_notes denied): " + denyErr.message.slice(0, 80)
    : "FAIL negative control: non-whitelisted write was ALLOWED");
  denyErr ? pass++ : fail++;

  const { data: after } = await admin.from("orders").select("arrived_at_venue_at, setup_started_at, pod_captured_at").eq("id", scratch.id).maybeSingle();
  console.log("stamps on scratch order:", after);
} finally {
  await admin.from("driver_confirmations").delete().eq("order_id", scratch.id);
  await admin.from("order_status_history").delete().eq("order_id", scratch.id);
  await admin.from("orders").delete().eq("id", scratch.id);
  console.log("scratch rows cleaned up");
}
console.log(`RESULT: ${pass} pass / ${fail} fail`);
process.exit(fail ? 1 : 0);
