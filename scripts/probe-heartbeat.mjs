import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split(/\r?\n/).filter(l=>l&&!l.startsWith("#")&&l.includes("=")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,"")];}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });
for (const t of ["cron_heartbeats","cron_heartbeat"]) {
  const { data, error } = await sb.from(t).select("*").ilike("name","%email%").order("created_at",{ascending:false}).limit(3);
  if (!error) { console.log(`${t}:`, (data||[]).length, "rows"); for (const r of (data||[])) console.log("  ", JSON.stringify(r).slice(0,160)); }
}
