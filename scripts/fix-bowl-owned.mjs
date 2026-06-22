import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split(/\r?\n/).filter(l=>l&&!l.startsWith("#")&&l.includes("=")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,"")];}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });
// Bowl equipment id from the broken damage row
const { data: dmg } = await sb.from("equipment_damages").select("equipment_id").eq("damage_type","broken").order("created_at",{ascending:false}).limit(1).maybeSingle();
const eqId = dmg.equipment_id;
const { data: before } = await sb.from("equipment").select("name, quantity, available_quantity").eq("id", eqId).maybeSingle();
console.log("Before:", before.name, `owned=${before.quantity} available=${before.available_quantity}`);
// Owned should be 50 (was wrongly dropped to 49); available stays 49.
const { error } = await sb.from("equipment").update({ quantity: 50, available_quantity: 49, updated_at: new Date().toISOString() }).eq("id", eqId);
if (error) { console.log("ERR", error.message); process.exit(1); }
const { data: after } = await sb.from("equipment").select("name, quantity, available_quantity").eq("id", eqId).maybeSingle();
console.log("After: ", after.name, `owned=${after.quantity} available=${after.available_quantity}  -> displays ${after.available_quantity}/${after.quantity}`);
