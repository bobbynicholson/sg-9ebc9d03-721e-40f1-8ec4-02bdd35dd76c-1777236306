import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split(/\r?\n/).filter(l=>l&&!l.startsWith("#")&&l.includes("=")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,"")];}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });
const { data, error } = await sb.from("invoices").select("id, invoice_number, order_id, total_amount, status, deleted_at, created_at").eq("invoice_number","INV-599519");
console.log("INV-599519 search:", error?error.message:(data||[]).length+" found");
for (const i of (data||[])) console.log(" ", JSON.stringify(i));
