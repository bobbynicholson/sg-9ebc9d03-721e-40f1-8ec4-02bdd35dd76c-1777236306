import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split(/\r?\n/).filter(l=>l&&!l.startsWith("#")&&l.includes("=")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,"")];}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });
const OID = "5b0bc5a4-a33f-417f-bbfc-c046aa1de14a";
const COMPANY = "0e139a19-6526-4e1f-9bf7-87d6adbee5f8";

// All cleaning jobs for company (any status), with equipment name resolution
const { data: jobs } = await sb.from("cleaning_jobs")
  .select("id, status, method, quantity, equipment_id, triggered_by_event_id, created_at, deleted_at")
  .eq("company_id", COMPANY)
  .order("created_at", { ascending: false })
  .limit(20);
console.log("CLEANING JOBS (company, latest 20):", (jobs||[]).length);
const eqIds = [...new Set((jobs||[]).map(j=>j.equipment_id).filter(Boolean))];
const { data: eqs } = eqIds.length ? await sb.from("equipment").select("id, name").in("id", eqIds) : { data: [] };
const nameMap = new Map((eqs||[]).map(e=>[e.id, e.name]));
for (const j of (jobs||[])) {
  const nm = nameMap.has(j.equipment_id) ? nameMap.get(j.equipment_id) : "(NO NAME / equipment missing)";
  console.log(`  ${j.id.slice(0,8)} status=${j.status} qty=${j.quantity} eq=${j.equipment_id?.slice(0,8)||"NULL"} name="${nm}" order=${j.triggered_by_event_id?.slice(0,8)||"-"} deleted=${j.deleted_at?"Y":"n"}`);
}

// Equipment bookings on the order + their equipment names
const { data: eb } = await sb.from("equipment_bookings").select("equipment_id, quantity, status").eq("order_id", OID);
const ebIds = [...new Set((eb||[]).map(b=>b.equipment_id).filter(Boolean))];
const { data: ebEqs } = ebIds.length ? await sb.from("equipment").select("id, name").in("id", ebIds) : { data: [] };
const ebNameMap = new Map((ebEqs||[]).map(e=>[e.id, e.name]));
console.log("\nEQUIPMENT BOOKINGS on order:", (eb||[]).length);
for (const b of (eb||[])) console.log(`  eq=${b.equipment_id?.slice(0,8)} name="${ebNameMap.get(b.equipment_id)||"(missing)"}" qty=${b.quantity} status=${b.status}`);

// find handover-ish tables
for (const t of ["cleaning_handovers","cleaning_handover","equipment_handovers","cleaning_intakes"]) {
  const { error } = await sb.from(t).select("id").limit(1);
  console.log(`\ntable ${t}: ${error ? "ERR/"+error.code : "exists"}`);
}
