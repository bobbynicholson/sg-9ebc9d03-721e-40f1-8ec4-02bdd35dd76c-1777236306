import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split(/\r?\n/).filter(l=>l&&!l.startsWith("#")&&l.includes("=")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,"")];}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const sleep = (ms)=>new Promise(r=>setTimeout(r,ms));
const HOST="https://cateringms.com", TOKEN="e877e365-d5b7-4839-b386-d5253f0c1141", SLUG="quick-card-3gg6";
const { data: company } = await sb.from("companies").select("id, owner_id").eq("embed_token", TOKEN).single();

// 1) Is "lead_received" a valid notification_type? Try a direct service-role insert.
const testNote = { company_id: company.id, user_id: company.owner_id, recipient_id: company.owner_id, notification_type: "lead_received", title: "enum probe", message: "probe", priority: "urgent", link: "/admin/leads" };
const { data: ins, error: insErr } = await sb.from("notifications").insert([testNote]).select("id").single();
if (insErr) console.log("DIRECT insert lead_received -> FAILED:", insErr.code, insErr.message);
else { console.log("DIRECT insert lead_received -> OK (enum accepts it), id=", ins.id); await sb.from("notifications").delete().eq("id", ins.id); }

// 2) Submit a real lead, then poll 20s to see if the async fan-out ever lands.
const since = new Date(Date.now()-5000).toISOString();
const r = await fetch(`${HOST}/api/public/embed/${TOKEN}/submit`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({formSlug:SLUG,payload:{name:"CAUSE TEST",email:"cause-test@example.com",phone:"0820000002",event_type:"wedding",event_date:"2026-12-01",guest_count:60},honeypot:"",turnstileToken:"",referrer:"cause"})});
const j = await r.json();
console.log("\nsubmit ->", r.status, "leadId=", j.leadId);
let found=null;
for (let i=0;i<25;i++){
  await sleep(800);
  const { data } = await sb.from("notifications").select("id, notification_type, title, link, created_at").eq("recipient_id", company.owner_id).gte("created_at", since).order("created_at",{ascending:false}).limit(5);
  found = (data||[]).find(n=>(n.link||"").includes(j.leadId));
  if (found){ console.log(`  notification landed after ~${((i+1)*0.8).toFixed(1)}s: ${found.title}`); break; }
}
if (!found) console.log("  notification NEVER landed within 20s -> confirms fire-and-forget is dropped on serverless");

// cleanup
if (j.leadId){ await sb.from("embed_form_submissions").delete().eq("lead_id", j.leadId); await sb.from("leads").delete().eq("id", j.leadId); if (found) await sb.from("notifications").delete().eq("id", found.id); }
console.log("(cleaned up)");
process.exit(0);
