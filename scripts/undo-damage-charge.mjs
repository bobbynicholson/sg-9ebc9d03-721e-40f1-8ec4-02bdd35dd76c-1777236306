import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split(/\r?\n/).filter(l=>l&&!l.startsWith("#")&&l.includes("=")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,"")];}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });
const OID = "5b0bc5a4-a33f-417f-bbfc-c046aa1de14a";
const CHARGE = 10;

// 1. Invoice: find the one that got the damage charge.
const { data: inv } = await sb.from("invoices")
  .select("id, invoice_number, subtotal, tax_amount, total_amount, amount_paid, balance_due, status, notes, invoice_data")
  .eq("order_id", OID).order("created_at",{ascending:true}).limit(1).maybeSingle();
console.log("BEFORE:", inv.invoice_number, "total", inv.total_amount, "balance_due", inv.balance_due, "status", inv.status);

const newSubtotal = Math.round((Number(inv.subtotal||0) - CHARGE) * 100) / 100;
const newTotal = Math.round((Number(inv.total_amount||0) - CHARGE) * 100) / 100;
const newBalance = Math.round((Number(inv.balance_due||0) - CHARGE) * 100) / 100;
// strip the appended damage note line
let notes = inv.notes || "";
notes = notes.split("\n").filter(l => !/Equipment damage:/i.test(l) && !/damage charge/i.test(l)).join("\n").trim() || null;
// strip the damage line from invoice_data.items + roll back its money fields
let idata = inv.invoice_data && typeof inv.invoice_data === "object" ? { ...inv.invoice_data } : null;
if (idata && Array.isArray(idata.items)) {
  idata.items = idata.items.filter(it => !/Equipment damage/i.test(String(it?.description||"")));
  if (typeof idata.subtotal === "number") idata.subtotal = Math.round((idata.subtotal - CHARGE)*100)/100;
  if (typeof idata.total === "number") idata.total = Math.round((idata.total - CHARGE)*100)/100;
  if (typeof idata.balanceDue === "number") idata.balanceDue = Math.round((idata.balanceDue - CHARGE)*100)/100;
}
const { error: invErr } = await sb.from("invoices").update({
  subtotal: newSubtotal, total_amount: newTotal, balance_due: newBalance,
  notes, invoice_data: idata, updated_at: new Date().toISOString(),
}).eq("id", inv.id);
if (invErr) { console.log("invoice update ERR", invErr.message); process.exit(1); }

// 2. Reopen the damage.
const { data: dmg } = await sb.from("equipment_damages")
  .select("id").eq("order_id", OID).eq("damage_type","broken").order("created_at",{ascending:false}).limit(1).maybeSingle();
const { error: dErr } = await sb.from("equipment_damages").update({
  resolved: false, resolution_notes: null, resolved_at: null, resolved_by_user_id: null,
}).eq("id", dmg.id);
if (dErr) { console.log("damage update ERR", dErr.message); }

const { data: after } = await sb.from("invoices").select("invoice_number, total_amount, balance_due, status").eq("id", inv.id).maybeSingle();
console.log("AFTER: ", after.invoice_number, "total", after.total_amount, "balance_due", after.balance_due, "status", after.status, "-> damage reopened");
