import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split(/\r?\n/).filter(l=>l&&!l.startsWith("#")&&l.includes("=")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,"")];}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });
const OID = "5b0bc5a4-a33f-417f-bbfc-c046aa1de14a";

const { data: hs, error } = await sb.from("cleaning_event_handovers")
  .select("id, status, total_items_expected, total_items_returned, expected_at, in_progress_at, completed_at")
  .eq("order_id", OID);
if (error) { console.log("ERR", error.message); process.exit(0); }
console.log("HANDOVERS for order:", (hs||[]).length);
for (const h of (hs||[])) {
  console.log(`  ${h.id}  status=${h.status} expected=${h.total_items_expected} returned=${h.total_items_returned} in_progress_at=${h.in_progress_at||"-"} completed=${h.completed_at||"-"}`);
  const { data: jobs } = await sb.from("cleaning_jobs").select("id, status, equipment_id, quantity").eq("event_handover_id", h.id).is("deleted_at", null);
  console.log(`    linked cleaning_jobs: ${(jobs||[]).length}`);
  for (const j of (jobs||[])) console.log(`      ${j.id.slice(0,8)} status=${j.status} eq=${j.equipment_id?.slice(0,8)} qty=${j.quantity}`);
}

// check equipment.requires_cleaning for the order's bookings
const { data: eb } = await sb.from("equipment_bookings").select("equipment_id, quantity, equipment:equipment_id(name, requires_cleaning, is_hire_in, supplier_cleans)").eq("order_id", OID);
console.log("\nBOOKINGS + cleaning flags:");
for (const b of (eb||[])) {
  const e = b.equipment || {};
  console.log(`  ${e.name} qty=${b.quantity} requires_cleaning=${e.requires_cleaning} is_hire_in=${e.is_hire_in} supplier_cleans=${e.supplier_cleans}`);
}
