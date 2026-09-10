import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split(/\r?\n/).filter(l=>l&&!l.startsWith("#")&&l.includes("=")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,"")];}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });
// invoice with an order
const { data: inv } = await sb.from("invoices").select("*").not("order_id","is",null).order("created_at",{ascending:false}).limit(1).maybeSingle();
if (!inv) { console.log("no invoice"); process.exit(0); }
console.log("invoice", inv.invoice_number, "order_id", inv.order_id);
console.log("  subtotal=",inv.subtotal,"tax_amount=",inv.tax_amount,"total_amount=",inv.total_amount);
const idata = inv.invoice_data;
console.log("  invoice_data type:", typeof idata, "has line_items?", idata && typeof idata==="object" && "line_items" in idata);
if (idata && idata.line_items) console.log("  line_items[0]:", JSON.stringify(idata.line_items[0]||null).slice(0,200));
// order_items table
const { data: oi, error: oiErr } = await sb.from("order_items").select("*").eq("order_id", inv.order_id).limit(3);
console.log("\norder_items table:", oiErr ? "ERR "+oiErr.message : `${(oi||[]).length} rows`);
for (const it of (oi||[])) console.log("  ", JSON.stringify(it).slice(0,180));
