import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split(/\r?\n/).filter(l=>l&&!l.startsWith("#")&&l.includes("=")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,"")];}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });

const HANDOVER = "12d01b96-eea1-4ab4-8418-ae7a3720e2aa";
const OID = "5b0bc5a4-a33f-417f-bbfc-c046aa1de14a";
const COMPANY = "0e139a19-6526-4e1f-9bf7-87d6adbee5f8";

// cleanable bookings
const { data: bookings, error: bErr } = await sb
  .from("equipment_bookings")
  .select("equipment_id, quantity, equipment:equipment_id(name, requires_cleaning, is_hire_in, supplier_cleans, dishwasher_safe, cleaning_time_manual_minutes, cleaning_time_dishwasher_minutes, cleaning_time_hours)")
  .eq("order_id", OID);
if (bErr) { console.log("bookings ERR", bErr.message); process.exit(1); }
const cleanable = (bookings||[]).filter(b => {
  const e = b.equipment; if (!e?.requires_cleaning) return false;
  if (e.is_hire_in && e.supplier_cleans) return false;
  return b.equipment_id && Number(b.quantity||0) > 0;
});

// idempotency
const { data: existing } = await sb.from("cleaning_jobs").select("equipment_id").eq("event_handover_id", HANDOVER).is("deleted_at", null);
const have = new Set((existing||[]).map(j=>j.equipment_id));

const estMinutes = (e, method, qty) => {
  if (method === "dishwasher") {
    const pp = e.cleaning_time_dishwasher_minutes;
    if (pp>0) return Math.max(pp*qty,1);
    return Math.max(qty*1,1);
  }
  const pp = e.cleaning_time_manual_minutes;
  if (pp>0) return Math.max(pp*qty,1);
  if (e.cleaning_time_hours) return Math.round(Number(e.cleaning_time_hours)*60);
  return 20;
};

let created = 0;
for (const b of cleanable) {
  if (have.has(b.equipment_id)) { console.log("skip (exists):", b.equipment.name); continue; }
  const e = b.equipment;
  const method = e.dishwasher_safe ? "dishwasher" : "manual";
  const minutes = estMinutes(e, method, Number(b.quantity));
  const start = new Date();
  const end = new Date(start.getTime() + minutes*60000);
  const { error: insErr } = await sb.from("cleaning_jobs").insert({
    company_id: COMPANY, equipment_id: b.equipment_id, quantity: Number(b.quantity), method,
    event_handover_id: HANDOVER, triggered_by_event_id: OID,
    planned_start: start.toISOString(), planned_end: end.toISOString(), status: "queued",
  });
  if (insErr) { console.log("INSERT FAILED", e.name, insErr.message); continue; }
  console.log(`created job: ${b.quantity}x ${e.name} (${method}, ~${minutes}min)`);
  created++;
}
console.log("\nDONE. created", created, "jobs for handover", HANDOVER);
