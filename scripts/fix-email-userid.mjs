import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split(/\r?\n/).filter(l=>l&&!l.startsWith("#")&&l.includes("=")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,"")];}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });
const OID="5b0bc5a4-a33f-417f-bbfc-c046aa1de14a";
// borrow the user_id the existing (visible) email rows use for this order
const { data: existing } = await sb.from("email_automation_log").select("user_id").eq("order_id",OID).not("user_id","is",null).limit(1).maybeSingle();
const uid = existing?.user_id;
console.log("user_id to apply:", uid||"(none found)");
if (uid) {
  const { data, error } = await sb.from("email_automation_log").update({ user_id: uid }).eq("order_id",OID).is("user_id",null).in("template_type",["order_confirmation","balance_invoice_issued","review_request"]).select("template_type");
  console.log(error?"ERR "+error.message:"Updated "+(data||[]).length+" rows with user_id");
}
// re-verify what an order-scoped sent query returns
const { data: sent } = await sb.from("email_automation_log").select("template_type, user_id, status").eq("order_id",OID).eq("status","sent");
console.log("SENT rows now:", (sent||[]).map(r=>`${r.template_type}(uid=${r.user_id?"Y":"NULL"})`).join(", "));
