import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split(/\r?\n/).filter(l=>l&&!l.startsWith("#")&&l.includes("=")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,"")];}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });

// 2. owner profile
const { data: owner } = await sb.from("profiles").select("id, email, full_name, role, active_role, company_id").eq("email","hello@spitbraaidelivery.co.za").maybeSingle();
console.log("OWNER PROFILE:", owner);
const { data: co, error: coErr } = await sb.from("companies").select("*").eq("id", owner.company_id).maybeSingle();
console.log("COMPANY:", co ? { id: co.id, name: co.name } : null, "ERR:", coErr?.message || "none");
if (!co) process.exit(1);

// 3. all company profiles (id, role) to map staff ids
const { data: profs } = await sb.from("profiles").select("id, email, full_name, role, active_role").eq("company_id", co.id);
console.log("COMPANY PROFILES:", (profs||[]).map(p=>`${p.full_name||p.email} role=${p.role} active=${p.active_role} id=${p.id.slice(0,8)}`).join("\n  "));

// 4. ALL kitchen_shifts rows for company 05-11 July (any type, incl deleted)
const { data: shifts, error: shErr } = await sb.from("kitchen_shifts")
  .select("id, staff_id, shift_type, shift_date, planned_start, planned_end, actual_start, actual_end, status, source, deleted_at, created_at, updated_at, order_id")
  .eq("company_id", co.id)
  .gte("shift_date","2026-07-05").lte("shift_date","2026-07-12")
  .order("shift_date",{ascending:true}).order("created_at",{ascending:true});
if (shErr) console.log("kitchen_shifts ERR:", shErr.message);
for (const s of (shifts||[])) {
  const who = (profs||[]).find(p=>p.id===s.staff_id);
  console.log(`SHIFT ${s.shift_date} type=${s.shift_type} staff=${who?.full_name||who?.email||s.staff_id.slice(0,8)} status=${s.status} planned=${s.planned_start||"-"}-${s.planned_end||"-"} actual=${s.actual_start||"-"} -> ${s.actual_end||"-"} deleted=${s.deleted_at?"YES":"no"} created=${s.created_at} updated=${s.updated_at}`);
}

// 5. Pic 85 quote: baby potatoes stored price
const { data: q } = await sb.from("quotes").select("id, quote_number, status, total_amount, delivery_fee, collection_fee, event_date").eq("id","0e627c7a-b0e7-4359-8e25-9d3d75d67735").maybeSingle();
console.log("QUOTE:", q);
if (q) {
  const { data: items, error: qiErr } = await sb.from("quote_items").select("id, item_name, quantity, unit_price, total_price").eq("quote_id", q.id);
  if (qiErr) console.log("quote_items ERR:", qiErr.message);
  for (const it of (items||[])) console.log(`  ITEM ${it.item_name}: qty=${it.quantity} unit=${it.unit_price} total=${it.total_price}`);
}
