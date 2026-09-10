import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split(/\r?\n/).filter(l=>l&&!l.startsWith("#")&&l.includes("=")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,"")];}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });
const { data, error } = await sb.from("orders").select("id, order_number, guest_count, total_amount, menu_items").order("created_at",{ascending:false}).limit(30);
if (error) { console.log("ERR", error.message); process.exit(0); }
let withItems=0;
for (const o of (data||[])) {
  const mi = Array.isArray(o.menu_items) ? o.menu_items : [];
  if (!mi.length) continue;
  withItems++;
  if (withItems>5) break;
  console.log(`\n${o.order_number} guests=${o.guest_count} total=R${o.total_amount} items=${mi.length}`);
  for (const it of mi.slice(0,3)) {
    const keys = Object.keys(it);
    console.log(`  qty=${it.quantity} ppp=${it.pricePerPerson} price=${it.price} total=${it.total} name="${(it.name||it.description||'').slice(0,25)}"`);
    console.log(`    keys: ${keys.join(",")}`);
  }
}
console.log(`\norders scanned=${(data||[]).length}, with menu_items=${withItems}`);
