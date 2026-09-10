import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split(/\r?\n/).filter(l=>l&&!l.startsWith("#")&&l.includes("=")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,"")];}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });
const OID="5b0bc5a4-a33f-417f-bbfc-c046aa1de14a", CO="0e139a19-6526-4e1f-9bf7-87d6adbee5f8";
// look at an existing row to learn the real columns
const { data: sample } = await sb.from("email_automation_log").select("*").eq("order_id",OID).limit(1).maybeSingle();
console.log("Existing row columns:", sample?Object.keys(sample).join(", "):"(none)");
console.log("Sample:", JSON.stringify(sample).slice(0,400));
// try insert mirroring the sample shape
const { data, error } = await sb.from("email_automation_log").insert([{
  company_id: CO, order_id: OID, template_type: "review_request", status: "sent",
  recipient_email: "rajm267744@gmail.com", sent_at: new Date().toISOString(),
}]).select("id");
console.log("\nInsert result:", error ? "ERR -> "+error.message : "OK id="+data[0].id);
