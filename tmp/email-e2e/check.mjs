import { createClient } from "@supabase/supabase-js"; import fs from "fs";
const env = Object.fromEntries(fs.readFileSync(".env.local","utf8").split(/\r?\n/).filter(l=>l.includes("=")&&!l.startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^"|"$/g,"")]}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const st = JSON.parse(fs.readFileSync(`tmp/email-e2e/${process.argv[2]}.json`,"utf8"));
const { data } = await sb.from("orders").select("status").eq("id", st.order_id).single(); console.log("order status now:", data.status);
