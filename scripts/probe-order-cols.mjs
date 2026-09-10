import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split(/\r?\n/).filter(l=>l&&!l.startsWith("#")&&l.includes("=")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,"")];}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });
const { data } = await sb.from("orders").select("*").limit(1).maybeSingle();
const want = ["deposit_paid","balance_paid","inventory_deducted_at","deposit_paid_at","balance_paid_at","cancellation_reason","cancelled_by","cancellation_requested_at"];
for (const c of want) console.log(`  ${c}: ${data && c in data ? "EXISTS" : "-- missing"}`);
