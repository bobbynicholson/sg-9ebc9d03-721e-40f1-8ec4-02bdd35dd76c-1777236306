import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split(/\r?\n/).filter(l=>l&&!l.startsWith("#")&&l.includes("=")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,"")];}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });
const OID = "5b0bc5a4-a33f-417f-bbfc-c046aa1de14a";
const BOWL = "744ba9e0";

// damage records for the order
const { data: dmgs } = await sb.from("equipment_damages")
  .select("id, equipment_id, quantity_damaged, damage_type, description, photo_url, total_cost, created_at, reported_by")
  .eq("order_id", OID)
  .order("created_at", { ascending: false });
console.log("EQUIPMENT_DAMAGES for order:", (dmgs||[]).length);
for (const d of (dmgs||[])) console.log(`  ${d.damage_type} qty=${d.quantity_damaged} eq=${d.equipment_id?.slice(0,8)} cost=R${d.total_cost} photo=${d.photo_url?"Y":"n"} desc="${d.description||""}"`);

// Bowl equipment counts now
const { data: bowl } = await sb.from("equipment").select("id, name, quantity, available_quantity").like("id", BOWL+"%");
console.log("\nBOWL equipment row:");
for (const e of (bowl||[])) console.log(`  ${e.name}: owned=${e.quantity} available=${e.available_quantity}`);

// recent notifications about equipment_damage
const { data: notifs } = await sb.from("notifications")
  .select("notification_type, title, created_at, recipient_id")
  .eq("related_entity_id", BOWL+"0000-0000-0000-000000000000".slice(0))  // won't match; fallback below
  .limit(1);
const { data: notifs2 } = await sb.from("notifications")
  .select("notification_type, title, created_at")
  .eq("notification_type", "equipment_damage")
  .order("created_at",{ascending:false})
  .limit(5);
console.log("\nRecent equipment_damage notifications:", (notifs2||[]).length);
for (const n of (notifs2||[])) console.log(`  "${n.title}" at ${n.created_at}`);
