import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split(/\r?\n/).filter(l=>l&&!l.startsWith("#")&&l.includes("=")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,"")];}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });
const OID = "5b0bc5a4-a33f-417f-bbfc-c046aa1de14a";
const COMPANY = "0e139a19-6526-4e1f-9bf7-87d6adbee5f8";
const CLEANER = "0262e82e-8a27-4030-a5b2-1682a508ff5a";

const { data: o } = await sb.from("orders").select("order_number, status, completed_at").eq("id", OID).single();
console.log("ORDER", o.order_number, "status", o.status, "completed_at", o.completed_at || "-");

// equipment bookings on the order (is there gear to clean?)
const { data: eb } = await sb.from("equipment_bookings").select("id, equipment_id, quantity, status").eq("order_id", OID);
console.log("\nEQUIPMENT BOOKINGS on order:", (eb||[]).length);
for (const b of (eb||[])) console.log(`  eq=${b.equipment_id?.slice(0,8)} qty=${b.quantity} status=${b.status}`);

// cleaning jobs for this order
const { data: cj } = await sb.from("cleaning_jobs").select("id, status, method, quantity, equipment_id").eq("triggered_by_event_id", OID).is("deleted_at", null);
console.log("\nCLEANING JOBS for this order:", (cj||[]).length);
for (const j of (cj||[])) console.log(`  ${j.id.slice(0,8)} status=${j.status} method=${j.method} qty=${j.quantity}`);

// company-wide active cleaning jobs (would block auto clock-out)
const { data: act } = await sb.from("cleaning_jobs").select("id, status").eq("company_id", COMPANY).is("deleted_at", null).in("status", ["queued","in_progress"]);
console.log("\nCOMPANY-WIDE active cleaning jobs (queued/in_progress):", (act||[]).length);

// handovers for this order
const { data: ho } = await sb.from("cleaning_handovers").select("id, status").eq("order_id", OID);
console.log("\nCLEANING HANDOVERS for order:", ho ? (ho.length ? ho.map(h=>h.status).join(", ") : "none") : "(table err)");

// cleaner on-duty status
const { data: duty } = await sb.from("cleaning_duty_logs").select("id, on_duty, duty_started_at").eq("user_id", CLEANER).eq("on_duty", true);
console.log("\nCLEANER on-duty now:", (duty||[]).length ? "YES ("+duty.length+" open)" : "no");
