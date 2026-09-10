import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split(/\r?\n/).filter(l=>l&&!l.startsWith("#")&&l.includes("=")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,"")];}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const HOST = process.env.EMBED_HOST || "https://cateringms.com";
const TOKEN = process.env.TOKEN || "e877e365-d5b7-4839-b386-d5253f0c1141";
const SLUG  = process.env.SLUG  || "quick-card-3gg6";
const sleep = (ms)=>new Promise(r=>setTimeout(r,ms));

// Company + owner context
const { data: company } = await sb.from("companies").select("id, company_name, owner_id, notification_email").eq("embed_token", TOKEN).single();
console.log("Company:", company.company_name, "| owner_id:", company.owner_id, "| notification_email:", company.notification_email || "(none)");
const { data: owner } = await sb.from("profiles").select("id, email, phone, phone_number").eq("id", company.owner_id).maybeSingle();
console.log("Owner email:", owner?.email || "(none)", "| owner phone:", owner?.phone || owner?.phone_number || "(none)");

// Any per-company email provider config?
let cfg = null;
for (const t of ["company_email_settings","email_settings","email_configs"]) {
  const { data, error } = await sb.from(t).select("*").eq("company_id", company.id).maybeSingle();
  if (!error && data) { cfg = { table: t, ...data }; break; }
}
console.log("Email provider config:", cfg ? `${cfg.table} provider=${cfg.provider} domain=${cfg.sending_domain||cfg.from_email||"?"} verified=${cfg.domain_verified??cfg.is_verified??"?"}` : "NONE (no tenant email provider configured)");

const since = new Date(Date.now()-60000).toISOString();

// Submit a real lead
const payload = { name:"NOTIFY TEST", email:"notify-test@example.com", phone:"0820000001", event_type:"corporate", event_date:"2026-11-15", guest_count:120, venue:"Test Venue" };
const r = await fetch(`${HOST}/api/public/embed/${TOKEN}/submit`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({formSlug:SLUG,payload,honeypot:"",turnstileToken:"",referrer:"verify-notify"})});
const j = await r.json();
console.log("\nsubmit ->", r.status, JSON.stringify(j));
if (!j.leadId) { console.log("no lead created, aborting"); process.exit(1); }
const leadId = j.leadId;

// Poll for the in-app notification (best-effort async after the response)
let notif = null;
for (let i=0;i<10;i++){
  await sleep(700);
  const { data } = await sb.from("notifications").select("id, notification_type, title, message, priority, recipient_id, link, created_at").eq("recipient_id", company.owner_id).gte("created_at", since).order("created_at",{ascending:false}).limit(5);
  notif = (data||[]).find(n => (n.link||"").includes(leadId) || n.notification_type==="lead_received");
  if (notif) break;
}
console.log("\n=== In-app admin notification ===");
console.log(notif ? `OK  type=${notif.notification_type} priority=${notif.priority}\n    title="${notif.title}"\n    message="${notif.message}"\n    link=${notif.link}` : "NOT FOUND (no lead_received notification for owner within 7s)");

// Poll the email log
let emails = [];
for (let i=0;i<8;i++){
  await sleep(800);
  const { data } = await sb.from("email_automation_log").select("*").gte("created_at", since).order("created_at",{ascending:false}).limit(10);
  emails = (data||[]).filter(e => JSON.stringify(e).includes("notify-test@example.com") || (e.template_type||e.template||"").toString().includes("embed_lead"));
  if (emails.length) break;
}
console.log("\n=== Admin email send ===");
if (!emails.length) console.log("No email_automation_log row found for this lead within ~6s.");
for (const e of emails) {
  const to = e.recipient_email || e.to_email || e.recipient || e.to;
  const status = e.status;
  const err = e.error_message || e.error || "";
  console.log(`  template=${e.template_type||e.template} to=${to} status=${status}${err?` error="${err}"`:""}`);
}

// Cleanup
await sb.from("embed_form_submissions").delete().eq("lead_id", leadId);
await sb.from("leads").delete().eq("id", leadId);
if (notif) await sb.from("notifications").delete().eq("id", notif.id);
for (const e of emails) { if (e.id) await sb.from("email_automation_log").delete().eq("id", e.id); }
console.log("\n(cleaned up lead, submission, notification, email-log rows)");
process.exit(0);
