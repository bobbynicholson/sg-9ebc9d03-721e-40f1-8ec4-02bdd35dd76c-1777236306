import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split(/\r?\n/).filter(l=>l&&!l.startsWith("#")&&l.includes("=")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,"")];}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });
const CO="0e139a19-6526-4e1f-9bf7-87d6adbee5f8";
const r2=n=>Math.round(Number(n||0)*100)/100, near=(a,b,t=0.02)=>Math.abs(r2(a)-r2(b))<=t;
const { data: orders } = await sb.from("orders").select("id, order_number, status, total_amount, balance_amount, balance_paid").eq("company_id",CO).is("deleted_at",null).order("created_at",{ascending:false}).limit(500);
const live = (orders||[]).filter(o=>!["cancelled","draft"].includes(String(o.status||"").toLowerCase()));
const ids = live.map(o=>o.id);
const { data: invs } = await sb.from("invoices").select("order_id, invoice_number, total_amount, amount_paid, balance_due, status").in("order_id",ids).is("deleted_at",null);
const byOrder=new Map(); for(const i of (invs||[])){ if(["voided","written_off"].includes(String(i.status||"").toLowerCase()))continue; (byOrder.get(i.order_id)||byOrder.set(i.order_id,[]).get(i.order_id)).push(i);}
let issues=0, flagged=new Set();
for(const o of live){
  const iv=byOrder.get(o.id)||[]; const it=r2(iv.reduce((s,i)=>s+Number(i.total_amount||0),0)); const ib=r2(iv.reduce((s,i)=>s+Number(i.balance_due||0),0));
  for(const i of iv){ if(!near(i.balance_due, r2(i.total_amount-i.amount_paid))){console.log(`[invoice_internal] ${o.order_number}: ${i.invoice_number} bal ${i.balance_due} vs ${r2(i.total_amount-i.amount_paid)}`);issues++;flagged.add(o.id);} }
  if(iv.length&&!near(o.total_amount,it)){console.log(`[total] ${o.order_number}: order ${r2(o.total_amount)} vs inv ${it}`);issues++;flagged.add(o.id);}
  if(iv.length&&o.balance_amount!=null&&!near(o.balance_amount,ib)){console.log(`[balance] ${o.order_number}: order ${r2(o.balance_amount)} vs inv ${ib}`);issues++;flagged.add(o.id);}
  const owed=iv.length?ib:(o.balance_amount||0);
  if(o.balance_paid===true&&owed>0.02){console.log(`[paid_flag] ${o.order_number}: paid flag but owed ${owed}`);issues++;flagged.add(o.id);}
}
console.log(`\nScanned ${live.length} orders, ${issues} issues across ${flagged.size} orders.`);
console.log("ORD-003849 flagged?", flagged.has("5b0bc5a4-a33f-417f-bbfc-c046aa1de14a"));
