import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split(/\r?\n/).filter(l=>l&&!l.startsWith("#")&&l.includes("=")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,"")];}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });
const DRIVER="4485d56a-babc-4d4d-b1d4-02a3f8485a54"; // delivery driver
const { data: p } = await sb.from("profiles").select("full_name").eq("id",DRIVER).maybeSingle();
console.log("Driver:", p?.full_name, DRIVER.slice(0,8));
// open generic work sessions
const { data: sws } = await sb.from("staff_work_sessions").select("id, clock_in, clock_out").eq("staff_id",DRIVER).is("clock_out",null);
console.log("OPEN staff_work_sessions:", (sws||[]).length, (sws||[]).map(s=>`in=${s.clock_in?.slice(0,16)}`).join(", "));
// open driver_shifts
for (const t of ["driver_shifts","kitchen_duty_shifts"]) {
  const { data, error } = await sb.from(t).select("id, is_active, actual_end, shift_end, status").eq(t==="kitchen_duty_shifts"?"staff_id":"driver_id",DRIVER);
  if (!error) { const open=(data||[]).filter(s=>s.is_active===true || (s.actual_end===null&&s.shift_end===null&&s.status!=="completed")); console.log(`${t}: ${(data||[]).length} total, ${open.length} open`); }
}
