import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split(/\r?\n/).filter(l=>l&&!l.startsWith("#")&&l.includes("=")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,"")];}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const sleep = (ms)=>new Promise(r=>setTimeout(r,ms));
const HOST="https://cateringms.com", TOKEN="e877e365-d5b7-4839-b386-d5253f0c1141", SLUG="quick-card-3gg6";
const { data: company } = await sb.from("companies").select("id, owner_id, notification_email").eq("embed_token", TOKEN).single();
const { data: owner } = await sb.from("profiles").select("email").eq("id", company.owner_id).maybeSingle();
const adminTo = company.notification_email || owner?.email;

async function attempt(n){
  const since = new Date(Date.now()-5000).toISOString();
  let r,j;
  try {
    r = await fetch(`${HOST}/api/public/embed/${TOKEN}/submit`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({formSlug:SLUG,payload:{name:"DEPLOY VERIFY",email:"deploy-verify@example.com",phone:"0820000003",event_type:"corporate",event_date:"2026-12-20",guest_count:90,venue:"HQ"},honeypot:"",turnstileToken:"",referrer:"wait-verify"})});
    j = await r.json();
  } catch(e){ console.log(`#${n} submit fetch error: ${e}`); return false; }
  if (!j.leadId){ console.log(`#${n} submit ${r.status}: ${JSON.stringify(j)}`); return false; }
  // poll notification up to ~8s
  let notif=null;
  for (let i=0;i<11;i++){ await sleep(750);
    const { data } = await sb.from("notifications").select("id,title,message,link,notification_type,created_at").eq("recipient_id", company.owner_id).gte("created_at", since).order("created_at",{ascending:false}).limit(5);
    notif=(data||[]).find(x=>(x.link||"").includes(j.leadId)); if (notif) break;
  }
  // email log
  let email=null;
  for (let i=0;i<6;i++){ await sleep(700);
    const { data } = await sb.from("email_automation_log").select("*").gte("created_at", since).order("created_at",{ascending:false}).limit(15);
    email=(data||[]).find(e=>JSON.stringify(e).includes("deploy-verify@example.com")||JSON.stringify(e).includes(String(adminTo))); if (email) break;
  }
  const ok = !!notif;
  console.log(`\n#${n} submit OK leadId=${j.leadId.slice(0,8)}`);
  console.log(`  in-app notification: ${notif?`FOUND -> "${notif.title}" | ${notif.message}`:"not yet"}`);
  if (email){ const to=email.recipient_email||email.to_email||email.recipient||email.to; console.log(`  email log: template=${email.template_type||email.template} to=${to} status=${email.status}${(email.error_message||email.error)?` error="${email.error_message||email.error}"`:""}`);}
  else console.log(`  email log: none found`);
  // cleanup
  await sb.from("embed_form_submissions").delete().eq("lead_id", j.leadId);
  await sb.from("leads").delete().eq("id", j.leadId);
  if (notif) await sb.from("notifications").delete().eq("id", notif.id);
  if (email?.id) await sb.from("email_automation_log").delete().eq("id", email.id);
  return ok;
}

console.log(`Admin email target: ${adminTo}`);
console.log("Waiting for Vercel deploy, then verifying (up to ~8 min)...");
let done=false;
for (let n=1;n<=10 && !done;n++){
  done = await attempt(n);
  if (done){ console.log("\n✅ Notification now fires after submit. Deploy is live and the fix works."); break; }
  if (n<10){ console.log("  -> not live yet / not landed, waiting 45s..."); await sleep(45000); }
}
if (!done) console.log("\n❌ Still not landing after retries. May need more deploy time or further investigation.");
process.exit(0);
