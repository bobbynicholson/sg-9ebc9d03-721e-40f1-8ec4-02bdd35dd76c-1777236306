// Inspect real order menu_items/equipment_items shape to judge whether
// per-person items are stored with quantity=guest_count or quantity=1.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split(/\r?\n/).filter(l=>l&&!l.startsWith("#")&&l.includes("=")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,"")];}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });
const { data } = await sb.from("orders")
  .select("id, order_number, guest_count, total_amount, menu_items, equipment_items")
  .not("menu_items", "is", null)
  .order("created_at", { ascending: false })
  .limit(4);
for (const o of (data||[])) {
  console.log(`\n=== ${o.order_number} guests=${o.guest_count} total=R${o.total_amount} ===`);
  const mi = Array.isArray(o.menu_items) ? o.menu_items : [];
  for (const it of mi.slice(0,4)) {
    console.log(`  menu: name="${it.name||it.description}" qty=${it.quantity} ppp=${it.pricePerPerson} price=${it.price} rental=${it.rentalPrice} total=${it.total}`);
    console.log(`        keys: ${Object.keys(it).join(",")}`);
  }
}
