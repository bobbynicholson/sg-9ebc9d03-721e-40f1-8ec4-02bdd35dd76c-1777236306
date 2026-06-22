import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split(/\r?\n/).filter(l=>l&&!l.startsWith("#")&&l.includes("=")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,"")];}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });
const COMPANY = "0e139a19-6526-4e1f-9bf7-87d6adbee5f8";
const UID = "0262e82e-8a27-4030-a5b2-1682a508ff5a"; // Jane Cleaner
for (const t of ["cleaning_clock_out", "kitchen_clock_out"]) {
  const { data, error } = await sb.from("notifications").insert([{
    company_id: COMPANY, recipient_id: UID, user_id: UID,
    notification_type: t, title: "PROBE "+t, message: "probe", priority: "low",
  }]).select("id");
  if (error) console.log(`INSERT ${t}: FAILED -> ${error.message}`);
  else { console.log(`INSERT ${t}: OK`); await sb.from("notifications").delete().eq("id", data[0].id); }
}
