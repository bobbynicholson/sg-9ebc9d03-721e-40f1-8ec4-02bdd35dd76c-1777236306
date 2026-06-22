import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split(/\r?\n/).filter(l=>l&&!l.startsWith("#")&&l.includes("=")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,"")];}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });
const OID="5b0bc5a4-a33f-417f-bbfc-c046aa1de14a";
// damage reason
const { data: dmg } = await sb.from("equipment_damages").select("description, damage_type, quantity_damaged").eq("order_id",OID).eq("damage_type","broken").limit(1).maybeSingle();
const reason = String(dmg.description||"").trim();
const newDesc = `Damaged equipment charge - ${dmg.quantity_damaged||1}x Bowl (porcelain) (${dmg.damage_type}${reason?`: ${reason}`:""})`;
const { data: inv } = await sb.from("invoices").select("id, invoice_data").eq("order_id",OID).limit(1).maybeSingle();
const idata = { ...inv.invoice_data };
idata.items = (idata.items||[]).map(it => /equipment damage|damaged equipment/i.test(String(it.description||"")) ? { ...it, description: newDesc } : it);
const { error } = await sb.from("invoices").update({ invoice_data: idata, updated_at: new Date().toISOString() }).eq("id", inv.id);
if (error) { console.log("ERR", error.message); process.exit(1); }
console.log("Patched damage line to:", newDesc);
