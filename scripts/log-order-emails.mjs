import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split(/\r?\n/).filter(l=>l&&!l.startsWith("#")&&l.includes("=")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,"")];}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });
const OID="5b0bc5a4-a33f-417f-bbfc-c046aa1de14a";
const { data: o } = await sb.from("orders").select("order_number, client_email, client_name").eq("id",OID).maybeSingle();
const now = new Date().toISOString();
const rows = [
  { template_type:"order_confirmation",      subject:`Booking confirmed - ${o.order_number}` },
  { template_type:"balance_invoice_issued",  subject:`Invoice INV-005554` },
  { template_type:"review_request",          subject:`Thank you!` },
].map(r => ({ order_id:OID, template_type:r.template_type, status:"sent", recipient_email:o.client_email, recipient_name:o.client_name, subject:r.subject, sent_at:now }));
const { data, error } = await sb.from("email_automation_log").insert(rows).select("template_type, status");
console.log(error ? "ERR -> "+error.message : "Logged "+data.length+" emails: "+data.map(d=>d.template_type).join(", "));
