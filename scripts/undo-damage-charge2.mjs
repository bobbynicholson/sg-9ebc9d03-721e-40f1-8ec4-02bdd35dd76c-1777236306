import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split(/\r?\n/).filter(l=>l&&!l.startsWith("#")&&l.includes("=")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,"")];}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });
const OID="5b0bc5a4-a33f-417f-bbfc-c046aa1de14a";
const r2 = n => Math.round(n*100)/100;

const { data: inv } = await sb.from("invoices").select("id, invoice_number, subtotal, total_amount, amount_paid, balance_due, notes, invoice_data").eq("order_id",OID).order("created_at",{ascending:true}).limit(1).maybeSingle();
console.log("BEFORE: total", inv.total_amount, "balance_due", inv.balance_due, "items", inv.invoice_data?.items?.length);

// sum the damage lines we're removing
const items = Array.isArray(inv.invoice_data?.items) ? inv.invoice_data.items : [];
const dmgLines = items.filter(it => /damage/i.test(String(it?.description||"")));
const dmgSum = r2(dmgLines.reduce((s,it)=> s + Number(it?.total||0), 0));
console.log("removing", dmgLines.length, "damage line(s) totalling R"+dmgSum);

const keep = items.filter(it => !/damage/i.test(String(it?.description||"")));
const idata = { ...inv.invoice_data, items: keep };
if (typeof idata.subtotal === "number") idata.subtotal = r2(idata.subtotal - dmgSum);
if (typeof idata.total === "number") idata.total = r2(idata.total - dmgSum);

const notes = (inv.notes||"").split("\n").filter(l => !/damage/i.test(l)).join("\n").trim() || null;

const { error: e1 } = await sb.from("invoices").update({
  subtotal: r2(Number(inv.subtotal||0) - dmgSum),
  total_amount: r2(Number(inv.total_amount||0) - dmgSum),
  balance_due: r2(Number(inv.balance_due||0) - dmgSum),
  notes, invoice_data: idata, updated_at: new Date().toISOString(),
}).eq("id", inv.id);
if (e1) { console.log("invoice ERR", e1.message); process.exit(1); }

const { data: dmg } = await sb.from("equipment_damages").select("id").eq("order_id",OID).eq("damage_type","broken").order("created_at",{ascending:false}).limit(1).maybeSingle();
await sb.from("equipment_damages").update({ resolved:false, resolution_notes:null, resolved_at:null, resolved_by_user_id:null }).eq("id", dmg.id);

const { data: after } = await sb.from("invoices").select("total_amount, balance_due, invoice_data").eq("id", inv.id).maybeSingle();
console.log("AFTER:  total", after.total_amount, "balance_due", after.balance_due, "items", after.invoice_data?.items?.length, "-> damage reopened (Open)");
