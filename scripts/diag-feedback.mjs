import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split(/\r?\n/).filter(l=>l&&!l.startsWith("#")&&l.includes("=")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,"")];}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });

const OID = "5b0bc5a4-a33f-417f-bbfc-c046aa1de14a";
const UID = "9c4f41f0-25d7-4f86-b9e2-6d804d97e07e"; // logged-in user from JWT

const { data: o } = await sb.from("orders")
  .select("id, order_number, status, company_id, client_id, client_email, client_name")
  .eq("id", OID).maybeSingle();
console.log("ORDER:", o);

const { data: clientsForUser } = await sb.from("clients")
  .select("id, user_id, company_id, name, email")
  .eq("user_id", UID);
console.log("\nCLIENTS rows for logged-in user:", clientsForUser);

if (o?.client_id) {
  const { data: orderClient } = await sb.from("clients")
    .select("id, user_id, company_id, name, email")
    .eq("id", o.client_id).maybeSingle();
  console.log("\nORDER's client row:", orderClient);
}

const { data: existingFb } = await sb.from("delivery_feedback")
  .select("id, client_id, company_id, overall_rating, created_at")
  .eq("order_id", OID);
console.log("\nExisting feedback for order:", existingFb);

// What would our code resolve? clients where user_id=UID AND company_id=order.company_id
const { data: resolved } = await sb.from("clients")
  .select("id")
  .eq("user_id", UID)
  .eq("company_id", o?.company_id)
  .limit(1).maybeSingle();
console.log("\nResolved client_id for submit (user+order.company):", resolved);
