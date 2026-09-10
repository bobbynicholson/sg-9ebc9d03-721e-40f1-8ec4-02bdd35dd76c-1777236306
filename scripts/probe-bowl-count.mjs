import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split(/\r?\n/).filter(l=>l&&!l.startsWith("#")&&l.includes("=")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,"")];}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });
// full id from the damage row
const { data: dmg } = await sb.from("equipment_damages").select("equipment_id").eq("damage_type","broken").order("created_at",{ascending:false}).limit(1).maybeSingle();
const eqId = dmg?.equipment_id;
const { data: e } = await sb.from("equipment").select("id, name, quantity, available_quantity").eq("id", eqId).maybeSingle();
console.log("Bowl now:", e ? `${e.name}: owned=${e.quantity}, available=${e.available_quantity}` : "(not found)");
console.log("(was owned=108 before the broken flag; broken is permanent so owned should be 107)");
