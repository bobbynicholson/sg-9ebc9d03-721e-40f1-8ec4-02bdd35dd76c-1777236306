// Backfill cleaning_jobs for IN-PROGRESS handovers that have cleanable
// equipment bookings but no jobs (stale rows delivered before the
// auto-spawn code shipped). Mirrors cleaningHandoverService.generateJobsForHandover.
// Idempotent: skips equipment that already has a job on the handover.
// Only touches status='in_progress' handovers - 'expected' correctly has
// no jobs until the order is delivered.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const estMinutes = (e, method, qty) => {
  if (method === "dishwasher") {
    const pp = e.cleaning_time_dishwasher_minutes;
    if (pp > 0) return Math.max(pp * qty, 1);
    return Math.max(qty * 1, 1);
  }
  const pp = e.cleaning_time_manual_minutes;
  if (pp > 0) return Math.max(pp * qty, 1);
  if (e.cleaning_time_hours) return Math.round(Number(e.cleaning_time_hours) * 60);
  return 20;
};

const { data: handovers, error: hErr } = await sb
  .from("cleaning_event_handovers")
  .select("id, order_id, company_id, status")
  .eq("status", "in_progress")
  .is("deleted_at", null);
if (hErr) { console.log("handover read ERR", hErr.message); process.exit(1); }

let totalCreated = 0;
for (const h of handovers || []) {
  const { data: bookings } = await sb
    .from("equipment_bookings")
    .select("equipment_id, quantity, equipment:equipment_id(name, requires_cleaning, is_hire_in, supplier_cleans, dishwasher_safe, cleaning_time_manual_minutes, cleaning_time_dishwasher_minutes, cleaning_time_hours)")
    .eq("order_id", h.order_id);
  const cleanable = (bookings || []).filter((b) => {
    const e = b.equipment;
    if (!e?.requires_cleaning) return false;
    if (e.is_hire_in && e.supplier_cleans) return false;
    return b.equipment_id && Number(b.quantity || 0) > 0;
  });
  if (cleanable.length === 0) continue;

  const { data: existing } = await sb.from("cleaning_jobs").select("equipment_id").eq("event_handover_id", h.id).is("deleted_at", null);
  const have = new Set((existing || []).map((j) => j.equipment_id));

  for (const b of cleanable) {
    if (have.has(b.equipment_id)) { console.log(`skip (exists): ${b.equipment.name} on ${h.id.slice(0, 8)}`); continue; }
    const e = b.equipment;
    const method = e.dishwasher_safe ? "dishwasher" : "manual";
    const minutes = estMinutes(e, method, Number(b.quantity));
    const start = new Date();
    const end = new Date(start.getTime() + minutes * 60000);
    const { error: insErr } = await sb.from("cleaning_jobs").insert({
      company_id: h.company_id, equipment_id: b.equipment_id, quantity: Number(b.quantity), method,
      event_handover_id: h.id, triggered_by_event_id: h.order_id,
      planned_start: start.toISOString(), planned_end: end.toISOString(), status: "queued",
    });
    if (insErr) { console.log(`INSERT FAILED ${e.name}:`, insErr.message); continue; }
    console.log(`created: ${b.quantity}x ${e.name} (${method}, ~${minutes}min) handover ${h.id.slice(0, 8)}`);
    totalCreated++;
  }
}
console.log(`\nDONE. created ${totalCreated} cleaning job(s) across ${(handovers || []).length} in-progress handover(s).`);
