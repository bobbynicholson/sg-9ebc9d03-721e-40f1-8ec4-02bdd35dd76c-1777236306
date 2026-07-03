import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split(/\r?\n/).filter(l=>l&&!l.startsWith("#")&&l.includes("=")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,"")];}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });
// nonexistent id -> returns NULL, no mutation. If fn missing -> error mentions the function.
const { data, error } = await sb.rpc("deduct_inventory_stock", { p_item_id: "00000000-0000-0000-0000-000000000000", p_amount: 0 });
if (error) console.log("deduct_inventory_stock:", /does not exist|could not find/i.test(error.message) ? "NOT APPLIED YET" : "present (err: "+error.message+")");
else console.log("deduct_inventory_stock: LIVE (returned", JSON.stringify(data)+", no row touched)");
